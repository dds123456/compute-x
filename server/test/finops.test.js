import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'computex-finops-test-secret-at-least-32-bytes';

const { default: app } = await import('../src/index.js');
const { default: db } = await import('../src/db.js');
let server;
let baseUrl;
let headers;

before(async () => {
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api`;
      resolve();
    });
  });
  const login = await (await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: '陈远', password: '123456' }),
  })).json();
  headers = { authorization: `Bearer ${login.token}` };
});

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('FinOps 总览由租户内逐日用量事实汇总且公开口径和新鲜度', async () => {
  const response = await fetch(`${baseUrl}/finops/overview?enterpriseId=ent-lab&window=30d`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json();
  const source = db.prepare(`SELECT SUM(cost) total_cost, AVG(gpu_utilization) avg_utilization,
    SUM(CASE WHEN gpu_utilization < 20 THEN cost ELSE 0 END) idle_cost
    FROM usage_records WHERE enterprise_id = 'ent-demo'`).get();

  assert.equal(body.scope.enterpriseId, 'ent-demo');
  assert.equal(body.kpis.totalCost.value, Number(source.total_cost.toFixed(2)));
  assert.equal(body.kpis.avgGpuUtilization.value, Number(source.avg_utilization.toFixed(1)));
  assert.equal(body.kpis.idleCost.value, Number(source.idle_cost.toFixed(2)));
  assert.equal(body.source.grain, '实例 × 自然日');
  assert.ok(body.source.latestAt);
  assert.ok(body.trend.length >= 5);
  assert.ok(body.projectBreakdown.length >= 2);
  assert.ok(body.opportunities.length >= 1);
  assert.ok(body.guardrails.some(item => item.code === 'BUDGET_EXPOSURE'));
});

