import { Router } from 'express';
import db from '../db.js';
import { now, genId } from '../utils.js';

const r = Router();

// 登录：POST /api/auth/login { account, password } 或 { userId } / { username }（兼容一键登录）
r.post('/login', (req, res) => {
  const { userId, username, account, password } = req.body || {};
  let member;
  if (userId) member = db.prepare('SELECT * FROM members WHERE id = ?').get(userId);
  else {
    const key = account || username;
    if (!key) return res.status(400).json({ ok: false, msg: '请输入账号' });
    member = db.prepare('SELECT * FROM members WHERE name = ? OR phone = ? OR email = ?').get(key, key, key);
  }
  if (!member) return res.status(401).json({ ok: false, msg: '账号不存在，请检查后重试' });
  // 密码校验：默认 123456；一键登录（无 password 字段）跳过
  if (password !== undefined && member.password && password !== member.password) {
    return res.status(401).json({ ok: false, msg: '密码错误，请重试' });
  }
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(member.enterprise_id);
  res.json({ ok: true, token: member.id, member, enterprise: ent, isGuest: 0 });
});

// 游客模式：无需账号密码，一键进入（只读成员身份 + 游客标记）
r.post('/guest', (_req, res) => {
  let guest = db.prepare("SELECT * FROM members WHERE id = 'u-guest'").get();
  if (!guest) {
    db.prepare(`INSERT INTO members (id,enterprise_id,name,phone,email,password,role,status,is_demo,created_at) VALUES ('u-guest','ent-demo','游客体验账号','18800000000','guest@computex.demo','guest123','只读成员','正常',1,?)`)
      .run(now());
    guest = db.prepare("SELECT * FROM members WHERE id = 'u-guest'").get();
  }
  const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(guest.enterprise_id);
  res.json({ ok: true, token: guest.id, member: { ...guest, is_guest: 1 }, enterprise: ent, isGuest: 1 });
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
r.get('/enterprises', (req, res) => {
  const uid = req.headers['x-user-id'];
  if (!uid) return res.status(401).json({ ok: false, msg: '未登录' });
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(uid);
  const ents = db.prepare('SELECT * FROM enterprises').all();
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
