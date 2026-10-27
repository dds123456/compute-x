import { Router } from 'express';
import db from '../db.js';
import { now, genId } from '../utils.js';
import { createGuestSession, createRateLimiter, createSession, createSuperTestSession, ensureBackendMember, ensureSuperTestMember, revokeSession, safeMember, verifyPassword } from '../security.js';

// 游客入口限流：提示词 §3.6 要求 10 分钟 20 次（可用 GUEST_RATE_LIMIT_MAX 覆盖）
const guestRateLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: Number(process.env.GUEST_RATE_LIMIT_MAX || 20), keyPrefix: 'guest' });

const r = Router();

// 登录失败锁定：按账号 + IP 计数，连续 8 次错误后锁定 10 分钟（提示词 §3.6：IP + 账号）
const LOGIN_FAIL_LIMIT = 8;
const LOGIN_LOCK_MS = 10 * 60 * 1000;
const loginFailures = new Map();

function loginKey(req, account) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  return `${ip}|${String(account || '').toLowerCase()}`;
}

// 超级测试账号：仅在 SUPER_TEST_ENABLED=true 且配置了密码哈希时可用（用于功能测试，不对普通环境开放）
function superTestLogin(account, password) {
  if (process.env.SUPER_TEST_ENABLED !== 'true') return null;
  if (account !== process.env.SUPER_TEST_ACCOUNT || !process.env.SUPER_TEST_PASSWORD_HASH) return null;
  return verifyPassword(password, process.env.SUPER_TEST_PASSWORD_HASH) ? ensureSuperTestMember() : false;
}

// 登录：POST /api/auth/login { account, password } 或 { userId } / { username }（兼容一键登录）
r.post('/login', (req, res) => {
  const { userId, username, account, password } = req.body || {};
  const key = account || username;
  const failureKey = loginKey(req, key);
  const failure = loginFailures.get(failureKey);
  if (failure && failure.lockedUntil > Date.now()) {
    res.setHeader('Retry-After', String(Math.ceil((failure.lockedUntil - Date.now()) / 1000)));
    return res.status(429).json({ ok: false, msg: '登录失败次数过多，请 10 分钟后再试' });
  }

  let member;
  const superMember = !userId && key ? superTestLogin(key, password) : null;
  if (superMember === false) member = null;
  else if (superMember) member = superMember;
  else if (userId) member = db.prepare('SELECT * FROM members WHERE id = ?').get(userId);
  else {
    if (!key) return res.status(400).json({ ok: false, msg: '请输入账号' });
    member = db.prepare('SELECT * FROM members WHERE name = ? OR phone = ? OR email = ?').get(key, key, key);
  }
  if (!member) {
    recordLoginFailure(failureKey);
    return res.status(401).json({ ok: false, msg: '账号不存在或密码错误，请检查后重试' });
  }
  // 游客体验账号只能通过 /auth/guest 进入，不接受账号密码登录
  if (member.id === 'u-guest' && !superMember) {
    return res.status(403).json({ ok: false, msg: '游客账号请使用“游客体验”入口进入' });
  }
  // 密码校验：默认 123456；一键登录（无 password 字段）跳过
  if (!superMember && password !== undefined && member.password && password !== member.password) {
    recordLoginFailure(failureKey);
    return res.status(401).json({ ok: false, msg: '密码错误，请重试' });
  }
  loginFailures.delete(failureKey);
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(member.enterprise_id);
  // 超管使用带 TTL 的签名会话（sat. 前缀），与普通会话隔离
  const session = superMember ? createSuperTestSession() : createSession(member.id);
  res.json({ ok: true, token: session.token, expiresAt: session.expiresAt, member: safeMember(member), enterprise: ent, isGuest: 0 });
});

function recordLoginFailure(failureKey) {
  const current = loginFailures.get(failureKey) || { count: 0, lockedUntil: 0 };
  current.count += 1;
  if (current.count >= LOGIN_FAIL_LIMIT) {
    current.lockedUntil = Date.now() + LOGIN_LOCK_MS;
    current.count = 0;
  }
  loginFailures.set(failureKey, current);
}

// 游客模式：无需账号密码，一键进入（只读成员身份 + 游客标记）
r.post('/guest', guestRateLimit, (_req, res) => {
  let guest = db.prepare("SELECT * FROM members WHERE id = 'u-guest'").get();
  if (!guest) {
    db.prepare(`INSERT INTO members (id,enterprise_id,name,phone,email,password,role,status,is_demo,created_at) VALUES ('u-guest','ent-demo','游客体验账号','18800000000','guest@computex.demo','guest123','只读成员','正常',1,?)`)
      .run(now());
    guest = db.prepare("SELECT * FROM members WHERE id = 'u-guest'").get();
  }
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(guest.enterprise_id);
  const session = createGuestSession();
  res.json({ ok: true, token: session.token, expiresAt: session.expiresAt, member: { ...safeMember(guest), is_guest: 1 }, enterprise: ent, isGuest: 1 });
});

// 后台一键进入：平台管理员 / 资源方运营的演示会话（路由公开，与前端后台入口配套）
r.post('/backend', (req, res) => {
  const role = req.body?.role;
  if (!['平台管理员', '资源方运营'].includes(role)) return res.status(400).json({ ok: false, msg: '后台角色只能是平台管理员或资源方运营' });
  const member = ensureBackendMember(role);
  const session = createSession(member.id);
  res.json({ ok: true, token: session.token, expiresAt: session.expiresAt, member: safeMember(member) });
});

// 登出：撤销当前 Bearer 会话（游客令牌为无状态签名令牌，无服务端记录）
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
  res.json({ ok: true, member: { ...member, is_guest: isGuest }, enterprise: ent, isGuest });
});

// 演示账号列表
r.get('/demo-accounts', (req, res) => {
  const rows = db.prepare('SELECT id, name, role, enterprise_id FROM members WHERE is_demo = 1 OR enterprise_id IS NOT NULL').all();
  const ents = db.prepare('SELECT id, name FROM enterprises').all();
  res.json({ ok: true, accounts: rows, enterprises: ents });
});

// 企业列表（切换器）
// 企业切换器：只列出会话所属企业（平台管理员可见全部）
r.get('/enterprises', (req, res) => {
  const uid = req.headers['x-user-id'];
  if (!uid) return res.status(401).json({ ok: false, msg: '未登录' });
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(uid);
  if (!m) return res.status(401).json({ ok: false, msg: '登录已过期' });
  const isPlatform = req.auth?.role === '平台管理员';
  const ents = isPlatform
    ? db.prepare('SELECT * FROM enterprises').all()
    : db.prepare('SELECT * FROM enterprises WHERE id = ?').all(m.enterprise_id);
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
