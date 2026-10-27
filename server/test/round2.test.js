import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'computex-test-session-secret-at-least-32-bytes';
process.env.SUPER_TEST_ENABLED = 'true';
process.env.SUPER_TEST_ACCOUNT = 'computex.qa.superadmin';
process.env.SUPER_TEST_PASSWORD_HASH = `scrypt$super-test-salt$${crypto.scryptSync('Correct-Test-Password!42', 'super-test-salt', 64).toString('hex')}`;

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

async function post(url, body, token) {
  return fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function login(account, password = '123456') {
  const r = await post('/auth/login', { account, password });
  return { status: r.status, body: await r.json() };
}

async function superHeaders() {
  const r = await post('/auth/login', { account: process.env.SUPER_TEST_ACCOUNT, password: 'Correct-Test-Password!42' });
  return { authorization: `Bearer ${(await r.json()).token}` };
}

async function providerHeaders() {
  // 资源方运营账号必须绑定具体资源方（provider_id），否则资源方路由的守卫会拒绝访问
  db.prepare(`INSERT OR IGNORE INTO members (id,enterprise_id,name,password,role,status,is_demo,provider_id) VALUES ('u-prov','','华东运营','123456','资源方运营','正常',1,'prv-cloud')`).run();
  const r = await post('/auth/login', { userId: 'u-prov', password: '123456' });
  return { authorization: `Bearer ${(await r.json()).token}` };
}

test('F6 资源评测与评论来自数据表并可新增', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const before = await (await fetch(`${baseUrl}/market/resources/r-02`, { headers })).json();
  assert.ok(before.resource.benches.length >= 3);
  assert.ok(before.resource.reviews.length >= 1);

  const countBefore = db.prepare("SELECT COUNT(*) c FROM resource_reviews WHERE resource_id = 'r-02'").get().c;
  const review = await post('/market/resources/r-02/review', { content: '测试评价：交付稳定', stars: 5 }, admin.body.token);
  assert.equal(review.status, 200);
  const countAfter = db.prepare("SELECT COUNT(*) c FROM resource_reviews WHERE resource_id = 'r-02'").get().c;
  assert.equal(countAfter, countBefore + 1);
});

test('F9 续费真实扣减余额并顺延到期', async () => {
  const admin = await login('陈远');
  const beforeBalance = db.prepare("SELECT balance FROM enterprises WHERE id = 'ent-demo'").get().balance;
  const r = await post('/orders/instances/ins-006/action', { action: '续费' }, admin.body.token);
  assert.equal(r.status, 200);
  const afterBalance = db.prepare("SELECT balance FROM enterprises WHERE id = 'ent-demo'").get().balance;
  assert.equal(Math.round((beforeBalance - afterBalance) * 100) / 100, 1008); // RTX 4090 6元/时 × 168 小时（续费 7 天，按小时计价）
  const inst = db.prepare("SELECT status FROM instances WHERE id = 'ins-006'").get();
  assert.equal(inst.status, '运行中');
});

test('F10 平台与资源方报表真实计算', async () => {
  const sh = await superHeaders();
  const adminOv = await (await fetch(`${baseUrl}/admin/overview`, { headers: sh })).json();
  assert.equal(typeof adminOv.overview.utilization, 'number');
  assert.ok(adminOv.overview.trend.length >= 1);

  const ph = await providerHeaders();
  const provOv = await (await fetch(`${baseUrl}/provider/overview?providerId=prv-cloud`, { headers: ph })).json();
  assert.equal(typeof provOv.overview.monthRevenue, 'number');
  assert.ok(Array.isArray(provOv.overview.trend));
});

test('F7 月度结算生成与提现状态校验', async () => {
  const sh = await superHeaders();
  const run = await post('/admin/settlements/run', { period: '2026-08' }, sh.authorization.slice(7));
  assert.equal(run.status, 200);
  const runBody = await run.json();
  assert.ok(runBody.created + runBody.updated >= 1);

  // 状态校验需要一条本资源方（prv-cloud）的待结算单；2026-08 已存在的单据按幂等规则不重算，因此显式准备一条
  db.prepare(`INSERT INTO settlements (id,settle_no,provider_id,period,gmv,commission,amount,status,cycle,created_at) VALUES ('st-own-01','STLOWN001','prv-cloud','2026-09',1000,70,930,'待结算','T+7',datetime('now','localtime'))`).run();

  const ph = await providerHeaders();
  const first = await fetch(`${baseUrl}/billing/settlements/st-own-01/withdraw`, { method: 'POST', headers: ph });
  assert.equal(first.status, 200);
  const second = await fetch(`${baseUrl}/billing/settlements/st-own-01/withdraw`, { method: 'POST', headers: ph });
  assert.equal(second.status, 400);

  // 归属校验：资源方运营提现其他资源方（prv-idc）的单据必须失败，且与“不存在”一致返回 404
  const foreign = await fetch(`${baseUrl}/billing/settlements/st-03/withdraw`, { method: 'POST', headers: ph });
  assert.equal(foreign.status, 404);
});