import { Router } from 'express';
import db from '../db.js';
import { now, genId, genNo, notify, auditLog } from '../utils.js';

const r = Router();

// 工单列表（企业以会话为准）
r.get('/tickets', (req, res) => {
  const { status } = req.query;
  let sql = `SELECT t.*, m.name user_name FROM tickets t LEFT JOIN members m ON t.user_id = m.id WHERE t.enterprise_id = ?`;
  const params = [req.auth.enterpriseId];
  if (status && status !== '全部') { sql += ` AND t.status = ?`; params.push(status); }
  sql += ` ORDER BY datetime(t.created_at) DESC`;
  res.json({ ok: true, tickets: db.prepare(sql).all(...params) });
});

// SLA 统计：首次响应达标率（已回复的工单中，首次回复在 SLA 时限内的比例）
r.get('/tickets/sla-stats', (req, res) => {
  const rows = db.prepare('SELECT * FROM tickets WHERE enterprise_id = ?').all(req.auth.enterpriseId);
  const answered = rows.filter(t => JSON.parse(t.replies || '[]').length > 0);
  const onTime = answered.filter(t => {
    const first = JSON.parse(t.replies)[0];
    return first && t.sla_at && first.at <= t.sla_at;
  });
  const rate = answered.length ? Math.round(onTime.length / answered.length * 1000) / 10 : 0;
  res.json({ ok: true, stats: { total: rows.length, answered: answered.length, firstResponseRate: rate, overdue: rows.filter(t => ['待处理', '处理中'].includes(t.status) && t.sla_at && t.sla_at < now()).length } });
});

// 工单详情：跨企业与不存在统一 404（注意：固定路径 sla-stats 须先于 :id 注册）
r.get('/tickets/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!t) return res.status(404).json({ ok: false, msg: '工单不存在' });
  res.json({ ok: true, ticket: { ...t, replies: JSON.parse(t.replies || '[]') } });
});

// 升级：优先级提升为紧急，并写入系统回复、审计与通知（提示词 §3.3-H）
r.post('/tickets/:id/escalate', (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!t) return res.status(404).json({ ok: false, msg: '工单不存在' });
  const replies = JSON.parse(t.replies || '[]');
  replies.push({ who: '系统', at: now(), msg: '工单已升级为紧急，已通知值班人员' });
  db.prepare(`UPDATE tickets SET priority='紧急', replies=? WHERE id=?`).run(JSON.stringify(replies), t.id);
  auditLog(t.enterprise_id, req.auth.userId, '成员', '升级工单', t.ticket_no);
  notify(t.enterprise_id, t.user_id, '工单', '工单已升级', `工单 ${t.ticket_no} 已升级为紧急`, `/tickets/${t.id}`);
  res.json({ ok: true });
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
