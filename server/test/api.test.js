import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../src/index.js');
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

test('Bearer 会话、搜索、偏好和密钥撤销形成安全闭环', async () => {
  const anonymous = await fetch(`${baseUrl}/auth/me`);
  assert.equal(anonymous.status, 401);

  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: '陈远', password: '123456' }),
  });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json();
  assert.ok(login.token.length >= 40);
  assert.notEqual(login.token, login.member.id);
  assert.equal('password' in login.member, false);
  const headers = { authorization: `Bearer ${login.token}` };

  const me = await (await fetch(`${baseUrl}/auth/me`, { headers })).json();
  assert.equal(me.member.name, '陈远');

  const search = await (await fetch(`${baseUrl}/dashboard/search?q=A100`, { headers })).json();
  assert.ok(search.results.length > 0);

  const saved = await (await fetch(`${baseUrl}/notify/preferences`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ email: true, app_push: true, billing: true, approval: false, marketing: false }),
  })).json();
  assert.equal(saved.ok, true);

  const created = await (await fetch(`${baseUrl}/notify/api-keys`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ enterpriseId: 'ent-demo', name: '自动化测试密钥' }),
  })).json();
  assert.match(created.key, /^ck_live_/);

  const keyList = await (await fetch(`${baseUrl}/notify/api-keys?enterpriseId=ent-demo`, { headers })).json();
  const key = keyList.keys.find(item => item.name === '自动化测试密钥');
  assert.ok(key.key_preview.includes('••••'));
  assert.equal('key' in key, false);

  const revokedKey = await fetch(`${baseUrl}/notify/api-keys/${key.id}`, { method: 'DELETE', headers });
  assert.equal(revokedKey.status, 200);

  await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers });
  const revokedSession = await fetch(`${baseUrl}/auth/me`, { headers });
  assert.equal(revokedSession.status, 401);
});

test('服务端角色权限阻止普通成员管理企业密钥', async () => {
  const login = await (await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: '李算法', password: '123456' }),
  })).json();
  const response = await fetch(`${baseUrl}/notify/api-keys`, {
    method: 'POST', headers: { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ enterpriseId: 'ent-demo', name: '越权密钥' }),
  });
  assert.equal(response.status, 403);
});
