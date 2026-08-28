import { Router } from 'express';
import db from '../db.js';

const r = Router();
const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));

r.get('/overview', (req, res) => {
  const enterpriseId = req.auth.enterpriseId;
  const projectId = req.query.projectId || '';
  const requestedWindow = String(req.query.window || '30d');
  const windowDays = Math.min(90, Math.max(7, Number.parseInt(requestedWindow, 10) || 30));
  const latest = db.prepare('SELECT MAX(usage_date) latest_date, MAX(ingested_at) latest_at FROM usage_records WHERE enterprise_id = ?').get(enterpriseId);
  if (!latest?.latest_date) return res.json({ ok: true, scope: { enterpriseId, projectId: projectId || null, window: `${windowDays}d` }, kpis: {}, trend: [], projectBreakdown: [], opportunities: [], guardrails: [], source: { grain: '实例 × 自然日', latestAt: null } });

  const cutoff = new Date(`${latest.latest_date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays + 1);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const where = `enterprise_id = ? AND usage_date >= ?${projectId ? ' AND project_id = ?' : ''}`;
  const params = projectId ? [enterpriseId, cutoffDate, projectId] : [enterpriseId, cutoffDate];
  const summary = db.prepare(`SELECT SUM(cost) total_cost, AVG(gpu_utilization) avg_utilization,
    SUM(CASE WHEN gpu_utilization < 20 THEN cost ELSE 0 END) idle_cost,
    COUNT(DISTINCT usage_date) observed_days, SUM(gpu_hours) gpu_hours,
    SUM(carbon_kg) carbon_kg FROM usage_records WHERE ${where}`).get(...params);
  const totalCost = round(summary.total_cost);
  const forecastMonthCost = round(totalCost / Math.max(summary.observed_days, 1) * 30);
  const idleCost = round(summary.idle_cost);

  const trend = db.prepare(`SELECT usage_date date, SUM(cost) cost, AVG(gpu_utilization) utilization,
    SUM(gpu_hours) gpu_hours FROM usage_records WHERE ${where} GROUP BY usage_date ORDER BY usage_date`).all(...params)
    .map(row => ({ date: row.date, cost: round(row.cost), utilization: round(row.utilization, 1), gpuHours: round(row.gpu_hours, 1) }));
  const projectWhere = `u.enterprise_id = ? AND u.usage_date >= ?${projectId ? ' AND u.project_id = ?' : ''}`;
  const projectBreakdown = db.prepare(`SELECT u.project_id project_id, p.name project_name, p.budget budget,
    p.used used, SUM(u.cost) cost, AVG(u.gpu_utilization) utilization
    FROM usage_records u JOIN projects p ON p.id = u.project_id
    WHERE ${projectWhere} GROUP BY u.project_id, p.name, p.budget, p.used ORDER BY cost DESC`).all(...params)
    .map(row => ({ projectId: row.project_id, projectName: row.project_name, cost: round(row.cost), utilization: round(row.utilization, 1), budget: round(row.budget), budgetUsedRate: round((row.used + row.cost) / Math.max(row.budget, 1) * 100, 1) }));
  const opportunities = db.prepare(`SELECT u.instance_id instance_id, i.name instance_name, i.spec spec,
    AVG(u.gpu_utilization) utilization, SUM(u.cost) cost FROM usage_records u
    JOIN instances i ON i.id = u.instance_id WHERE ${projectWhere}
    GROUP BY u.instance_id, i.name, i.spec HAVING AVG(u.gpu_utilization) < 35 ORDER BY cost DESC`).all(...params)
    .map(row => ({ id: `idle-${row.instance_id}`, instanceId: row.instance_id, instanceName: row.instance_name, spec: row.spec, type: '低利用率', utilization: round(row.utilization, 1), currentCost: round(row.cost), estimatedSavings: round(row.cost * 0.65), action: '建议停止、释放或降配', evidence: `窗口内平均 GPU 利用率 ${round(row.utilization, 1)}%` }));
  const guardrails = projectBreakdown.map(project => ({
    code: 'BUDGET_EXPOSURE', projectId: project.projectId, projectName: project.projectName,
    level: project.budgetUsedRate >= 90 ? '高' : project.budgetUsedRate >= 75 ? '中' : '低',
    value: project.budgetUsedRate, unit: '%', message: `${project.projectName} 预算暴露 ${project.budgetUsedRate}%`,
  }));
  opportunities.slice(0, 3).forEach(item => guardrails.push({
    code: 'IDLE_POLICY', instanceId: item.instanceId, instanceName: item.instanceName,
    level: item.utilization < 10 ? '高' : '中', value: item.utilization, unit: '%',
    message: `${item.instanceName} 平均利用率 ${item.utilization}%，建议停止或降配`,
  }));

  // 环比：与上一等长窗口成本对比
  const prevStart = new Date(cutoff);
  prevStart.setUTCDate(prevStart.getUTCDate() - windowDays);
  const prevStartDate = prevStart.toISOString().slice(0, 10);
  const prevWhere = `enterprise_id = ? AND usage_date >= ? AND usage_date < ?${projectId ? ' AND project_id = ?' : ''}`;
  const prevParams = projectId ? [enterpriseId, prevStartDate, cutoffDate, projectId] : [enterpriseId, prevStartDate, cutoffDate];
  const prevCost = db.prepare(`SELECT SUM(cost) c FROM usage_records WHERE ${prevWhere}`).get(...prevParams).c || 0;
  const monthOverMonth = prevCost > 0 ? round(((totalCost - prevCost) / prevCost) * 100, 1) : null;

  // 按 GPU 型号 / 资源方维度
  const whereAliased = `u.enterprise_id = ? AND u.usage_date >= ?${projectId ? ' AND u.project_id = ?' : ''}`;
  const byGpuModel = db.prepare(`SELECT i.gpu_model gpu_model, SUM(u.cost) cost, AVG(u.gpu_utilization) utilization
    FROM usage_records u JOIN instances i ON i.id = u.instance_id WHERE ${whereAliased}
    GROUP BY i.gpu_model ORDER BY cost DESC`).all(...params)
    .map(row => ({ gpuModel: row.gpu_model, cost: round(row.cost), utilization: round(row.utilization, 1) }));
  const byProvider = db.prepare(`SELECT i.provider_id provider_id, p.name provider_name, SUM(u.cost) cost, AVG(u.gpu_utilization) utilization
    FROM usage_records u JOIN instances i ON i.id = u.instance_id LEFT JOIN providers p ON p.id = i.provider_id WHERE ${whereAliased}
    GROUP BY i.provider_id, p.name ORDER BY cost DESC`).all(...params)
    .map(row => ({ providerId: row.provider_id, providerName: row.provider_name || '未知资源方', cost: round(row.cost), utilization: round(row.utilization, 1) }));

  res.json({
    ok: true,
    scope: { enterpriseId, projectId: projectId || null, window: `${windowDays}d`, cutoffDate, latestDate: latest.latest_date },
    kpis: {
      totalCost: { label: '窗口成本', value: totalCost, unit: 'CNY', definition: '筛选窗口内用量记录 cost 之和' },
      avgGpuUtilization: { label: '平均 GPU 利用率', value: round(summary.avg_utilization, 1), unit: '%', definition: '实例日 GPU 利用率算术平均' },
      idleCost: { label: '闲置成本', value: idleCost, unit: 'CNY', definition: 'GPU 利用率低于 20% 的用量成本' },
      forecastMonthCost: { label: '月度成本预测', value: forecastMonthCost, unit: 'CNY', definition: '窗口日均成本 × 30' },
      savingsPotential: { label: '可优化金额', value: round(opportunities.reduce((sum, item) => sum + item.estimatedSavings, 0)), unit: 'CNY', definition: '低利用率实例按 65% 可回收成本估算' },
      carbonKg: { label: '碳排放', value: round(summary.carbon_kg, 1), unit: 'kgCO₂e', definition: '窗口内用量记录的碳排之和' },
      monthOverMonth: { label: '成本环比', value: monthOverMonth, unit: '%', definition: '与上一等长窗口成本相比的变化率' },
    },
    trend, projectBreakdown, byGpuModel, byProvider, opportunities, guardrails,
    source: { grain: '实例 × 自然日', provider: 'provider-metering', latestAt: latest.latest_at, observedDays: summary.observed_days, recordsScope: '当前企业及筛选项目', refreshPolicy: '每日 23:55 汇总' },
  });
});

export default r;

