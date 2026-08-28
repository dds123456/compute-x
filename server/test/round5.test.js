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

test('F17 变更配置按差价扣费并切换规格', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const before = db.prepare("SELECT balance FROM enterprises WHERE id = 'ent-demo'").get().balance;
  // ins-004：RTX 4090 6元/时 → r-06 A10 8元/时，7 天补差 14 元
  const r = await fetch(`${baseUrl}/orders/instances/ins-004/change-spec`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ resourceId: 'r-06' }) });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.fee, 14);
  const after = db.prepare("SELECT balance FROM enterprises WHERE id = 'ent-demo'").get().balance;
  assert.equal(Math.round((before - after) * 100) / 100, 14);
  const inst = db.prepare("SELECT spec, resource_id FROM instances WHERE id = 'ins-004'").get();
  assert.equal(inst.resource_id, 'r-06');
});

test('F17 快照恢复触发状态流转', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const r = await fetch(`${baseUrl}/orders/instances/ins-004/restore`, { method: 'POST', headers });
  assert.equal(r.status, 200);
  const inst = db.prepare("SELECT status FROM instances WHERE id = 'ins-004'").get();
  assert.equal(inst.status, '恢复中');
});

test('F18 移动端告警动态来自真实告警表', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const r = await (await fetch(`${baseUrl}/notify/alerts`, { headers })).json();
  assert.equal(r.ok, true);
  assert.ok(r.alerts.length >= 1);
  assert.ok(r.alerts[0].instance_name);
});