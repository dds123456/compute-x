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

// 后台演示账号（平台管理员 / 资源方运营），供后台一键进入使用
// 资源方运营演示账号绑定到华东智算中心（prv-cloud）；平台管理员不绑定资源方
export const DEMO_PROVIDER_ID = 'prv-cloud';

export function ensureBackendMember(role) {
  const id = role === '平台管理员' ? 'u-admin-platform' : 'u-provider-operator';
  const providerId = role === '资源方运营' ? DEMO_PROVIDER_ID : null;
  let member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  if (!member) {
    db.prepare(`INSERT INTO members (id,enterprise_id,name,phone,email,password,role,status,is_demo,created_at,provider_id)
      VALUES (?,?,?,?,?,?,?,?,1,?,?)`).run(
      id, '', role === '平台管理员' ? '平台运营中心' : '华东智算中心运营', '', '',
      hashPassword(crypto.randomBytes(16).toString('base64url')), role, '正常', new Date().toISOString(), providerId,
    );
    member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  } else if (providerId && member.provider_id !== providerId) {
    // 已存在的记录（如早期数据库）补绑定，保证资源方账号总能看到自己的供给
    db.prepare('UPDATE members SET provider_id = ? WHERE id = ?').run(providerId, id);
    member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  }
  return member;
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

// 普通登录会话：签名令牌（usr. 前缀，HMAC 由 SESSION_SECRET 生成）。
// 令牌自带用户与过期时间，任何 Vercel 实例都能校验，不再依赖实例本地的 SQLite（原先多实例下会 401 踢回登录页）。
// 代价：服务端无法在过期前让令牌失效；撤销只记在当前实例内存中（见 revokedSignedTokens）。
export function createSession(userId, ttlMs = SESSION_TTL_MS) {
  const expiresAtMs = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ typ: 'usr', sub: String(userId), exp: expiresAtMs })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return { token: `usr.${payload}.${signature}`, expiresAt: new Date(expiresAtMs).toISOString() };
}

const revokedSignedTokens = new Map();

function verifySignedSession(token) {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'usr') return null;
  const [, payload, signature] = parts;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims.typ !== 'usr' || typeof claims.sub !== 'string' || !Number.isFinite(claims.exp) || claims.exp <= Date.now()) return null;
    return { userId: claims.sub, expiresAt: claims.exp };
  } catch {
    return null;
  }
}

// 后台演示账号在新实例上可能还没有记录，按需补建，保证令牌在任何实例都能解析
function sessionMember(userId) {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(userId);
  if (member) return member;
  if (userId === 'u-admin-platform') return ensureBackendMember('平台管理员');
  if (userId === 'u-provider-operator') return ensureBackendMember('资源方运营');
  return undefined;
}

export function revokeSession(token) {
  if (!token) return;
  if (token.startsWith('gst.')) return;
  if (token.startsWith('usr.')) {
    // 签名令牌只能在当前实例内撤销：记入内存表，直到令牌自然过期
    const signed = verifySignedSession(token);
    if (signed) revokedSignedTokens.set(token, signed.expiresAt);
    for (const [key, expiresAt] of revokedSignedTokens) {
      if (expiresAt <= Date.now()) revokedSignedTokens.delete(key);
    }
    return;
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
}

export function authenticateApi(req, res, next) {
  const publicRoute = req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/guest' || req.path === '/auth/backend';
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
  } else if (token.startsWith('usr.')) {
    const signed = verifySignedSession(token);
    if (!signed || revokedSignedTokens.has(token)) return res.status(401).json({ ok: false, msg: '登录已过期，请重新登录' });
    sessionUserId = signed.userId;
    member = sessionMember(sessionUserId);
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
  // providerId 仅资源方运营账号有值；资源方路由必须以它为准，不得信任请求参数
  req.auth = { userId: member.id, enterpriseId: member.enterprise_id, role: member.role, providerId: member.provider_id || null, isGuest };
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

// 进程内通用限流器（默认内存 Map，可通过替换 createRateLimiter 注入 Redis 等外部存储实现可插拔）
export function createRateLimiter({ windowMs = 10 * 60 * 1000, max = 60, keyPrefix = 'rl' } = {}) {
  const buckets = new Map();
  return function rateLimit(req, res, next) {
    const forwarded = String(req.headers['x-forwarded-for'] || '');
    const ip = forwarded.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const nowMs = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= nowMs) {
      bucket = { count: 0, resetAt: nowMs + windowMs };
      buckets.set(key, bucket);
    }
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count - 1)));
    if (bucket.count >= max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000))));
      return res.status(429).json({ ok: false, msg: '操作过于频繁，请稍后再试' });
    }
    bucket.count += 1;
    next();
  };
}

// 登录/游客身份常量（供测试与路由复用）
export const TENANT_ROLES = ['平台管理员', '资源方运营'];
