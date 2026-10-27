import { Router } from 'express';
import db from '../db.js';
import { now, genId, genNo, notify, auditLog, calcInstanceCost, transitionInstance, STATUS_ACTIONS, RENEW_HOURS } from '../utils.js';

const r = Router();

// ============ 下单 ============
r.post('/create', (req, res) => {
  const { resourceId, quantity = 1, hours, billingType = '按小时', projectId, memberId, enterpriseId, name, imageId, envVars, sshKey, checkpoint = false, autoRelease = false } = req.body || {};
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId);
  if (!resource) return res.status(404).json({ ok: false, msg: '资源不存在' });
  if (resource.status !== '可售') return res.json({ ok: false, msg: '该资源当前不可售', needSubscribe: true });
  if (resource.stock < quantity) return res.json({ ok: false, msg: `库存不足（剩余 ${resource.stock}），可订阅到货提醒`, needSubscribe: true });

  let unitPrice = resource.price_hour;
  if (billingType === '包日') unitPrice = resource.price_day || resource.price_hour * 24;
  if (billingType === '包月') unitPrice = resource.price_month || resource.price_hour * 720;
  const amount = Math.round(unitPrice * quantity * (hours || 1) * 100) / 100;

  // 项目预算与审批判断
  const project = projectId ? db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) : null;
  let needApproval = false;
  if (project && project.approval_rule) {
    const rule = JSON.parse(project.approval_rule);
    if (rule.threshold && amount >= rule.threshold) needApproval = true;
  }

  const orderId = genId('ord');
  const orderNo = genNo('ORD');
  const expires = hours ? new Date(Date.now() + hours * 3600000).toISOString().slice(0, 19).replace('T', ' ') : null;

  db.prepare(`INSERT INTO orders (id,order_no,enterprise_id,project_id,member_id,resource_id,spec,quantity,duration_hours,billing_type,amount,status,pay_method,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'待支付','余额',?)`)
    .run(orderId, orderNo, enterpriseId, projectId, memberId, resourceId, resource.spec, quantity, hours, billingType, amount, now());

  auditLog(enterpriseId, memberId, '成员', '提交租用订单', `${resource.spec} ×${quantity}，金额 ${amount} 元`);

  let approvalMsg = '';
  if (needApproval) {
    // 创建审批
    const approverId = JSON.parse(project.approval_rule).approvers?.[0] || 'u-admin';
    db.prepare(`INSERT INTO approvals (id,type,title,applicant_id,approver_id,project_id,related,detail,status,history,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(genId('ap'), '实例购买', `申请租用 ${resource.spec} ×${quantity}（${billingType}，${hours}小时）`, memberId, approverId, projectId, orderId,
        JSON.stringify({ spec: resource.spec, amount, duration: `${hours}小时`, quantity }), '待审批', '[]', now());
    notify(enterpriseId, approverId, '审批', '待办审批', `新订单需审批：${resource.spec} ×${quantity}（${amount} 元）`, '/approvals');
    approvalMsg = `订单金额超过项目审批阈值，已提交审批（单号 ${orderNo}）`;
  }

  res.json({ ok: true, orderId, orderNo, amount, needApproval, approvalMsg, project });
});

// 支付订单
r.post('/pay', (req, res) => {
  const { orderId } = req.body || {};
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ ok: false, msg: '订单不存在' });
  if (order.status !== '待支付') return res.json({ ok: false, msg: '订单状态不可支付' });

  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(order.enterprise_id);
  if (ent.balance < order.amount) return res.json({ ok: false, msg: `余额不足（当前余额 ${ent.balance} 元），请先充值` });

  db.prepare('UPDATE enterprises SET balance = balance - ? WHERE id = ?').run(order.amount, order.enterprise_id);
  db.prepare(`UPDATE orders SET status='已支付', paid_at=? WHERE id=?`).run(now(), orderId);

  // 创建实例
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(order.resource_id);
  const instId = genId('ins');
  const baseName = (req.body.name) || `${resource.gpu_model.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}-${resource.spec.split('-')[0].toLowerCase()}`;
  const expires = order.duration_hours ? new Date(Date.now() + order.duration_hours * 3600000).toISOString().slice(0, 19).replace('T', ' ') : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const host = `10.${Math.floor(Math.random() * 90) + 10}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;

  const unitPrice = order.billing_type === '包日' ? (resource.price_day || resource.price_hour * 24) : order.billing_type === '包月' ? (resource.price_month || resource.price_hour * 720) : resource.price_hour;

  for (let i = 0; i < order.quantity; i++) {
    db.prepare(`INSERT INTO instances (id,name,order_id,enterprise_id,project_id,member_id,resource_id,provider_id,spec,gpu_model,image,region,status,billing_type,price_hour,ssh_host,ssh_port,ssh_user,checkpoint,created_at,expires_at,current_cost,env_vars,key_name)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        i === 0 ? instId : genId('ins'), `${baseName}${i === 0 ? '' : '-' + (i + 1)}`, orderId, order.enterprise_id, order.project_id, order.member_id,
        resource.id, resource.provider_id, resource.spec, resource.gpu_model, 'PyTorch 2.4 训练镜像', resource.region, '创建中', order.billing_type, unitPrice,
        host, '1022', 'ubuntu', checkpoint ? 1 : 0, now(), expires, 0, JSON.stringify(envVars || []), sshKey || ''
      );
  }
  // 扣库存
  db.prepare('UPDATE resources SET stock = stock - ? WHERE id = ?').run(order.quantity, resource.id);

  // 模拟交付：2 秒后进入运行中
  setTimeout(() => {
    try {
      const rows = db.prepare('SELECT * FROM instances WHERE order_id = ?').all(orderId);
      rows.forEach(ins => {
        db.prepare(`UPDATE instances SET status='运行中' WHERE id=?`).run(ins.id);
        notify(ins.enterprise_id, ins.member_id, '实例', '实例交付成功', `${ins.name} 已可登录（SSH: ${host}:1022），开始计费`, `/instances/${ins.id}`);
      });
      db.prepare(`UPDATE orders SET status='已完成' WHERE id=?`).run(orderId);
    } catch (e) { /* ignore */ }
  }, 2000);

  auditLog(order.enterprise_id, order.member_id, '成员', '支付订单', `${order.order_no}，金额 ${order.amount} 元`);
  res.json({ ok: true, msg: '支付成功，实例交付中', instanceId: instId });
});

// 订单列表
r.get('/list', (req, res) => {
  const { enterpriseId, status } = req.query;
  let sql = `SELECT o.*, p.name project_name FROM orders o LEFT JOIN projects p ON o.project_id = p.id WHERE o.enterprise_id = ?`;
  const params = [enterpriseId];
  if (status && status !== '全部') { sql += ` AND o.status = ?`; params.push(status); }
  sql += ` ORDER BY datetime(o.created_at) DESC`;
  const rows = db.prepare(sql).all(...params);
  res.json({ ok: true, orders: rows });
});

// ============ 实例 ============
r.get('/instances', (req, res) => {
  const { enterpriseId, status, projectId } = req.query;
  let sql = `SELECT i.* FROM instances i WHERE i.enterprise_id = ?`;
  const params = [enterpriseId];
  if (status && status !== '全部') { sql += ` AND i.status = ?`; params.push(status); }
  if (projectId) { sql += ` AND i.project_id = ?`; params.push(projectId); }
  sql += ` ORDER BY datetime(i.created_at) DESC`;
  const rows = db.prepare(sql).all(...params).map(i => ({ ...i, current_cost: calcInstanceCost(i) }));
  res.json({ ok: true, instances: rows });
});

// 实例归属以会话为准：跨企业的实例与不存在的实例返回相同的 404，不暴露对象是否存在
r.get('/instances/:id', (req, res) => {
  const inst = db.prepare('SELECT * FROM instances WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!inst) return res.status(404).json({ ok: false, msg: '实例不存在' });
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(inst.resource_id);
  const alerts = db.prepare('SELECT * FROM alerts WHERE instance_id = ? ORDER BY triggered_at DESC').all(inst.id);
  const snapshots = db.prepare('SELECT * FROM snapshots WHERE instance_id = ?').all(inst.id);
  const actions = STATUS_ACTIONS[inst.status] || [];
  // 监控序列（模拟近1小时）
  const nowTs = Date.now();
  const monitor = { gpu: [], vram: [], cpu: [], mem: [] };
  for (let i = 59; i >= 0; i--) {
    const t = new Date(nowTs - i * 60000).toISOString().slice(11, 16);
    const base = inst.status === '运行中' ? 1 : 0.1;
    monitor.gpu.push({ t, v: Math.round(Math.min(100, Math.max(0, (55 + Math.sin(i / 5) * 25 + Math.random() * 10) * base))) });
    monitor.vram.push({ t, v: Math.round(Math.min(100, Math.max(0, (60 + Math.sin(i / 7) * 20 + Math.random() * 8) * base))) });
    monitor.cpu.push({ t, v: Math.round(Math.min(100, Math.max(0, (35 + Math.cos(i / 4) * 15 + Math.random() * 12) * base))) });
    monitor.mem.push({ t, v: Math.round(Math.min(100, Math.max(0, (48 + Math.sin(i / 6) * 12 + Math.random() * 6) * base))) });
  }
  res.json({ ok: true, instance: { ...inst, current_cost: calcInstanceCost(inst), resource, alerts, snapshots, actions, monitor } });
});

r.post('/instances/:id/action', (req, res) => {
  const { action } = req.body || {};
  // 先做归属校验，再进入状态机：状态机本身只按 ID 工作，不得直接接收未经校验的请求
  const owned = db.prepare('SELECT id FROM instances WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!owned) return res.status(404).json({ ok: false, msg: '实例不存在' });
  const result = transitionInstance(owned.id, action);
  if (!result.ok) return res.json({ ok: false, msg: result.msg });
  const inst = db.prepare('SELECT * FROM instances WHERE id = ?').get(owned.id);
  auditLog(inst.enterprise_id, req.headers['x-user-id'] || 'system', '成员', `${action}实例`, inst.name);
  res.json({ ok: true, msg: `操作成功：${action}`, instance: { ...inst, current_cost: calcInstanceCost(inst) } });
});

// 创建快照
r.post('/instances/:id/snapshot', (req, res) => {
  const inst = db.prepare('SELECT * FROM instances WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!inst) return res.status(404).json({ ok: false, msg: '实例不存在' });
  const name = req.body.name || `snapshot-${Date.now().toString().slice(-6)}`;
  db.prepare('INSERT INTO snapshots VALUES (?,?,?,?,?)').run(genId('snap'), inst.id, name, '120GB', now());
  res.json({ ok: true, msg: '快照创建成功' });
});

// 变更配置：按新旧单价差价补扣费（口径与续费一致：差价 × 168 小时），并切换到目标资源；余额不足拒绝
r.post('/instances/:id/change-spec', (req, res) => {
  const inst = db.prepare('SELECT * FROM instances WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!inst) return res.status(404).json({ ok: false, msg: '实例不存在' });
  if (!['运行中', '已停止'].includes(inst.status)) return res.status(409).json({ ok: false, msg: `当前状态「${inst.status}」不可变更配置` });
  const target = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.body?.resourceId);
  if (!target || target.status !== '可售') return res.status(400).json({ ok: false, msg: '目标规格不可售' });
  if (target.stock < 1) return res.status(409).json({ ok: false, msg: '目标规格库存不足' });
  const diff = Math.max(0, Math.round(((target.price_hour || 0) - (inst.price_hour || 0)) * RENEW_HOURS * 100) / 100);
  const ent = db.prepare('SELECT balance FROM enterprises WHERE id = ?').get(inst.enterprise_id);
  if (diff > 0 && ent.balance < diff) return res.status(402).json({ ok: false, msg: `余额不足（需补差价 ${diff} 元）` });
  db.exec('BEGIN IMMEDIATE');
  try {
    if (diff > 0) db.prepare('UPDATE enterprises SET balance = balance - ? WHERE id = ?').run(diff, inst.enterprise_id);
    db.prepare('UPDATE instances SET resource_id=?, spec=?, gpu_model=?, region=?, price_hour=? WHERE id=?')
      .run(target.id, target.spec, target.gpu_model, target.region, target.price_hour, inst.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  auditLog(inst.enterprise_id, req.auth.userId, '成员', '变更配置', `${inst.name} → ${target.spec}，补差 ${diff} 元`);
  res.json({ ok: true, fee: diff, resourceId: target.id });
});

// 快照恢复：进入“恢复中”状态（提示词 §3.3-A：快照创建/恢复）；恢复完成由后台流程推进，这里只做状态流转
r.post('/instances/:id/restore', (req, res) => {
  const inst = db.prepare('SELECT * FROM instances WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!inst) return res.status(404).json({ ok: false, msg: '实例不存在' });
  if (!['运行中', '已停止', '异常'].includes(inst.status)) return res.status(409).json({ ok: false, msg: `当前状态「${inst.status}」不可恢复快照` });
  db.prepare(`UPDATE instances SET status='恢复中' WHERE id=?`).run(inst.id);
  auditLog(inst.enterprise_id, req.auth.userId, '成员', '恢复快照', inst.name);
  res.json({ ok: true, status: '恢复中' });
});

// 实例计费明细：读取 usage_records 的日用量事实（最近 7 天，按日期升序）
r.get('/instances/:id/usage', (req, res) => {
  const inst = db.prepare('SELECT id FROM instances WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!inst) return res.status(404).json({ ok: false, msg: '实例不存在' });
  const usage = db.prepare(`SELECT usage_date, gpu_hours, gpu_utilization, cost, carbon_kg FROM usage_records
    WHERE instance_id = ? ORDER BY usage_date DESC LIMIT 7`).all(inst.id).reverse();
  res.json({ ok: true, usage });
});

// 日志（模拟）
r.get('/instances/:id/logs', (req, res) => {
  const inst = db.prepare('SELECT * FROM instances WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  const lines = [];
  if (!inst) return res.json({ ok: true, lines });
  const isTrain = inst.image.includes('训练') || inst.image.includes('PyTorch');
  const base = [
    `[INFO] 2026-08-17 ${new Date().toISOString().slice(11, 19)} ComputeX agent started (v1.2.3)`,
    `[INFO] mounting /data (ext4, 4.0TB)`,
    `[INFO] nvidia-smi: ${inst.gpu_model} ×8 detected, driver 550.90`,
  ];
  if (isTrain) {
    base.push(
      `[INFO] loading dataset: 1,024,000 samples (tokenized)`,
      `[INFO] distributed init: 8 GPUs, world_size=8, backend=nccl`,
      `[INFO] epoch 0/3: step 100 loss=1.8321 lr=2.0e-5 time=0.42s/step`,
      `[INFO] epoch 0/3: step 200 loss=1.4412 lr=2.0e-5 time=0.41s/step`,
      `[INFO] epoch 0/3: step 300 loss=1.2287 lr=2.0e-5 time=0.43s/step`,
      `[WARN] step 320: NCCL timeout detected, retrying (1/3)`,
      `[INFO] epoch 0/3: step 400 loss=1.1023 lr=2.0e-5 time=0.40s/step`,
      `[INFO] checkpoint saved: /data/ckpt/epoch0_step400.pt (3.2GB)`,
    );
  } else {
    base.push(
      `[INFO] model loaded: Qwen2-72B (bf16, 8×H100)`,
      `[INFO] vLLM engine started, max_num_seqs=512`,
      `[INFO] serving on http://0.0.0.0:8000`,
      `[INFO] avg p99 latency: 118ms, throughput: 2,340 tok/s`,
    );
  }
  res.json({ ok: true, lines: base });
});

export default r;
