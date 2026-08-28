import { Router } from 'express';
import { requireRoles } from '../security.js';
import db from '../db.js';
import { now, genId, genNo, auditLog } from '../utils.js';

const r = Router();
r.use(requireRoles('平台管理员'));

// 平台概览
r.get('/overview', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders').all();
  const enterprises = db.prepare('SELECT * FROM enterprises').all();
  const providers = db.prepare('SELECT * FROM providers').all();
  const gmv = orders.filter(o => ['已支付', '已完成'].includes(o.status)).reduce((s, o) => s + o.amount, 0);
  const yyyymm = new Date().toISOString().slice(0, 7);
  const monthGmv = orders.filter(o => (o.paid_at || '').startsWith(yyyymm)).reduce((s, o) => s + o.amount, 0);
  // GMV 趋势：按支付月份真实聚合（近 6 月）
  const byMonth = {};
  orders.filter(o => o.paid_at).forEach(o => { const m = o.paid_at.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + o.amount; });
  const trend = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([m, v]) => ({ m: `${Number(m.slice(5))}月`, v }));
  // 平台资源利用率：运行实例 / 可售总库存
  const runningInstances = db.prepare(`SELECT COUNT(*) c FROM instances WHERE status='运行中'`).get().c;
  const totalStock = db.prepare(`SELECT COALESCE(SUM(stock),0) s FROM resources WHERE status != '维护中'`).get().s;
  const utilization = totalStock > 0 ? Math.min(100, Math.round((runningInstances / totalStock) * 1000) / 10) : 0;
  res.json({
    ok: true,
    overview: {
      gmv, monthGmv, enterpriseCount: enterprises.length, providerCount: providers.length,
      pendingProviders: providers.filter(p => p.cert_status === '审核中').length,
      activeInstances: runningInstances,
      utilization, trend,
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
  const p = db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE providers SET cert_status=? WHERE id=?').run(status, req.params.id);
  auditLog('', req.headers['x-user-id'] || '平台', '平台', '资源方审核', `${p?.name || req.params.id} → ${status}${note ? `（${note}）` : ''}`);
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
  const rows = db.prepare('SELECT id, COALESCE(enterprise_id, \'\') AS enterprise_id FROM members').all();
  rows.forEach(m => {
    db.prepare(`INSERT INTO notifications (id,enterprise_id,user_id,category,title,content,is_read,link,created_at) VALUES (?,?,?,?,?,?,0,?,?)`)
      .run(genId('n'), m.enterprise_id, m.id, '系统', title || '系统公告', content || '', '/notice', now());
  });
  res.json({ ok: true, msg: '公告已发布' });
});

// 运行月度结算（按已完成订单生成/更新结算单，佣金按资源方费率入库，幂等）
r.post('/settlements/run', (req, res) => {
  const period = req.body?.period || new Date().toISOString().slice(0, 7);
  const providers = db.prepare('SELECT * FROM providers').all();
  let created = 0;
  let updated = 0;
  for (const p of providers) {
    const rows = db.prepare(`SELECT o.* FROM orders o JOIN resources r ON o.resource_id = r.id WHERE o.status = '已完成' AND r.provider_id = ? AND substr(o.paid_at, 1, 7) = ?`).all(p.id, period);
    if (!rows.length) continue;
    const gmv = Math.round(rows.reduce((s, o) => s + o.amount, 0) * 100) / 100;
    const commission = Math.round(gmv * p.fee_rate * 100) / 100;
    const amount = Math.round((gmv - commission) * 100) / 100;
    const existing = db.prepare('SELECT * FROM settlements WHERE provider_id = ? AND period = ?').get(p.id, period);
    if (existing) {
      db.prepare(`UPDATE settlements SET gmv=?, commission=?, amount=?, status = CASE WHEN status = '已提现' THEN status ELSE '待结算' END WHERE id=?`)
        .run(gmv, commission, amount, existing.id);
      updated += 1;
    } else {
      db.prepare('INSERT INTO settlements (id,settle_no,provider_id,period,gmv,commission,amount,status,cycle,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(genId('st'), genNo('STL'), p.id, period, gmv, commission, amount, '待结算', 'T+7', now());
      created += 1;
    }
  }
  res.json({ ok: true, msg: '月度结算已运行', period, created, updated });
});

export default r;
