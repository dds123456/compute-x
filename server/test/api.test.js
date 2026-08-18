import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'computex-test-session-secret-at-least-32-bytes';

const { default: app } = await import('../src/index.js');
const { createGuestSession, verifyGuestSession } = await import('../src/security.js');
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

test('生产环境可创建短期只读游客会话', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const response = await fetch(`${baseUrl}/auth/guest`, { method: 'POST' });
    assert.equal(response.status, 200);

    const guest = await response.json();
    assert.equal(guest.isGuest, 1);
    assert.equal(guest.member.id, 'u-guest');
    assert.equal(guest.member.role, '只读成员');
    assert.equal(guest.member.enterprise_id, 'ent-demo');
    assert.ok(guest.token.length >= 40);

    const ttlMs = Date.parse(guest.expiresAt) - Date.now();
    assert.ok(ttlMs > 0);
    assert.ok(ttlMs <= 30 * 60 * 1000);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test('游客令牌可跨实例验证且拒绝篡改', () => {
  const session = createGuestSession();
  const claims = verifyGuestSession(session.token);
  assert.equal(claims.userId, 'u-guest');
  assert.equal(claims.enterpriseId, 'ent-demo');
  assert.ok(claims.expiresAt > Date.now());

  const tampered = `${session.token.slice(0, -1)}${session.token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(verifyGuestSession(tampered), null);
});

test('游客会话被锁定在演示租户且无法写入或访问敏感域', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const guest = await (await fetch(`${baseUrl}/auth/guest`, { method: 'POST' })).json();
    const headers = { authorization: `Bearer ${guest.token}` };

    const overviewResponse = await fetch(`${baseUrl}/dashboard/overview?enterpriseId=ent-lab`, { headers });
    assert.equal(overviewResponse.status, 200);
    const overview = await overviewResponse.json();
    assert.equal(overview.overview.balance, 38560.5);

    const enterprisesResponse = await fetch(`${baseUrl}/auth/enterprises`, { headers });
    assert.equal(enterprisesResponse.status, 200);
    const enterprises = await enterprisesResponse.json();
    assert.deepEqual(enterprises.enterprises.map(item => item.id), ['ent-demo']);

    const foreignInstanceResponse = await fetch(`${baseUrl}/orders/instances/ins-005`, { headers });
    assert.equal(foreignInstanceResponse.status, 404);

    const mutationResponse = await fetch(`${baseUrl}/orders/create`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ enterpriseId: 'ent-demo', resourceId: 'r-02', quantity: 1, hours: 1 }),
    });
    assert.equal(mutationResponse.status, 403);

    const apiKeysResponse = await fetch(`${baseUrl}/notify/api-keys?enterpriseId=ent-demo`, { headers });
    assert.equal(apiKeysResponse.status, 403);

    const adminResponse = await fetch(`${baseUrl}/admin/overview`, { headers });
    assert.equal(adminResponse.status, 403);

    const providerResponse = await fetch(`${baseUrl}/provider/overview?providerId=prv-cloud`, { headers });
    assert.equal(providerResponse.status, 403);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test('游客会话创建接口对短时间重复请求限流', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    let limitedResponse;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const response = await fetch(`${baseUrl}/auth/guest`, { method: 'POST' });
      if (response.status === 429) {
        limitedResponse = response;
        break;
      }
    }
    assert.ok(limitedResponse, '连续创建游客会话应触发限流');
    assert.ok(Number(limitedResponse.headers.get('retry-after')) > 0);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});
