import crypto from 'node:crypto';
import db from './db.js';

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000);
export const GUEST_SESSION_TTL_MS = Number(process.env.GUEST_SESSION_TTL_MS || 30 * 60 * 1000);
export const SUPER_TEST_SESSION_TTL_MS = Number(process.env.SUPER_TEST_SESSION_TTL_MS || 30 * 60 * 1000);
const GUEST_USER_ID = 'u-guest';
const GUEST_ENTERPRISE_ID = 'ent-demo';
const SUPER_TEST_USER_ID = 'u-test-superadmin';
const GUEST_SAFE_WRITE_PATHS = new Set(['/auth/logout', '/market/estimate']);
const GUEST_BLOCKED_PATH_PREFIXES = ['/admin', '/provider', '/notify/api-keys'];

function sessionSecret() {
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
  }
  return 'computex-development-session-secret-only';
}

function signSessionPayload(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function ensureGuestMember() {
  let member = db.prepare('SELECT * FROM members WHERE id = ?').get(GUEST_USER_ID);
  if (!member) {
    const unusablePassword = hashPassword(crypto.randomBytes(32).toString('base64url'));
    db.prepare(`INSERT INTO members (id,enterprise_id,name,phone,email,password,role,status,is_demo,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      GUEST_USER_ID,
      GUEST_ENTERPRISE_ID,
      '游客体验账号',
      '',
      '',
      unusablePassword,
      '只读成员',
      '正常',
      1,
      new Date().toISOString(),
    );
    member = db.prepare('SELECT * FROM members WHERE id = ?').get(GUEST_USER_ID);
  }
  return member;
}

export function createGuestSession() {
  const expiresAt = Date.now() + GUEST_SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({
    sub: GUEST_USER_ID,
    ent: GUEST_ENTERPRISE_ID,
    exp: expiresAt,
    nonce: crypto.randomBytes(12).toString('base64url'),
  })).toString('base64url');
  const signature = signSessionPayload(payload);
  return { token: `gst.${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString() };
}

export function verifyGuestSession(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [prefix, payload, providedSignature] = parts;
    if (prefix !== 'gst' || !payload || !providedSignature) return null;
    const expectedSignature = signSessionPayload(payload);
    const left = Buffer.from(providedSignature);
    const right = Buffer.from(expectedSignature);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims.sub !== GUEST_USER_ID || claims.ent !== GUEST_ENTERPRISE_ID || !Number.isFinite(claims.exp) || claims.exp <= Date.now()) return null;
    return { userId: claims.sub, enterpriseId: claims.ent, expiresAt: claims.exp };
  } catch {
    return null;
  }
}

export function ensureSuperTestMember() {
  let member = db.prepare('SELECT * FROM members WHERE id = ?').get(SUPER_TEST_USER_ID);
  if (!member) {
    const unusablePassword = hashPassword(crypto.randomBytes(32).toString('base64url'));
    db.prepare(`INSERT INTO members (id,enterprise_id,name,phone,email,password,role,status,is_demo,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      SUPER_TEST_USER_ID,
      GUEST_ENTERPRISE_ID,
      '功能测试超级管理员',
      '',
      '',
      unusablePassword,
      '平台管理员',
      '正常',
      0,
      new Date().toISOString(),
    );
    member = db.prepare('SELECT * FROM members WHERE id = ?').get(SUPER_TEST_USER_ID);
  }
  return member;
}

export function createSuperTestSession() {
  const expiresAt = Date.now() + SUPER_TEST_SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({
    sub: SUPER_TEST_USER_ID,
    role: '平台管理员',
    exp: expiresAt,
    nonce: crypto.randomBytes(12).toString('base64url'),
  })).toString('base64url');
  const signature = signSessionPayload(payload);
  return { token: `sat.${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString() };
}

export function verifySuperTestSession(token) {
  try {
    if (process.env.SUPER_TEST_ENABLED !== 'true') return null;
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [prefix, payload, providedSignature] = parts;
    if (prefix !== 'sat' || !payload || !providedSignature) return null;
    const expectedSignature = signSessionPayload(payload);
    const left = Buffer.from(providedSignature);
    const right = Buffer.from(expectedSignature);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims.sub !== SUPER_TEST_USER_ID || claims.role !== '平台管理员' || !Number.isFinite(claims.exp) || claims.exp <= Date.now()) return null;
    return { userId: claims.sub, role: claims.role, expiresAt: claims.exp };
  } catch {
    return null;
  }
}

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
  if (token.startsWith('gst.')) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
}

export function authenticateApi(req, res, next) {
  const publicRoute = req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/guest';
  if (publicRoute || req.method === 'OPTIONS') return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, msg: '登录已过期，请重新登录' });

  let sessionUserId;
  let member;
  if (token.startsWith('gst.')) {
    const guestSession = verifyGuestSession(token);
    if (!guestSession) return res.status(401).json({ ok: false, msg: '游客会话已过期，请重新进入' });
    sessionUserId = guestSession.userId;
    member = ensureGuestMember();
  } else if (token.startsWith('sat.')) {
    const superTestSession = verifySuperTestSession(token);
    if (!superTestSession) return res.status(401).json({ ok: false, msg: '测试账号会话已过期，请重新登录' });
    sessionUserId = superTestSession.userId;
    member = ensureSuperTestMember();
  } else {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?').get(tokenHash);
    if (!session || Date.parse(session.expires_at) <= Date.now()) {
      if (session) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
      return res.status(401).json({ ok: false, msg: '登录已过期，请重新登录' });
    }
    sessionUserId = session.user_id;
    member = db.prepare('SELECT * FROM members WHERE id = ?').get(sessionUserId);
  }

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
