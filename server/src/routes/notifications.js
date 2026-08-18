import { Router } from 'express';
import db from '../db.js';
import { now, genId } from '../utils.js';
import { requireRoles } from '../security.js';

const r = Router();

// 消息列表
r.get('/notifications', (req, res) => {
  const { category, unread } = req.query;
  const userId = req.auth.userId;
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
r.get('/api-keys', (req, res) => {
  const rows = db.prepare('SELECT * FROM api_keys WHERE enterprise_id = ?').all(req.query.enterpriseId);
  res.json({ ok: true, keys: rows.map(({ key, ...row }) => ({ ...row, key_preview: `${key.slice(0, 8)}••••${key.slice(-4)}` })) });
});

r.post('/api-keys', requireRoles('企业管理员'), (req, res) => {
  const { enterpriseId, name, webhook } = req.body || {};
  const id = genId('key');
  const key = `ck_live_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 8)}`;
  db.prepare('INSERT INTO api_keys VALUES (?,?,?,?,?,?)').run(id, enterpriseId, name, key, webhook || '', now());
  res.json({ ok: true, key });
});

r.delete('/api-keys/:id', requireRoles('企业管理员'), (req, res) => {
  const key = db.prepare('SELECT * FROM api_keys WHERE id = ? AND enterprise_id = ?').get(req.params.id, req.auth.enterpriseId);
  if (!key) return res.status(404).json({ ok: false, msg: '密钥不存在' });
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(key.id);
  res.json({ ok: true, msg: '密钥已撤销' });
});

// 通知偏好
r.get('/preferences', (req, res) => {
  let preferences = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(req.auth.userId);
  if (!preferences) {
    db.prepare('INSERT INTO notification_preferences (user_id) VALUES (?)').run(req.auth.userId);
    preferences = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(req.auth.userId);
  }
  res.json({ ok: true, preferences });
});

r.post('/preferences', (req, res) => {
  const current = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(req.auth.userId);
  const values = {
    email: req.body.email ? 1 : 0,
    app_push: req.body.app_push ? 1 : 0,
    billing: req.body.billing ? 1 : 0,
    approval: req.body.approval ? 1 : 0,
    marketing: req.body.marketing ? 1 : 0,
  };
  if (current) {
    db.prepare(`UPDATE notification_preferences SET email=?,app_push=?,billing=?,approval=?,marketing=?,updated_at=? WHERE user_id=?`)
      .run(values.email, values.app_push, values.billing, values.approval, values.marketing, now(), req.auth.userId);
  } else {
    db.prepare(`INSERT INTO notification_preferences (user_id,email,app_push,billing,approval,marketing,updated_at) VALUES (?,?,?,?,?,?,?)`)
      .run(req.auth.userId, values.email, values.app_push, values.billing, values.approval, values.marketing, now());
  }
  res.json({ ok: true, msg: '通知偏好已保存' });
});

export default r;
