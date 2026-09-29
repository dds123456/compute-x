import { Router } from 'express';
import db from '../db.js';
import { calcInstanceCost, listInstances } from '../utils.js';

const r = Router();

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
  const monthCost = bills.length ? bills[0].amount : 0;
  const pendingBills = bills.filter(b => b.status === '待支付').reduce((s, b) => s + b.amount, 0);
  const projectBudget = projects.reduce((s, p) => s + p.budget, 0);
  const projectUsed = projects.reduce((s, p) => s + p.used, 0);

  // 消费趋势（近30天模拟，基于账单分摊）
  const trend = [];
  const base = monthCost / 30 || 800;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const wave = 0.75 + 0.5 * Math.sin(i / 5) + (i === 2 ? 1.6 : 0);
    trend.push({ t: `${d.getMonth() + 1}/${d.getDate()}`, v: Math.round(base * wave) });
  }

  // 实例状态分布
  const statusDist = [
    { name: '运行中', value: running },
    { name: '已停止', value: instances.filter(i => i.status === '已停止').length },
    { name: '待续费', value: expiring },
    { name: '异常', value: error },
    { name: '已释放', value: instances.filter(i => i.status === '已释放').length },
  ].filter(x => x.value > 0);

  // 资源利用率（按项目）
  const utilByProject = projects.slice(0, 5).map(p => {
    const pInst = instances.filter(i => i.project_id === p.id);
    return { name: p.name, value: Math.min(100, Math.round(pInst.length * 60 + (p.budget ? p.used / p.budget * 30 : 10))) };
  });

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
