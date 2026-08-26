import { generateText, gateway } from 'ai';
import db from '../db.js';
import { genId, genNo, now } from '../utils.js';

const MODEL_ID = process.env.AI_ADVISOR_MODEL || 'openai/gpt-5.4-mini';
const STRATEGIES = ['性价比优先', '交付速度优先', '稳定性优先'];

export function validateIntent(input = {}) {
  const errors = [];
  if (!String(input.workloadType || '').trim()) errors.push('请选择工作负载类型');
  if (String(input.workloadType || '').length > 40) errors.push('工作负载类型不能超过 40 个字符');
  if (String(input.modelName || '').length > 100) errors.push('模型或应用名称不能超过 100 个字符');
  if (!Number.isFinite(Number(input.modelSizeB)) || Number(input.modelSizeB) <= 0) errors.push('模型规模必须大于 0');
  if (!Number.isFinite(Number(input.dataSizeGB)) || Number(input.dataSizeGB) < 0) errors.push('数据量不能小于 0');
  if (!Number.isFinite(Number(input.deadlineHours)) || Number(input.deadlineHours) <= 0) errors.push('交付时限必须大于 0');
  if (!Number.isFinite(Number(input.budget)) || Number(input.budget) <= 0) errors.push('预算必须大于 0');
  if (input.compliance && (!Array.isArray(input.compliance) || input.compliance.length > 10)) errors.push('合规约束格式不正确或数量过多');
  return errors;
}

function workloadQuantity(modelSizeB, resource) {
  const vramPerNode = Number.parseFloat(resource.vram) * (Number.parseInt(resource.vram.match(/×(\d+)/)?.[1] || '1', 10));
  const requiredVram = Number(modelSizeB) * 2.4;
  return Math.max(1, Math.min(resource.stock, Math.ceil(requiredVram / Math.max(vramPerNode, 1))));
}

function deliveryMinutes(resource, quantity) {
  const stockPressure = quantity / Math.max(resource.stock, 1);
  return Math.round(8 + stockPressure * 24 + (100 - resource.health) * 0.7);
}

function deterministicExplanation(plan, input) {
  const budgetLabel = plan.totalCost <= Number(input.budget) ? `在 ${Number(input.budget).toLocaleString('zh-CN')} 元预算内` : '超出当前预算，建议缩短时长或调整规格';
  return `${plan.strategy}方案选择 ${plan.spec}，库存、单价、基准性能与可用性均来自当前资源目录快照；预计 ${plan.deliveryMinutes} 分钟交付，${budgetLabel}。`;
}

async function enhanceExplanations(plans, input) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) return { engine: 'deterministic-fallback', plans };
  try {
    const prompt = JSON.stringify({
      intent: input,
      immutableFacts: plans.map(({ planId, strategy, spec, quantity, estimatedHours, totalCost, deliveryMinutes, evidence, risks }) => ({
        planId, strategy, spec, quantity, estimatedHours, totalCost, deliveryMinutes, evidence, risks,
      })),
    });
    const result = await generateText({
      model: gateway(MODEL_ID),
      abortSignal: AbortSignal.timeout(8_000),
      system: '你是企业算力采购顾问。仅解释输入中的不可变事实，不得改写价格、库存、时长、性能、可用性或风险。按 planId 每行输出一段中文解释，格式为“planId|解释”，每段不超过90字。',
      prompt,
    });
    const explanations = new Map(result.text.split('\n').map(line => {
      const split = line.indexOf('|');
      return split > 0 ? [line.slice(0, split).trim(), line.slice(split + 1).trim()] : ['', ''];
    }).filter(([id, value]) => id && value));
    return {
      engine: 'gateway',
      plans: plans.map(plan => ({ ...plan, explanation: explanations.get(plan.planId) || plan.explanation })),
    };
  } catch (error) {
    console.warn('AI advisor explanation fallback:', error.message);
    return { engine: 'deterministic-fallback', plans };
  }
}

