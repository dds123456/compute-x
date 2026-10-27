import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'computex-provider-scope-test-secret-at-least-32';

const { default: app } = await import('../src/index.js');
const { default: db } = await import('../src/db.js');
let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

// 资源方运营（绑定 prv-cloud）的会话令牌
async function providerToken() {
  const r = await fetch(`${baseUrl}/auth/backend`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: '资源方运营' }),
  });
  return (await r.json()).token;
}

test('资源方运营只能看到自己绑定的资源方数据，参数中的 providerId 被忽略', async () => {
  const token = await providerToken();
  const headers = { authorization: `Bearer ${token}` };

  // 即使请求别的资源方（prv-idc），返回的也是会话绑定的 prv-cloud 概览
  const own = await (await fetch(`${baseUrl}/provider/overview?providerId=prv-cloud`, { headers })).json();
  const spoof = await (await fetch(`${baseUrl}/provider/overview?providerId=prv-idc`, { headers })).json();
  assert.equal(spoof.ok, true);
  assert.deepEqual(spoof.overview, own.overview);

  // 资源列表同样只包含 prv-cloud 的资源
  const resources = await (await fetch(`${baseUrl}/provider/resources?providerId=prv-idc`, { headers })).json();
  assert.ok(resources.resources.length > 0);
  assert.ok(resources.resources.every((item) => item.provider_id === 'prv-cloud'));
});

test('未绑定资源方的运营账号无权访问任何资源方数据', async () => {
  db.prepare(`INSERT OR IGNORE INTO members (id,enterprise_id,name,password,role,status,is_demo) VALUES ('u-unbound-prov','','无绑定运营','123456','资源方运营','正常',1)`).run();
  const r = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'u-unbound-prov', password: '123456' }),
  });
  const { token } = await r.json();
  const response = await fetch(`${baseUrl}/provider/overview?providerId=prv-cloud`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 403);
});

test('企业成员无法访问资源方路由', async () => {
  const r = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: '陈远', password: '123456' }),
  });
  const { token } = await r.json();
  const response = await fetch(`${baseUrl}/provider/overview?providerId=prv-cloud`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 403);
});

test('资源方运营提现其他资源方的结算单返回 404（与不存在一致）', async () => {
  const token = await providerToken();
  const response = await fetch(`${baseUrl}/billing/settlements/st-04/withdraw`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 404);
});
