import { Router } from 'express';
import db from '../db.js';
import { now, genId, genNo, notify, auditLog } from '../utils.js';
import { requireRoles } from '../security.js';

const r = Router();

function getOwnTicket(req, res) {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!t) { res.status(404).json({ ok: false, msg: '工单不存在' }); return null; }
  return t;
}

const isOverdue = (t) => t.status === '待处理' && t.sla_at && t.sla_at < now();

// 工单列表
r.get('/tickets', (req, res) => {
  const { enterpriseId, status } = req.query;
  let sql = `SELECT t.*, m.name user_name FROM tickets t LEFT JOIN members m ON t.user_id = m.id WHERE t.enterprise_id = ?`;
  const params = [enterpriseId];
  if (status && status !== '全部') { sql += ` AND t.status = ?`; params.push(status); }
  sql += ` ORDER BY datetime(t.created_at) DESC`;
  const rows = db.prepare(sql).all(...params).map(t => ({ ...t, overdue: isOverdue(t) }));
  res.json({ ok: true, tickets: rows });
});

// SLA 达标率统计（须在 /tickets/:id 之前注册）
r.get('/tickets/sla-stats', (req, res) => {
  const { enterpriseId } = req.query;
  const rows = db.prepare('SELECT * FROM tickets WHERE enterprise_id = ?').all(enterpriseId);
  let responded = 0;
  let firstResponseOnTime = 0;
  for (const t of rows) {
    const replies = JSON.parse(t.replies || '[]');
    const first = replies.find(x => x.who !== '系统') || replies[0];
    if (!first) continue;
    responded += 1;
    if (t.sla_at && first.at <= t.sla_at) firstResponseOnTime += 1;
  }
  const byType = {};
  for (const t of rows) {
    byType[t.type] = byType[t.type] || { total: 0, overdue: 0 };
    byType[t.type].total += 1;
    if (isOverdue(t)) byType[t.type].overdue += 1;
  }
  res.json({
    ok: true,
    stats: {
      total: rows.length,
      resolved: rows.filter(t => t.status === '已解决').length,
      responded,
      firstResponseOnTime,
      firstResponseRate: responded ? Math.round((firstResponseOnTime / responded) * 1000) / 10 : null,
      overdueCount: rows.filter(isOverdue).length,
      byType: Object.entries(byType).map(([type, v]) => ({ type, ...v })),
    },
  });
});

// 工单详情
r.get('/tickets/:id', (req, res) => {
  const t = getOwnTicket(req, res);
  if (!t) return;
  res.json({ ok: true, ticket: { ...t, overdue: isOverdue(t), replies: JSON.parse(t.replies || '[]') } });
});

// 创建工单
r.post('/tickets', (req, res) => {
  const { enterpriseId, userId, type, related, content, priority = '普通' } = req.body || {};
  const id = genId('tk');
  const sla = type === '故障' ? new Date(Date.now() + 30 * 60000).toISOString().slice(0, 19).replace('T', ' ')
    : new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(`INSERT INTO tickets (id,ticket_no,enterprise_id,user_id,type,related,content,status,priority,sla_at,replies,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, genNo('TK'), enterpriseId, userId, type, related || '', content, '待处理', priority, sla, '[]', now());
  auditLog(enterpriseId, userId, '成员', '创建工单', `${type}：${content}`);
  notify(enterpriseId, userId, '工单', '工单已创建', `工单 ${type} 已提交，SLA 首次响应时限 ${sla}`, `/tickets/${id}`);
  res.json({ ok: true, msg: '工单已创建', id });
});

// 追加回复
r.post('/tickets/:id/reply', (req, res) => {
  const { content, who } = req.body || {};
  const t = getOwnTicket(req, res);
  if (!t) return;
  const replies = JSON.parse(t.replies || '[]');
  replies.push({ who, at: now(), msg: content });
  db.prepare(`UPDATE tickets SET replies=?, status='处理中' WHERE id=?`).run(JSON.stringify(replies), t.id);
  auditLog(t.enterprise_id, req.auth.userId, who || '成员', '回复工单', t.ticket_no);
  notify(t.enterprise_id, t.user_id, '工单', '工单有新回复', `工单 ${t.ticket_no} 收到新回复`, `/tickets/${t.id}`);
  res.json({ ok: true, msg: '回复成功' });
});

// 工单状态变更
r.post('/tickets/:id/status', requireRoles('企业管理员', '财务'), (req, res) => {
  const { status, handler } = req.body || {};
  const t = getOwnTicket(req, res);
  if (!t) return;
  db.prepare('UPDATE tickets SET status=?, handler=? WHERE id=?').run(status, handler || '', t.id);
  auditLog(t.enterprise_id, req.auth.userId, '成员', '更新工单状态', `${t.ticket_no} → ${status}`);
  notify(t.enterprise_id, t.user_id, '工单', '工单状态更新', `工单 ${t.ticket_no} 状态变更为「${status}」`, `/tickets/${t.id}`);
  res.json({ ok: true });
});

// 升级工单（SLA 超时或人工升级）：优先级→紧急，追加系统回复并通知
r.post('/tickets/:id/escalate', (req, res) => {
  const t = getOwnTicket(req, res);
  if (!t) return;
  const replies = JSON.parse(t.replies || '[]');
  replies.push({ who: '系统', at: now(), msg: '工单已升级为紧急处理' });
  db.prepare(`UPDATE tickets SET priority='紧急', replies=? WHERE id=?`).run(JSON.stringify(replies), t.id);
  auditLog(t.enterprise_id, req.auth.userId, '系统', '升级工单', t.ticket_no);
  notify(t.enterprise_id, t.user_id, '工单', '工单已升级', `工单 ${t.ticket_no} 已升级为紧急处理`, `/tickets/${t.id}`);
  res.json({ ok: true, msg: '工单已升级' });
});

export default r;