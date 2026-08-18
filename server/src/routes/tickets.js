import { Router } from 'express';
import db from '../db.js';
import { now, genId, genNo, notify } from '../utils.js';

const r = Router();

// 工单列表
r.get('/tickets', (req, res) => {
  const { enterpriseId, status } = req.query;
  let sql = `SELECT t.*, m.name user_name FROM tickets t LEFT JOIN members m ON t.user_id = m.id WHERE t.enterprise_id = ?`;
  const params = [enterpriseId];
  if (status && status !== '全部') { sql += ` AND t.status = ?`; params.push(status); }
  sql += ` ORDER BY datetime(t.created_at) DESC`;
  res.json({ ok: true, tickets: db.prepare(sql).all(...params) });
});

// 工单详情
r.get('/tickets/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ ok: false, msg: '工单不存在' });
  res.json({ ok: true, ticket: { ...t, replies: JSON.parse(t.replies || '[]') } });
});

// 创建工单
r.post('/tickets', (req, res) => {
  const { enterpriseId, userId, type, related, content, priority = '普通' } = req.body || {};
  const id = genId('tk');
  const sla = type === '故障' ? new Date(Date.now() + 30 * 60000).toISOString().slice(0, 19).replace('T', ' ')
    : new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(`INSERT INTO tickets (id,ticket_no,enterprise_id,user_id,type,related,content,status,priority,sla_at,replies,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, genNo('TK'), enterpriseId, userId, type, related || '', content, '待处理', priority, sla, '[]', now());
  notify(enterpriseId, userId, '工单', '工单已创建', `工单 ${type} 已提交，SLA 首次响应时限 ${sla}`, `/tickets/${id}`);
  res.json({ ok: true, msg: '工单已创建', id });
});

// 追加回复
r.post('/tickets/:id/reply', (req, res) => {
  const { content, who } = req.body || {};
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  const replies = JSON.parse(t.replies || '[]');
  replies.push({ who, at: now(), msg: content });
  db.prepare(`UPDATE tickets SET replies=?, status='处理中' WHERE id=?`).run(JSON.stringify(replies), t.id);
  notify(t.enterprise_id, t.user_id, '工单', '工单有新回复', `工单 ${t.ticket_no} 收到新回复`, `/tickets/${t.id}`);
  res.json({ ok: true, msg: '回复成功' });
});

// 工单状态变更
r.post('/tickets/:id/status', (req, res) => {
  const { status, handler } = req.body || {};
  db.prepare('UPDATE tickets SET status=?, handler=? WHERE id=?').run(status, handler || '', req.params.id);
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  notify(t.enterprise_id, t.user_id, '工单', '工单状态更新', `工单 ${t.ticket_no} 状态变更为「${status}」`, `/tickets/${t.id}`);
  res.json({ ok: true });
});

export default r;
