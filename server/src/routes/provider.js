import { Router } from 'express';
import { requireRoles } from '../security.js';
import db from '../db.js';
import { now, genId, genNo, calcInstanceCost } from '../utils.js';

const r = Router();
r.use(requireRoles('资源方运营'));

// 资源方概览：收益/库存/故障
r.get('/overview', (req, res) => {
  const providerId = req.query.providerId;
  const insts = db.prepare('SELECT * FROM instances WHERE provider_id = ?').all(providerId);
  const resources = db.prepare('SELECT * FROM resources WHERE provider_id = ?').all(providerId);
  const settlements = db.prepare('SELECT * FROM settlements WHERE provider_id = ?').all(providerId);
  const running = insts.filter(i => i.status === '运行中').length;
  const totalRevenue = settlements.reduce((s, x) => s + x.amount, 0);
  const monthRevenue = settlements.filter(x => x.period === '2026-08').reduce((s, x) => s + x.amount, 0);
  const stockTotal = resources.reduce((s, x) => s + x.stock, 0);
  const faultCount = insts.filter(i => i.status === '异常').length;
  // 收益趋势（近6周模拟）
  const trend = [32000, 41000, 38500, 52000, 47000, monthRevenue].map((v, i) => ({ w: `W${i + 1}`, v }));
  res.json({
    ok: true,
    overview: {
      running, totalRevenue, monthRevenue, stockTotal, resourcesCount: resources.length,
      faultCount, settlementPending: settlements.filter(x => x.status === '待结算').length,
      utilization: Math.min(95, Math.round(running / Math.max(1, resources.reduce((s, x) => s + (x.stock + (x.status === '维护中' ? 0 : 2)), 0)) * 100)),
      trend,
    },
  });
});

// 资源方资源列表（含运行实例数）
r.get('/resources', (req, res) => {
  const rows = db.prepare('SELECT * FROM resources WHERE provider_id = ?').all(req.query.providerId).map(res => {
    const running = db.prepare(`SELECT COUNT(*) c FROM instances WHERE resource_id = ? AND status IN ('运行中','创建中')`).get(res.id).c;
    return { ...res, running };
  });
  res.json({ ok: true, resources: rows });
});

// 上架/下架
r.post('/resources/:id/status', (req, res) => {
  const { status } = req.body || {};
  db.prepare('UPDATE resources SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true, msg: status === '可售' ? '已上架' : '已下架' });
});

// 更新报价
r.post('/resources/:id/price', (req, res) => {
  const { price_hour, price_day, price_month } = req.body || {};
  db.prepare('UPDATE resources SET price_hour=?, price_day=?, price_month=? WHERE id=?').run(price_hour, price_day, price_month, req.params.id);
  res.json({ ok: true, msg: '报价已更新' });
});

// 收益预估（模拟）
r.get('/revenue-estimate', (req, res) => {
  const providerId = req.query.providerId;
  const resources = db.prepare('SELECT * FROM resources WHERE provider_id = ?').all(providerId);
  const estimate = resources.reduce((s, x) => s + x.stock * x.price_hour * 24 * 0.6, 0); // 假设60%利用率
  res.json({ ok: true, estimate: Math.round(estimate), resources });
});

// 结算明细（含佣金）
r.get('/settlements', (req, res) => {
  const rows = db.prepare('SELECT * FROM settlements WHERE provider_id = ? ORDER BY created_at DESC').all(req.query.providerId);
  res.json({ ok: true, settlements: rows });
});

// 订单（资源方视角：归属其资源的订单）
r.get('/orders', (req, res) => {
  const rows = db.prepare(`SELECT o.*, r.provider_id, p.name project_name FROM orders o LEFT JOIN resources r ON o.resource_id = r.id LEFT JOIN projects p ON o.project_id = p.id WHERE r.provider_id = ? ORDER BY datetime(o.created_at) DESC`).all(req.query.providerId);
  res.json({ ok: true, orders: rows });
});

// 工单协同
r.get('/tickets', (req, res) => {
  const rows = db.prepare(`SELECT * FROM tickets WHERE type IN ('故障','性能争议') AND status IN ('待处理','处理中') ORDER BY datetime(created_at) DESC`).all();
  res.json({ ok: true, tickets: rows });
});

export default r;
