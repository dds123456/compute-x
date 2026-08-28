import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'computex-test-session-secret-at-least-32-bytes';

const { default: app } = await import('../src/index.js');
const { default: db } = await import('../src/db.js');
let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${server.address().port}/api`; resolve(); });
  });
});
after(async () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))));

async function login(account, password = '123456') {
  const r = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, password }) });
  return { status: r.status, body: await r.json() };
}

test('F14 平台/资源方后台专属会话可达', async () => {
  const prov = await (await fetch(`${baseUrl}/auth/backend`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: '资源方运营' }) })).json();
  const provOv = await fetch(`${baseUrl}/provider/overview?providerId=prv-cloud`, { headers: { authorization: `Bearer ${prov.token}` } });
  assert.equal(provOv.status, 200);
  assert.equal((await provOv.json()).overview.running >= 0, true);

  const adm = await (await fetch(`${baseUrl}/auth/backend`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: '平台管理员' }) })).json();
  const admOv = await fetch(`${baseUrl}/admin/overview`, { headers: { authorization: `Bearer ${adm.token}` } });
  assert.equal(admOv.status, 200);
  assert.equal(typeof (await admOv.json()).overview.utilization, 'number');
});

test('F15 仪表盘消费趋势与项目利用率来自用量事实', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const ov = await (await fetch(`${baseUrl}/dashboard/overview?enterpriseId=ent-demo`, { headers })).json();
  assert.ok(ov.overview.trend.length > 0);
  assert.equal(typeof ov.overview.trend[0].v, 'number');
  assert.ok(ov.overview.utilByProject.length >= 1);
  assert.equal(typeof ov.overview.utilByProject[0].value, 'number');
});

test('F16 充值渠道：开发入账 + 金额校验 + 记录落库', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const before = db.prepare("SELECT balance FROM enterprises WHERE id = 'ent-demo'").get().balance;
  const r = await fetch(`${baseUrl}/billing/recharge`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ enterpriseId: 'ent-demo', amount: 1000 }) });
  assert.equal(r.status, 200);
  const after = db.prepare("SELECT balance FROM enterprises WHERE id = 'ent-demo'").get().balance;
  assert.equal(Math.round((after - before) * 100) / 100, 1000);
  const rec = db.prepare("SELECT status FROM recharge_records WHERE enterprise_id = 'ent-demo' ORDER BY created_at DESC LIMIT 1").get();
  assert.equal(rec.status, '已成功');

  const bad = await fetch(`${baseUrl}/billing/recharge`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ enterpriseId: 'ent-demo', amount: -5 }) });
  assert.equal(bad.status, 400);
});