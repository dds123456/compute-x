import crypto from 'node:crypto';
import db from './db.js';

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000);
export const GUEST_SESSION_TTL_MS = Number(process.env.GUEST_SESSION_TTL_MS || 30 * 60 * 1000);
const GUEST_USER_ID = 'u-guest';
const GUEST_ENTERPRISE_ID = 'ent-demo';
const GUEST_SAFE_WRITE_PATHS = new Set(['/auth/logout', '/market/estimate']);
const GUEST_BLOCKED_PATH_PREFIXES = ['/admin', '/provider', '/notify/api-keys'];

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  if (!stored.startsWith('scrypt$')) {
    const left = Buffer.from(String(password));
    const right = Buffer.from(String(stored));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }
  const [, salt, expected] = stored.split('$');
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

export function createSession(userId, ttlMs = SESSION_TTL_MS) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(new Date().toISOString());
  db.prepare('INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)')
    .run(tokenHash, userId, expiresAt);
  return { token, expiresAt };
}

export function revokeSession(token) {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
}

export function authenticateApi(req, res, next) {
  const publicRoute = req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/guest';
  if (publicRoute || req.method === 'OPTIONS') return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, msg: '登录已过期，请重新登录' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?').get(tokenHash);
  if (!session || Date.parse(session.expires_at) <= Date.now()) {
    if (session) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
    return res.status(401).json({ ok: false, msg: '登录已过期，请重新登录' });
  }

  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(session.user_id);
  if (!member || member.status === '禁用') {
    return res.status(403).json({ ok: false, msg: '账号已禁用或不存在' });
  }

  const isGuest = member.id === GUEST_USER_ID;
  req.auth = { userId: member.id, enterpriseId: member.enterprise_id, role: member.role, isGuest };
  req.headers['x-user-id'] = member.id;
  if (member.enterprise_id) {
    if (req.query?.enterpriseId) req.query.enterpriseId = member.enterprise_id;
    if (req.body?.enterpriseId) req.body.enterpriseId = member.enterprise_id;
  }
  if (!['平台管理员', '资源方运营'].includes(member.role)) {
    if (req.query?.userId) req.query.userId = member.id;
    if (req.body?.userId) req.body.userId = member.id;
  }

  if (isGuest) {
    req.query.enterpriseId = GUEST_ENTERPRISE_ID;
    if (req.body && typeof req.body === 'object') req.body.enterpriseId = GUEST_ENTERPRISE_ID;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-ComputeX-Guest', '1');

    if (GUEST_BLOCKED_PATH_PREFIXES.some(prefix => req.path.startsWith(prefix))) {
      return res.status(403).json({ ok: false, msg: '游客模式无权访问该区域' });
    }

    const readMethod = req.method === 'GET' || req.method === 'HEAD';
    if (!readMethod && !GUEST_SAFE_WRITE_PATHS.has(req.path)) {
      return res.status(403).json({ ok: false, msg: '游客模式为只读体验，不能修改数据' });
    }
  }
  next();
}

export function safeMember(member) {
  if (!member) return member;
  const { password: _password, ...safe } = member;
  return safe;
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.auth?.role)) return next();
    if (process.env.NODE_ENV !== 'production' && req.auth?.userId === 'u-guest') return next();
    return res.status(403).json({ ok: false, msg: '当前角色无权执行该操作' });
  };
}
