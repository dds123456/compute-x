import { Router } from 'express';
import db from '../db.js';
import { now, genId, genNo, notify, auditLog } from '../utils.js';
import { createRateLimiter, requireRoles } from '../security.js';

const r = Router();
const writeLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 60, keyPrefix: 'billing-write' });

// 账单列表
r.get('/bills', (req, res) => {
  const { enterpriseId, status } = req.query;
  let sql = `SELECT * FROM bills WHERE enterprise_id = ?`;
  const params = [enterpriseId];
  if (status && status !== '全部') { sql += ` AND status = ?`; params.push(status); }
  sql += ` ORDER BY datetime(created_at) DESC`;
  res.json({ ok: true, bills: db.prepare(sql).all(...params) });
});

// 账单详情
r.get('/bills/:id', (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!bill) return res.status(404).json({ ok: false, msg: '账单不存在' });
  const items = JSON.parse(bill.items || '[]');
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(bill.enterprise_id);
  res.json({ ok: true, bill: { ...bill, items }, enterprise: ent });
});

// 账单真实明细（按账期从用量事实汇总；无用量数据时回退到账单静态明细）
r.get('/bills/:id/items', (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!bill) return res.status(404).json({ ok: false, msg: '账单不存在' });
  const period = bill.period;
  const rows = db.prepare(`
    SELECT i.name, i.spec, i.id AS instance_id, ROUND(SUM(u.gpu_hours),2) AS gpu_hours, ROUND(SUM(u.cost),2) AS amount, MAX(u.usage_date) AS last_date
    FROM usage_records u
    JOIN instances i ON i.id = u.instance_id
    WHERE u.enterprise_id = ? AND u.usage_date LIKE ?
    GROUP BY u.instance_id
    ORDER BY amount DESC
  `).all(bill.enterprise_id, `${period}%`);
  if (rows.length) {
    return res.json({ ok: true, billId: bill.id, period, source: 'usage_records', items: rows });
  }
  res.json({ ok: true, billId: bill.id, period, source: 'static', items: JSON.parse(bill.items || '[]') });
});

// 支付账单
r.post('/bills/:id/pay', writeLimiter, requireRoles('企业管理员', '财务'), (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!bill) return res.status(404).json({ ok: false, msg: '账单不存在' });
  if (bill.status !== '待支付') return res.json({ ok: false, msg: '账单状态不可支付' });
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(bill.enterprise_id);
  if (ent.balance < bill.amount) return res.json({ ok: false, msg: `余额不足（当前 ${ent.balance} 元），请先充值` });
  db.prepare('UPDATE enterprises SET balance = balance - ? WHERE id = ?').run(bill.amount, bill.enterprise_id);
  db.prepare(`UPDATE bills SET status='已支付', paid_at=? WHERE id=?`).run(now(), bill.id);
  auditLog(bill.enterprise_id, req.headers['x-user-id'], '成员', '支付账单', `${bill.bill_no}，${bill.amount} 元`);
  res.json({ ok: true, msg: '支付成功' });
});

// 充值：开发/演示直接入账；生产创建支付意向，由渠道回调完成
r.post('/recharge', writeLimiter, (req, res) => {
  const { enterpriseId, amount, channel = 'mock' } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ ok: false, msg: '充值金额不合法' });
  const id = genId('rc');
  if (process.env.NODE_ENV !== 'production') {
    db.prepare('UPDATE enterprises SET balance = balance + ? WHERE id = ?').run(amt, enterpriseId);
    db.prepare('INSERT INTO recharge_records (id,enterprise_id,channel,amount,status,paid_at) VALUES (?,?,?,?,?,?)').run(id, enterpriseId, channel, amt, '已成功', now());
    const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(enterpriseId);
    auditLog(enterpriseId, req.headers['x-user-id'], '成员', '账户充值', `${amt} 元`);
    return res.json({ ok: true, msg: '充值成功', balance: ent.balance, rechargeId: id });
  }
  db.prepare('INSERT INTO recharge_records (id,enterprise_id,channel,amount,status) VALUES (?,?,?,?,?)').run(id, enterpriseId, channel, amt, '待支付');
  res.json({ ok: true, msg: '充值订单已创建，等待支付渠道回调', rechargeId: id, payIntent: `computedx-recharge-${id}` });
});

