import { Router } from 'express';
import db from '../db.js';
import { calcInstanceCost, listInstances } from '../utils.js';

const r = Router();

r.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const enterpriseId = req.auth.enterpriseId;
  if (q.length < 2) return res.json({ ok: true, results: [] });
  const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
  const resources = db.prepare(`SELECT id,spec,gpu_model,region,status FROM resources WHERE spec LIKE ? ESCAPE '\\' OR gpu_model LIKE ? ESCAPE '\\' LIMIT 5`).all(like, like)
    .map(x => ({ type: '资源', title: x.spec, subtitle: `${x.gpu_model} · ${x.region} · ${x.status}`, path: `/console/market/${x.id}` }));
  const instances = db.prepare(`SELECT id,name,spec,status FROM instances WHERE enterprise_id=? AND (name LIKE ? ESCAPE '\\' OR spec LIKE ? ESCAPE '\\') LIMIT 5`).all(enterpriseId, like, like)
    .map(x => ({ type: '实例', title: x.name, subtitle: `${x.spec} · ${x.status}`, path: `/console/instances/${x.id}` }));
  const bills = db.prepare(`SELECT id,bill_no,period,status FROM bills WHERE enterprise_id=? AND (bill_no LIKE ? ESCAPE '\\' OR period LIKE ? ESCAPE '\\') LIMIT 5`).all(enterpriseId, like, like)
    .map(x => ({ type: '账单', title: x.bill_no, subtitle: `${x.period} · ${x.status}`, path: `/console/bills/${x.id}` }));
  const tickets = db.prepare(`SELECT id,ticket_no,type,status FROM tickets WHERE enterprise_id=? AND (ticket_no LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\') LIMIT 5`).all(enterpriseId, like, like)
    .map(x => ({ type: '工单', title: x.ticket_no, subtitle: `${x.type} · ${x.status}`, path: `/console/tickets/${x.id}` }));
  res.json({ ok: true, results: [...resources, ...instances, ...bills, ...tickets].slice(0, 12) });
});

// 需求方概览
r.get('/overview', (req, res) => {
  const { enterpriseId, projectId } = req.query;
  const instances = listInstances(enterpriseId, { projectId });
  const bills = db.prepare('SELECT * FROM bills WHERE enterprise_id = ? ORDER BY created_at DESC').all(enterpriseId);
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(enterpriseId);
  const projects = db.prepare('SELECT * FROM projects WHERE enterprise_id = ?').all(enterpriseId);

  const running = instances.filter(i => i.status === '运行中').length;
  const error = instances.filter(i => i.status === '异常').length;
  const expiring = instances.filter(i => i.status === '待续费').length;
  // 本月消费：优先按用量事实汇总，无用量时回退到当月账单金额
  const yyyymm = new Date().toISOString().slice(0, 7);
  const usageMonthCost = db.prepare("SELECT COALESCE(SUM(cost),0) AS s FROM usage_records WHERE enterprise_id = ? AND usage_date LIKE ?").get(enterpriseId, `${yyyymm}%`).s;
  const monthBillCost = bills.filter(b => b.period === yyyymm).reduce((s, b) => s + b.amount, 0);
  const monthCost = Number((Number(usageMonthCost) > 0 ? usageMonthCost : monthBillCost).toFixed(2));
  const pendingBills = bills.filter(b => b.status === '待支付').reduce((s, b) => s + b.amount, 0);
  const projectBudget = projects.reduce((s, p) => s + p.budget, 0);
  const projectUsed = projects.reduce((s, p) => s + p.used, 0);

  // 消费趋势：优先按用量事实（近 30 天），无用量时回退到账单分摊模拟
  const trendStart = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const usageTrend = db.prepare(`SELECT usage_date, SUM(cost) cost FROM usage_records WHERE enterprise_id = ? AND usage_date >= ? GROUP BY usage_date ORDER BY usage_date`).all(enterpriseId, trendStart);
  let trend;
  if (usageTrend.length) {
    trend = usageTrend.map(r => ({ t: `${Number(r.usage_date.slice(5, 7))}/${Number(r.usage_date.slice(8, 10))}`, v: Math.round(r.cost) }));
  } else {
    trend = [];
    const base = monthCost / 30 || 800;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const wave = 0.75 + 0.5 * Math.sin(i / 5) + (i === 2 ? 1.6 : 0);
      trend.push({ t: `${d.getMonth() + 1}/${d.getDate()}`, v: Math.round(base * wave) });
    }
  }

  // 实例状态分布
  const statusDist = [
    { name: '运行中', value: running },
    { name: '已停止', value: instances.filter(i => i.status === '已停止').length },
    { name: '待续费', value: expiring },
    { name: '异常', value: error },
    { name: '已释放', value: instances.filter(i => i.status === '已释放').length },
  ].filter(x => x.value > 0);

  // 资源利用率（按项目，来自用量事实）
  const utilByProject = db.prepare(`SELECT u.project_id, p.name, AVG(u.gpu_utilization) utilization FROM usage_records u JOIN projects p ON p.id = u.project_id WHERE u.enterprise_id = ? GROUP BY u.project_id, p.name ORDER BY utilization DESC LIMIT 5`).all(enterpriseId)
    .map(r => ({ name: r.name, value: Math.round(r.utilization) }));

  const approvals = db.prepare(`SELECT * FROM approvals WHERE status='待审批'`).all();
  const unreadAlerts = db.prepare(`SELECT COUNT(*) c FROM alerts WHERE status='触发中'`).get().c;

  res.json({
    ok: true,
    overview: {
      monthCost, pendingBills, running, error, expiring, projectBudget, projectUsed,
      balance: ent.balance, credit: ent.credit_limit,
      pendingApprovals: approvals.length, unreadAlerts,
      trend, statusDist, utilByProject,
      projects: projects.map(p => ({ ...p, percent: p.budget ? Math.round(p.used / p.budget * 100) : 0 })),
    },
  });
});

export default r;
