import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'computex-test-session-secret-at-least-32-bytes';

const { default: app } = await import('../src/index.js');
const { default: db } = await import('../src/db.js');
const { createSession } = await import('../src/security.js');
let server;
let baseUrl;

before(async () => {
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

const postJson = (path, body) => fetch(`${baseUrl}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('一键演示登录发出签名会话，本地会话表清空后仍然有效（多实例场景）', async () => {
  const response = await postJson('/auth/login', { userId: 'u-admin' });
  assert.equal(response.status, 200);
  const login = await response.json();
  assert.ok(login.token.startsWith('usr.'));
  db.prepare('DELETE FROM auth_sessions').run();
  const me = await fetch(`${baseUrl}/auth/me`, { headers: { authorization: `Bearer ${login.token}` } });
  assert.equal(me.status, 200);
});

test('只给账号名或手机号、不给密码，不能登录', async () => {
  const response = await postJson('/auth/login', { account: '陈远' });
  assert.equal(response.status, 400);
});

test('非演示账号不能只凭 userId 一键登录，但输入正确密码可以登录', async () => {
  db.prepare(`INSERT INTO members (id,enterprise_id,name,phone,email,password,role,status,is_demo,created_at)
    VALUES ('u-real-customer','ent-demo','真实客户','13700000000','real@example.com','customer-pass-42','企业管理员','正常',0,?)`)
    .run(new Date().toISOString());
  const oneClick = await postJson('/auth/login', { userId: 'u-real-customer' });
  assert.equal(oneClick.status, 403);
  const withPassword = await postJson('/auth/login', { account: 'real@example.com', password: 'customer-pass-42' });
  assert.equal(withPassword.status, 200);
});

test('过期或签名被篡改的会话会被拒绝', async () => {
  const expired = createSession('u-admin', -1000).token;
  const login = await (await postJson('/auth/login', { userId: 'u-admin' })).json();
  const forged = `${login.token.slice(0, -4)}AAAA`;
  for (const token of [expired, forged]) {
    const r = await fetch(`${baseUrl}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(r.status, 401);
  }
});

test('退出登录后，同一实例上的签名会话立即失效', async () => {
  const { token } = await (await postJson('/auth/login', { userId: 'u-eng' })).json();
  const headers = { authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${baseUrl}/auth/me`, { headers })).status, 200);
  await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers });
  assert.equal((await fetch(`${baseUrl}/auth/me`, { headers })).status, 401);
});
