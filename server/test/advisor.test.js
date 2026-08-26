import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'computex-advisor-test-secret-at-least-32-bytes';

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
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: '陈远', password: '123456' }),
  });
  const login = await response.json();
  headers = { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' };
});

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('算力顾问只基于真实可售库存生成可审计方案并锁定租户', async () => {
  const response = await fetch(`${baseUrl}/advisor/recommend`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      enterpriseId: 'ent-lab',
      workloadType: '大模型微调',
      modelName: 'Qwen3-32B',
      modelSizeB: 32,
      dataSizeGB: 480,
      deadlineHours: 36,
      budget: 9000,
      region: '上海',
      compliance: ['数据不出境'],
    }),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.recommendation.enterpriseId, 'ent-demo');
  assert.equal(body.recommendation.status, '已生成');
  assert.equal(body.recommendation.plans.length, 3);
  assert.ok(['gateway', 'deterministic-fallback'].includes(body.recommendation.engine));

  for (const plan of body.recommendation.plans) {
    const source = db.prepare('SELECT * FROM resources WHERE id = ?').get(plan.resourceId);
    assert.ok(source, '推荐资源必须存在');
    assert.equal(source.status, '可售');
    assert.ok(source.stock >= plan.quantity);
    assert.equal(source.region, '上海');
    assert.equal(plan.evidence.priceHour, source.price_hour);
    assert.equal(plan.evidence.stockAtQuote, source.stock);
    assert.equal(plan.totalCost, Number((source.price_hour * plan.quantity * plan.estimatedHours).toFixed(2)));
    assert.ok(plan.explanation.length >= 20);
  }
});

test('推荐输入校验拒绝无法形成可靠决策的请求', async () => {
  const response = await fetch(`${baseUrl}/advisor/recommend`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ workloadType: '', modelSizeB: -1, deadlineHours: 0, budget: -1 }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.ok(Array.isArray(body.errors));
});

test('推荐方案可转为租户内不可篡改报价的订单草稿', async () => {
  const recommendationResponse = await fetch(`${baseUrl}/advisor/recommend`, {
    method: 'POST', headers,
    body: JSON.stringify({
      workloadType: '在线推理', modelName: 'Qwen3-14B', modelSizeB: 14,
      dataSizeGB: 120, deadlineHours: 24, budget: 3000, region: '上海', compliance: [],
    }),
  });
  const { recommendation } = await recommendationResponse.json();
  const chosen = recommendation.plans[0];

  const draftResponse = await fetch(`${baseUrl}/advisor/recommendations/${recommendation.id}/draft`, {
    method: 'POST', headers,
    body: JSON.stringify({ planId: chosen.planId, projectId: 'p-infer', amount: 0, resourceId: 'r-09' }),
  });
  assert.equal(draftResponse.status, 201);
  const { draft } = await draftResponse.json();
  assert.equal(draft.enterpriseId, 'ent-demo');
  assert.equal(draft.resourceId, chosen.resourceId);
  assert.equal(draft.amount, chosen.totalCost);
  assert.equal(draft.status, '草稿');
  assert.equal(draft.approvalPreview.required, chosen.totalCost >= 8000);

  const persisted = db.prepare('SELECT * FROM order_drafts WHERE id = ?').get(draft.id);
  assert.equal(persisted.amount, chosen.totalCost);
  assert.equal(persisted.enterprise_id, 'ent-demo');
});
