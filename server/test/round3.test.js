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
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

async function login(account, password = '123456') {
  const r = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, password }),
  });
  return { status: r.status, body: await r.json() };
}

test('F13 FinOps 维度扩展：碳排/环比/按型号/按资源方', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const finops = await (await fetch(`${baseUrl}/finops/overview`, { headers })).json();
  assert.equal(typeof finops.kpis.carbonKg.value, 'number');
  assert.ok('monthOverMonth' in finops.kpis);
  assert.ok(Array.isArray(finops.byGpuModel) && finops.byGpuModel.length > 0);
  assert.ok(Array.isArray(finops.byProvider) && finops.byProvider.length > 0);
  assert.ok(finops.guardrails.some((g) => g.code === 'IDLE_POLICY'));
  assert.ok(finops.guardrails.some((g) => g.code === 'BUDGET_EXPOSURE'));
});

test('F8 项目创建支持多级审批人与审批策略同步', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const r = await fetch(`${baseUrl}/org/projects`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ enterpriseId: 'ent-demo', name: '多级审批测试项目', ownerId: 'u-pm', budget: 20000, threshold: 8000, levels: 2, approvers: ['u-pm', 'u-fin'] }),
  });
  assert.equal(r.status, 200);
  const { id } = await r.json();
  const project = db.prepare('SELECT approval_rule FROM projects WHERE id = ?').get(id);
  const rule = JSON.parse(project.approval_rule);
  assert.equal(rule.levels, 2);
  assert.deepEqual(rule.approvers, ['u-pm', 'u-fin']);
  const policy = db.prepare('SELECT steps_json FROM approval_policies WHERE project_id = ?').get(id);
  assert.equal(JSON.parse(policy.steps_json).length, 2);
});