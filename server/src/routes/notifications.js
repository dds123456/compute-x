import { Router } from 'express';
import db from '../db.js';
import { now, genId, auditLog } from '../utils.js';
import { requireRoles } from '../security.js';

const r = Router();

// 消息列表
r.get('/notifications', (req, res) => {
  const { userId, category, unread } = req.query;
  let sql = `SELECT * FROM notifications WHERE user_id = ?`;
  const params = [userId];
  if (category && category !== '全部') { sql += ` AND category = ?`; params.push(category); }
  if (unread === '1') sql += ` AND is_read = 0`;
  sql += ` ORDER BY datetime(created_at) DESC`;
  res.json({ ok: true, notifications: db.prepare(sql).all(...params) });
});

// 标记已读
r.post('/notifications/read', (req, res) => {
  const { ids, userId, all } = req.body || {};
  if (all) {
    db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(userId);
  } else if (ids?.length) {
    db.prepare(`UPDATE notifications SET is_read=1 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  }
  res.json({ ok: true });
});

// API 密钥
// 企业身份以会话为准：忽略请求中的 enterpriseId，防止跨租户读取或写入密钥
r.get('/api-keys', (req, res) => {
  const rows = db.prepare('SELECT id, enterprise_id, name, webhook, created_at FROM api_keys WHERE enterprise_id = ?').all(req.auth.enterpriseId);
  res.json({ ok: true, keys: rows.map(row => ({ ...row, key_preview: `ck_live_••••${row.id.slice(-4)}` })) });
});

r.post('/api-keys', requireRoles('企业管理员', '平台管理员'), (req, res) => {
  const { name, webhook } = req.body || {};
  const id = genId('key');
  const key = `ck_live_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 8)}`;
  db.prepare('INSERT INTO api_keys VALUES (?,?,?,?,?,?)').run(id, req.auth.enterpriseId, name, key, webhook || '', now());
  res.json({ ok: true, key });
});

// 告警列表：来自真实告警表，只返回本企业实例的告警（经 instances 关联归属），附实例名称
r.get('/alerts', (req, res) => {
  const rows = db.prepare(`SELECT a.id, a.instance_id, i.name AS instance_name, a.type, a.level, a.metric, a.message, a.status, a.triggered_at, a.recovered_at
    FROM alerts a JOIN instances i ON i.id = a.instance_id
    WHERE i.enterprise_id = ? ORDER BY datetime(a.triggered_at) DESC LIMIT 50`).all(req.auth.enterpriseId);
  res.json({ ok: true, alerts: rows });
});

// 撤销密钥：只能撤销本企业的密钥，他企业或不存在的密钥统一返回 404
r.delete('/api-keys/:id', requireRoles('企业管理员', '平台管理员'), (req, res) => {
  const result = db.prepare('DELETE FROM api_keys WHERE id = ? AND enterprise_id = ?').run(req.params.id, req.auth.enterpriseId);
  if (result.changes === 0) return res.status(404).json({ ok: false, msg: '密钥不存在' });
  auditLog(req.auth.enterpriseId, req.auth.userId, '成员', '撤销 API 密钥', req.params.id);
  res.json({ ok: true });
});

// 通知偏好：按用户保存；关键告警不可退订，因此 critical_alerts 始终为 true
r.post('/preferences', (req, res) => {
  const { email = true, app_push = true, billing = true, approval = true, marketing = false } = req.body || {};
  const flags = { email, app_push, billing, approval, marketing };
  db.prepare(`INSERT INTO notification_preferences (user_id,enterprise_id,preferences_json,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET preferences_json=excluded.preferences_json, updated_at=excluded.updated_at`)
    .run(req.auth.userId, req.auth.enterpriseId, JSON.stringify(flags), now());
  res.json({ ok: true, preferences: { ...flags, critical_alerts: true } });
});

export default r;