// 充值渠道回调（模拟持牌支付渠道）
r.post('/recharge/:id/callback', (req, res) => {
  const rec = db.prepare('SELECT * FROM recharge_records WHERE id = ?').get(req.params.id);
  if (!rec) return res.status(404).json({ ok: false, msg: '充值单不存在' });
  if (rec.status !== '待支付') return res.status(400).json({ ok: false, msg: '充值单状态不可回调' });
  db.prepare('UPDATE recharge_records SET status=?, paid_at=? WHERE id=?').run('已成功', now(), rec.id);
  db.prepare('UPDATE enterprises SET balance = balance + ? WHERE id = ?').run(rec.amount, rec.enterprise_id);
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(rec.enterprise_id);
  auditLog(rec.enterprise_id, 'channel', '渠道', '充值回调', `${rec.amount} 元`);
  res.json({ ok: true, msg: '充值到账', balance: ent.balance });
});

// 申请开票
r.post('/invoices', requireRoles('企业管理员', '财务'), (req, res) => {
  const { enterpriseId, billIds, title, taxNo, email, type = '电子普票' } = req.body || {};
  const bills = billIds.map(id => db.prepare('SELECT * FROM bills WHERE id = ? AND enterprise_id = ?').get(id, req.auth.enterpriseId)).filter(Boolean);
  if (bills.length !== billIds.length) return res.status(400).json({ ok: false, msg: '存在不属于本企业的账单，无法开票' });
  const amount = bills.reduce((s, b) => s + b.amount, 0);
  const id = genId('inv');
  db.prepare(`INSERT INTO invoices (id,invoice_no,enterprise_id,bill_ids,title,tax_no,email,type,status,amount,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, genNo('INV'), enterpriseId, JSON.stringify(billIds), title, taxNo, email, type, '已受理', amount, now());
  bills.forEach(b => db.prepare(`UPDATE bills SET invoice_status='已受理' WHERE id=?`).run(b.id));
  notify(enterpriseId, req.headers['x-user-id'], '账单', '开票申请已受理', `开票申请 ${amount} 元已受理，开票进度可在发票管理中查看`, '/invoices');
  res.json({ ok: true, msg: '开票申请已提交', invoiceId: id });
});

// 发票列表
r.get('/invoices', (req, res) => {
  const rows = db.prepare('SELECT * FROM invoices WHERE enterprise_id = ? ORDER BY created_at DESC').all(req.query.enterpriseId);
  res.json({ ok: true, invoices: rows });
});

// 模拟开票进度推进
r.post('/invoices/:id/advance', requireRoles('平台管理员'), (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  const next = inv.status === '已受理' ? '开票中' : inv.status === '开票中' ? '已开具' : '已开具';
  db.prepare(`UPDATE invoices SET status=? WHERE id=?`).run(next, inv.id);
  if (next === '已开具') {
    const billIds = JSON.parse(inv.bill_ids);
    billIds.forEach(id => db.prepare(`UPDATE bills SET invoice_status='已开票' WHERE id=?`).run(id));
  }
  res.json({ ok: true, status: next });
});

// 结算单（资源方）
r.get('/settlements', (req, res) => {
  const rows = db.prepare('SELECT * FROM settlements WHERE provider_id = ? ORDER BY created_at DESC').all(req.query.providerId);
  res.json({ ok: true, settlements: rows });
});

// 提现
r.post('/settlements/:id/withdraw', requireRoles('资源方运营'), (req, res) => {
  const s = db.prepare('SELECT * FROM settlements WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ ok: false, msg: '结算单不存在' });
  if (s.status !== '待结算') return res.status(400).json({ ok: false, msg: '当前结算状态不可提现' });
  db.prepare(`UPDATE settlements SET status='已提现' WHERE id=?`).run(s.id);
  auditLog('', req.headers['x-user-id'] || '资源方', '资源方', '结算提现', `${s.settle_no}（${s.amount} 元）`);
  res.json({ ok: true, msg: '提现申请成功，款项将在 1-2 个工作日到账' });
});

export default r;