export async function createRecommendation(input, auth) {
  let sql = `SELECT r.*, p.name provider_name, p.rating provider_rating
    FROM resources r JOIN providers p ON p.id = r.provider_id
    WHERE r.status = '可售' AND r.stock > 0 AND p.cert_status = '已通过'`;
  const params = [];
  if (input.region) { sql += ' AND r.region = ?'; params.push(input.region); }
  const resources = db.prepare(sql).all(...params);
  if (resources.length < 3) {
    const error = new Error('当前筛选条件下不足 3 个可验证方案，请放宽地域或联系资源运营补充库存');
    error.status = 422;
    throw error;
  }

  const hours = Number(input.deadlineHours);
  const candidates = resources.map(resource => {
    const quantity = workloadQuantity(input.modelSizeB, resource);
    const totalCost = Number((resource.price_hour * quantity * hours).toFixed(2));
    return {
      resource,
      quantity,
      totalCost,
      deliveryMinutes: deliveryMinutes(resource, quantity),
    };
  });
  const picks = [
    [...candidates].sort((a, b) => a.totalCost - b.totalCost)[0],
    [...candidates].sort((a, b) => b.resource.benchmark - a.resource.benchmark || a.deliveryMinutes - b.deliveryMinutes)
      .find(item => item.resource.id !== [...candidates].sort((a, b) => a.totalCost - b.totalCost)[0].resource.id),
    [...candidates].sort((a, b) => b.resource.availability - a.resource.availability || b.resource.health - a.resource.health)
      .find(item => !new Set([
        [...candidates].sort((a, b) => a.totalCost - b.totalCost)[0].resource.id,
        [...candidates].sort((a, b) => b.resource.benchmark - a.resource.benchmark || a.deliveryMinutes - b.deliveryMinutes)
          .find(x => x.resource.id !== [...candidates].sort((a, b) => a.totalCost - b.totalCost)[0].resource.id).resource.id,
      ]).has(item.resource.id)),
  ];

  const quoteAt = now();
  let plans = picks.map((pick, index) => {
    const { resource, quantity, totalCost } = pick;
    const plan = {
      planId: `plan-${index + 1}`,
      strategy: STRATEGIES[index],
      resourceId: resource.id,
      providerName: resource.provider_name,
      spec: resource.spec,
      gpuModel: resource.gpu_model,
      quantity,
      estimatedHours: hours,
      totalCost,
      deliveryMinutes: pick.deliveryMinutes,
      confidence: Number(Math.min(0.99, (resource.availability / 100) * (resource.health / 100)).toFixed(3)),
      evidence: {
        quoteAt,
        stockAtQuote: resource.stock,
        priceHour: resource.price_hour,
        benchmark: resource.benchmark,
        availability: resource.availability,
        health: resource.health,
        region: resource.region,
      },
      risks: [
        ...(totalCost > Number(input.budget) ? ['预计成本超过预算'] : []),
        ...(quantity / resource.stock >= 0.8 ? ['库存余量较低'] : []),
        ...(resource.availability < 99.5 ? ['可用性低于 99.5%'] : []),
      ],
    };
    return { ...plan, explanation: deterministicExplanation(plan, input) };
  });

  const enhanced = await enhanceExplanations(plans, input);
  plans = enhanced.plans;
  const intentId = genId('intent');
  const recommendationId = genId('rec');
  const createdAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO workload_intents
      (id,enterprise_id,member_id,workload_type,model_name,model_size_b,data_size_gb,deadline_hours,budget,region,compliance_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(intentId, auth.enterpriseId, auth.userId, input.workloadType.trim(), input.modelName?.trim() || '', Number(input.modelSizeB), Number(input.dataSizeGB), hours, Number(input.budget), input.region || '', JSON.stringify(input.compliance || []), createdAt);
    db.prepare(`INSERT INTO recommendations
      (id,intent_id,enterprise_id,member_id,engine,model_id,status,plans_json,created_at)
      VALUES (?,?,?,?,?,?,?, ?,?)`).run(recommendationId, intentId, auth.enterpriseId, auth.userId, enhanced.engine, enhanced.engine === 'gateway' ? MODEL_ID : null, '已生成', JSON.stringify(plans), createdAt);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { id: recommendationId, intentId, enterpriseId: auth.enterpriseId, memberId: auth.userId, engine: enhanced.engine, modelId: enhanced.engine === 'gateway' ? MODEL_ID : null, status: '已生成', plans, createdAt };
}

export function createOrderDraft(recommendationId, planId, projectId, auth) {
  const recommendation = db.prepare('SELECT * FROM recommendations WHERE id = ? AND enterprise_id = ?').get(recommendationId, auth.enterpriseId);
  if (!recommendation) {
    const error = new Error('推荐记录不存在或无权访问');
    error.status = 404;
    throw error;
  }
  const plan = JSON.parse(recommendation.plans_json).find(item => item.planId === planId);
  if (!plan) {
    const error = new Error('推荐方案不存在');
    error.status = 404;
    throw error;
  }
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND enterprise_id = ? AND status = ?').get(projectId, auth.enterpriseId, '正常');
  if (!project) {
    const error = new Error('项目不存在、已停用或不属于当前企业');
    error.status = 422;
    throw error;
  }
  const currentResource = db.prepare(`SELECT id,status,stock,price_hour FROM resources WHERE id = ?`).get(plan.resourceId);
  if (!currentResource || currentResource.status !== '可售' || currentResource.stock < plan.quantity) {
    const error = new Error('报价对应资源已不可售或库存不足，请重新生成推荐');
    error.status = 409;
    throw error;
  }

  const rule = JSON.parse(project.approval_rule || '{}');
  const approvalPreview = {
    required: Number(plan.totalCost) >= Number(rule.threshold || 0),
    threshold: Number(rule.threshold || 0),
    levels: Number(rule.levels || 1),
    approverIds: Array.isArray(rule.approvers) ? rule.approvers : [],
  };
  const draft = {
    id: genId('draft'),
    recommendationId,
    planId,
    enterpriseId: auth.enterpriseId,
    memberId: auth.userId,
    projectId,
    resourceId: plan.resourceId,
    quantity: plan.quantity,
    durationHours: plan.estimatedHours,
    amount: plan.totalCost,
    quote: { ...plan, lockedAt: now() },
    status: '草稿',
    approvalPreview,
    createdAt: now(),
  };
  db.prepare(`INSERT INTO order_drafts
    (id,recommendation_id,plan_id,enterprise_id,member_id,project_id,resource_id,quantity,duration_hours,amount,quote_json,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    draft.id, draft.recommendationId, draft.planId, draft.enterpriseId, draft.memberId, draft.projectId,
    draft.resourceId, draft.quantity, draft.durationHours, draft.amount, JSON.stringify(draft.quote), draft.status, draft.createdAt, draft.createdAt,
  );
  db.prepare(`INSERT INTO audit_logs (enterprise_id,user_id,user_name,action,target,created_at) VALUES (?,?,?,?,?,?)`)
    .run(auth.enterpriseId, auth.userId, '成员', '创建订单草稿', `${draft.id} · ${plan.spec} · ${plan.totalCost} 元`, draft.createdAt);
  return draft;
}

export function confirmOrderDraft(draftId, auth) {
  const draft = db.prepare(`SELECT * FROM order_drafts WHERE id = ? AND enterprise_id = ?`).get(draftId, auth.enterpriseId);
  if (!draft) {
    const error = new Error('订单草稿不存在或无权访问');
    error.status = 404;
    throw error;
  }
  if (draft.status !== '待确认') {
    const error = new Error(`当前草稿状态为${draft.status}，不可确认下单`);
    error.status = 409;
    throw error;
  }
  const resource = db.prepare(`SELECT * FROM resources WHERE id = ?`).get(draft.resource_id);
  if (!resource || resource.status !== '可售' || resource.stock < draft.quantity) {
    const error = new Error('资源库存已变化，请重新生成推荐和报价');
    error.status = 409;
    throw error;
  }
  const quote = JSON.parse(draft.quote_json);
  if (Number(quote.totalCost) !== Number(draft.amount) || Number(quote.evidence?.priceHour) !== Number(resource.price_hour)) {
    const error = new Error('资源价格已变化，请重新生成推荐和报价');
    error.status = 409;
    throw error;
  }
  const createdAt = now();
  const orderId = genId('ord');
  const orderNo = genNo('ORD');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO orders
      (id,order_no,enterprise_id,project_id,member_id,resource_id,spec,quantity,duration_hours,billing_type,amount,status,pay_method,created_at)
      VALUES (?,?,?,?,?,?,?,?,?, '按小时',?,'待支付','余额',?)`).run(
      orderId, orderNo, auth.enterpriseId, draft.project_id, auth.userId, draft.resource_id,
      quote.spec, draft.quantity, draft.duration_hours, draft.amount, createdAt,
    );
    db.prepare(`UPDATE order_drafts SET status='已下单',order_id=?,updated_at=? WHERE id=? AND status='待确认'`).run(orderId, createdAt, draft.id);
    db.prepare(`INSERT INTO audit_logs (enterprise_id,user_id,user_name,action,target,created_at) VALUES (?,?,?,?,?,?)`)
      .run(auth.enterpriseId, auth.userId, '成员', '确认推荐订单', `${orderNo} · ${draft.amount} 元`, createdAt);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { id: orderId, orderNo, enterpriseId: auth.enterpriseId, projectId: draft.project_id, resourceId: draft.resource_id, amount: draft.amount, quantity: draft.quantity, durationHours: draft.duration_hours, status: '待支付', createdAt };
}
