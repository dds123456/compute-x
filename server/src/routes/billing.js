import { Router } from 'express';
import db from '../db.js';
import { now, genId, genNo, notify, auditLog } from '../utils.js';
import { requireRoles } from '../security.js';

const r = Router();

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
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ ok: false, msg: '账单不存在' });
  const items = JSON.parse(bill.items || '[]');
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(bill.enterprise_id);
  res.json({ ok: true, bill: { ...bill, items }, enterprise: ent });
});

// 支付账单
r.post('/bills/:id/pay', requireRoles('企业管理员', '财务'), (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.json({ ok: false, msg: '账单不存在' });
  if (bill.status !== '待支付') return res.json({ ok: false, msg: '账单状态不可支付' });
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(bill.enterprise_id);
  if (ent.balance < bill.amount) return res.json({ ok: false, msg: `余额不足（当前 ${ent.balance} 元），请先充值` });
  db.prepare('UPDATE enterprises SET balance = balance - ? WHERE id = ?').run(bill.amount, bill.enterprise_id);
  db.prepare(`UPDATE bills SET status='已支付', paid_at=? WHERE id=?`).run(now(), bill.id);
  auditLog(bill.enterprise_id, req.headers['x-user-id'], '成员', '支付账单', `${bill.bill_no}，${bill.amount} 元`);
  res.json({ ok: true, msg: '支付成功' });
});

// 充值
r.post('/recharge', (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(501).json({ ok: false, msg: '请先配置持牌支付渠道' });
  const { enterpriseId, amount } = req.body || {};
  db.prepare('UPDATE enterprises SET balance = balance + ? WHERE id = ?').run(Number(amount), enterpriseId);
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(enterpriseId);
  auditLog(enterpriseId, req.headers['x-user-id'], '成员', '账户充值', `${amount} 元`);
  res.json({ ok: true, msg: '充值成功', balance: ent.balance });
});

// 申请开票
r.post('/invoices', requireRoles('企业管理员', '财务'), (req, res) => {
  const { enterpriseId, billIds, title, taxNo, email, type = '电子普票' } = req.body || {};
  const bills = billIds.map(id => db.prepare('SELECT * FROM bills WHERE id = ?').get(id)).filter(Boolean);
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
  db.prepare(`UPDATE settlements SET status='已提现' WHERE id=?`).run(req.params.id);
  res.json({ ok: true, msg: '提现申请成功，款项将在 1-2 个工作日到账' });
});

export default r;
