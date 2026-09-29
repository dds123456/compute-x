import { Router } from 'express';
import db from '../db.js';
import { now, genId } from '../utils.js';

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
r.get('/api-keys', (req, res) => {
  const rows = db.prepare('SELECT * FROM api_keys WHERE enterprise_id = ?').all(req.query.enterpriseId);
  res.json({ ok: true, keys: rows });
});

r.post('/api-keys', (req, res) => {
  const { enterpriseId, name, webhook } = req.body || {};
  const id = genId('key');
  const key = `ck_live_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 8)}`;
  db.prepare('INSERT INTO api_keys VALUES (?,?,?,?,?,?)').run(id, enterpriseId, name, key, webhook || '', now());
  res.json({ ok: true, key });
});

// 通知偏好
r.post('/preferences', (req, res) => {
  res.json({ ok: true });
});

export default r;
