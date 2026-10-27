import { Router } from 'express';
import db from '../db.js';
import { now, genId, genNo, notify, auditLog } from '../utils.js';
import { requireRoles } from '../security.js';

const r = Router();

// 账单列表（企业以会话为准，忽略请求中的 enterpriseId）
r.get('/bills', (req, res) => {
  const { status } = req.query;
  let sql = `SELECT * FROM bills WHERE enterprise_id = ?`;
  const params = [req.auth.enterpriseId];
  if (status && status !== '全部') { sql += ` AND status = ?`; params.push(status); }
  sql += ` ORDER BY datetime(created_at) DESC`;
  res.json({ ok: true, bills: db.prepare(sql).all(...params) });
});

// 账单详情：跨企业与不存在统一 404
r.get('/bills/:id', (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!bill) return res.status(404).json({ ok: false, msg: '账单不存在' });
  const items = JSON.parse(bill.items || '[]');
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(bill.enterprise_id);
  res.json({ ok: true, bill: { ...bill, items }, enterprise: ent });
});

// 账单明细：按用量事实（usage_records）汇总到实例，而不是读取账单 JSON 快照
r.get('/bills/:id/items', (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!bill) return res.status(404).json({ ok: false, msg: '账单不存在' });
  const period = String(bill.period || '');
  const rows = db.prepare(`SELECT u.instance_id, i.name AS instance_name, i.spec, SUM(u.cost) AS amount, SUM(u.gpu_hours) AS gpu_hours
    FROM usage_records u JOIN instances i ON i.id = u.instance_id
    WHERE u.enterprise_id = ? AND substr(u.usage_date, 1, 7) = ?
    GROUP BY u.instance_id, i.name, i.spec ORDER BY amount DESC`).all(req.auth.enterpriseId, period);
  res.json({ ok: true, source: 'usage_records', items: rows.map(row => ({ ...row, amount: Math.round(row.amount * 100) / 100 })) });
});

// 支付账单（只能支付本企业的账单）
r.post('/bills/:id/pay', (req, res) => {
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

// 充值：企业以会话为准；金额必须为 0 < 金额 ≤ 100 万；开发渠道直接入账并落库（提示词 §3.3：渠道抽象，生产为支付意向 + 回调，当前为模拟）
r.post('/recharge', (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    return res.status(400).json({ ok: false, msg: '充值金额须大于 0 且不超过 100 万元' });
  }
  const enterpriseId = req.auth.enterpriseId;
  const amountFixed = Math.round(amount * 100) / 100;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE enterprises SET balance = balance + ? WHERE id = ?').run(amountFixed, enterpriseId);
    db.prepare(`INSERT INTO recharge_records (id,enterprise_id,member_id,amount,channel,status,created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(genId('rc'), enterpriseId, req.auth.userId, amountFixed, 'development-simulated', '已成功', now());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(enterpriseId);
  auditLog(enterpriseId, req.auth.userId, '成员', '账户充值', `${amountFixed} 元（模拟渠道）`);
  res.json({ ok: true, msg: '充值成功（模拟渠道）', balance: ent.balance });
});

// 申请开票
r.post('/invoices', (req, res) => {
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
r.post('/invoices/:id/advance', (req, res) => {
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
  // 资源方运营只能看自己的结算单；平台管理员可按 providerId 参数查看
  const providerId = req.auth.role === '平台管理员' ? req.query.providerId : req.auth.providerId;
  if (!providerId) return res.status(403).json({ ok: false, msg: '当前账号未绑定资源方' });
  const rows = db.prepare('SELECT * FROM settlements WHERE provider_id = ? ORDER BY created_at DESC').all(providerId);
  res.json({ ok: true, settlements: rows });
});

// 提现：资源方运营只能提取本资源方的结算单（以会话绑定的 providerId 为准）；平台管理员可代为运营
// 只能提取“待结算”的结算单，已提现的单据拒绝重复提现
r.post('/settlements/:id/withdraw', requireRoles('资源方运营', '平台管理员'), (req, res) => {
  const isPlatform = req.auth.role === '平台管理员';
  if (!isPlatform && !req.auth.providerId) return res.status(403).json({ ok: false, msg: '当前账号未绑定资源方' });
  const settlement = isPlatform
    ? db.prepare('SELECT * FROM settlements WHERE id = ?').get(req.params.id)
    : db.prepare('SELECT * FROM settlements WHERE id = ? AND provider_id = ?').get(req.params.id, req.auth.providerId);
  if (!settlement) return res.status(404).json({ ok: false, msg: '结算单不存在' });
  if (settlement.status !== '待结算') return res.status(400).json({ ok: false, msg: `结算单状态为「${settlement.status}」，不可提现` });
  db.prepare(`UPDATE settlements SET status='已提现' WHERE id=?`).run(settlement.id);
  auditLog(req.auth.enterpriseId, req.auth.userId, '资源方', '申请提现', `${settlement.settle_no}，${settlement.amount} 元`);
  res.json({ ok: true, msg: '提现申请成功，款项将在 1-2 个工作日到账' });
});

export default r;
