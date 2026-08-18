import { Router } from 'express';
import { requireRoles } from '../security.js';
import db from '../db.js';
import { now, genId, genNo } from '../utils.js';

const r = Router();
r.use(requireRoles('平台管理员'));

// 平台概览
r.get('/overview', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders').all();
  const enterprises = db.prepare('SELECT * FROM enterprises').all();
  const providers = db.prepare('SELECT * FROM providers').all();
  const gmv = orders.filter(o => ['已支付', '已完成'].includes(o.status)).reduce((s, o) => s + o.amount, 0);
  const monthGmv = orders.filter(o => (o.paid_at || '').startsWith('2026-08')).reduce((s, o) => s + o.amount, 0);
  const trend = [182000, 226000, 254000, 198000, 312000, monthGmv].map((v, i) => ({ m: `${i + 3}月`, v }));
  res.json({
    ok: true,
    overview: {
      gmv, monthGmv, enterpriseCount: enterprises.length, providerCount: providers.length,
      pendingProviders: providers.filter(p => p.cert_status === '审核中').length,
      activeInstances: db.prepare(`SELECT COUNT(*) c FROM instances WHERE status='运行中'`).get().c,
      utilization: 62, trend,
    },
  });
});

// 资源方审核
r.get('/providers', (req, res) => {
  const rows = db.prepare('SELECT * FROM providers ORDER BY created_at DESC').all();
  res.json({ ok: true, providers: rows });
});

r.post('/providers/:id/audit', (req, res) => {
  const { status, note } = req.body || {};
  db.prepare('UPDATE providers SET cert_status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true, msg: `审核结果：${status}` });
});

// 市场管理（全部资源）
r.get('/resources', (req, res) => {
  const rows = db.prepare(`SELECT r.*, p.name provider_name FROM resources r LEFT JOIN providers p ON r.provider_id = p.id ORDER BY r.created_at DESC`).all();
  res.json({ ok: true, resources: rows });
});

// 企业列表
r.get('/enterprises', (req, res) => {
  const rows = db.prepare('SELECT * FROM enterprises ORDER BY created_at DESC').all().map(e => ({
    ...e,
    memberCount: db.prepare('SELECT COUNT(*) c FROM members WHERE enterprise_id = ?').get(e.id).c,
    projectCount: db.prepare('SELECT COUNT(*) c FROM projects WHERE enterprise_id = ?').get(e.id).c,
  }));
  res.json({ ok: true, enterprises: rows });
});

// 全部订单
r.get('/orders', (req, res) => {
  const rows = db.prepare(`SELECT o.*, e.name enterprise_name FROM orders o LEFT JOIN enterprises e ON o.enterprise_id = e.id ORDER BY datetime(o.created_at) DESC`).all();
  res.json({ ok: true, orders: rows });
});

// 全部账单
r.get('/bills', (req, res) => {
  const rows = db.prepare(`SELECT b.*, e.name enterprise_name FROM bills b LEFT JOIN enterprises e ON b.enterprise_id = e.id ORDER BY datetime(b.created_at) DESC`).all();
  res.json({ ok: true, bills: rows });
});

// 全部工单（售后）
r.get('/tickets', (req, res) => {
  const rows = db.prepare(`SELECT t.*, e.name enterprise_name FROM tickets t LEFT JOIN enterprises e ON t.enterprise_id = e.id ORDER BY datetime(t.created_at) DESC`).all();
  res.json({ ok: true, tickets: rows });
});

// 结算（平台侧）
r.get('/settlements', (req, res) => {
  const rows = db.prepare(`SELECT s.*, p.name provider_name FROM settlements s LEFT JOIN providers p ON s.provider_id = p.id ORDER BY datetime(s.created_at) DESC`).all();
  res.json({ ok: true, settlements: rows });
});

// 公告
r.post('/announcement', (req, res) => {
  const { title, content } = req.body || {};
  const rows = db.prepare('SELECT id FROM members').all();
  rows.forEach(m => {
    db.prepare(`INSERT INTO notifications (id,enterprise_id,user_id,category,title,content,is_read,link,created_at) VALUES (?,?,?,?,?,?,0,?,?)`)
      .run(genId('n'), 'ent-demo', m.id, '系统', title || '系统公告', content || '', '/notice', now());
  });
  res.json({ ok: true, msg: '公告已发布' });
});

export default r;
