import { Router } from 'express';
import db from '../db.js';
import { createGuestSession, createSession, ensureGuestMember, hashPassword, revokeSession, safeMember, verifyPassword } from '../security.js';

const r = Router();
const GUEST_RATE_LIMIT_WINDOW_MS = Number(process.env.GUEST_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const GUEST_RATE_LIMIT_MAX = Number(process.env.GUEST_RATE_LIMIT_MAX || 20);
const guestRateBuckets = new Map();

function allowGuestSession(req, res) {
  const forwarded = String(req.headers['x-forwarded-for'] || '');
  const clientKey = forwarded.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const currentTime = Date.now();
  let bucket = guestRateBuckets.get(clientKey);
  if (!bucket || bucket.resetAt <= currentTime) {
    bucket = { count: 0, resetAt: currentTime + GUEST_RATE_LIMIT_WINDOW_MS };
    guestRateBuckets.set(clientKey, bucket);
  }

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000));
  res.setHeader('X-RateLimit-Limit', String(GUEST_RATE_LIMIT_MAX));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, GUEST_RATE_LIMIT_MAX - bucket.count - 1)));
  if (bucket.count >= GUEST_RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ ok: false, msg: '游客访问过于频繁，请稍后再试' });
    return false;
  }
  bucket.count += 1;
  return true;
}

// 登录：POST /api/auth/login { account, password } 或 { userId } / { username }（兼容一键登录）
r.post('/login', (req, res) => {
  const { userId, username, account, password } = req.body || {};
  let member;
  if (userId) {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ ok: false, msg: '账号不存在' });
    member = db.prepare('SELECT * FROM members WHERE id = ?').get(userId);
  }
  else {
    const key = account || username;
    if (!key) return res.status(400).json({ ok: false, msg: '请输入账号' });
    member = db.prepare('SELECT * FROM members WHERE name = ? OR phone = ? OR email = ?').get(key, key, key);
  }
  if (!member) return res.status(401).json({ ok: false, msg: '账号不存在，请检查后重试' });
  if (member.id === 'u-guest') return res.status(403).json({ ok: false, msg: '请使用游客体验入口' });
  if (member.status === '禁用') return res.status(403).json({ ok: false, msg: '账号已禁用，请联系企业管理员' });
  if (password !== undefined && !verifyPassword(password, member.password)) {
    return res.status(401).json({ ok: false, msg: '密码错误，请重试' });
  }
  if (password !== undefined && !member.password?.startsWith('scrypt$')) {
    db.prepare('UPDATE members SET password = ? WHERE id = ?').run(hashPassword(password), member.id);
  }
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(member.enterprise_id);
  const session = createSession(member.id);
  res.json({ ok: true, ...session, member: safeMember(member), enterprise: ent, isGuest: 0 });
});

// 游客模式：无需账号密码，一键进入（只读成员身份 + 游客标记）
r.post('/guest', (req, res) => {
  if (!allowGuestSession(req, res)) return;
  const guest = ensureGuestMember();
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(guest.enterprise_id);
  const session = createGuestSession();
  res.json({ ok: true, ...session, member: { ...safeMember(guest), is_guest: 1 }, enterprise: ent, isGuest: 1 });
});

r.post('/logout', (req, res) => {
  const header = req.headers.authorization || '';
  revokeSession(header.startsWith('Bearer ') ? header.slice(7).trim() : '');
  res.json({ ok: true });
});

// 当前登录信息
r.get('/me', (req, res) => {
  const uid = req.headers['x-user-id'];
  if (!uid) return res.status(401).json({ ok: false, msg: '未登录' });
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(uid);
  if (!member) return res.status(401).json({ ok: false, msg: '登录已过期' });
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(member.enterprise_id);
  const isGuest = uid === 'u-guest' ? 1 : 0;
  res.json({ ok: true, member: { ...safeMember(member), is_guest: isGuest }, enterprise: ent, isGuest });
});

// 演示账号列表
r.get('/demo-accounts', (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ ok: false, msg: 'Not found' });
  const rows = db.prepare('SELECT id, name, role, enterprise_id FROM members WHERE is_demo = 1 OR enterprise_id IS NOT NULL').all();
  const ents = db.prepare('SELECT id, name FROM enterprises').all();
  res.json({ ok: true, accounts: rows, enterprises: ents });
});

// 企业列表（切换器）
r.get('/enterprises', (req, res) => {
  const uid = req.headers['x-user-id'];
  if (!uid) return res.status(401).json({ ok: false, msg: '未登录' });
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(uid);
  const ents = req.auth.isGuest
    ? db.prepare('SELECT * FROM enterprises WHERE id = ?').all(req.auth.enterpriseId)
    : db.prepare('SELECT * FROM enterprises').all();
  res.json({ ok: true, enterprises: ents, current: m.enterprise_id });
});

// 项目列表（切换器）
r.get('/projects', (req, res) => {
  const uid = req.headers['x-user-id'];
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(uid);
  const entId = req.query.enterpriseId || m?.enterprise_id;
  const rows = db.prepare('SELECT * FROM projects WHERE enterprise_id = ? ORDER BY created_at DESC').all(entId);
  res.json({ ok: true, projects: rows });
});

// 通知未读数
r.get('/unread', (req, res) => {
  const uid = req.headers['x-user-id'];
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(uid);
  if (!m) return res.json({ ok: true, count: 0 });
  const c = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND is_read = 0').get(uid).c;
  const appr = db.prepare(`SELECT COUNT(*) c FROM approvals WHERE approver_id = ? AND status = '待审批'`).get(uid).c;
  res.json({ ok: true, count: c + appr });
});

export default r;
