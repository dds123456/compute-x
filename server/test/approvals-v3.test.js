import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'computex-approval-test-secret-at-least-32-bytes';

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
  headers = { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' };
});

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('多级审批只改变决策状态，不在审批接口内隐式支付或交付', async () => {
  const rec = await (await fetch(`${baseUrl}/advisor/recommend`, {
    method: 'POST', headers,
    body: JSON.stringify({ workloadType: '大模型训练', modelName: 'Qwen3-32B', modelSizeB: 32, dataSizeGB: 300, deadlineHours: 300, budget: 30000, region: '上海' }),
  })).json();
  const chosen = rec.recommendation.plans.find(plan => plan.totalCost >= 8000);
  assert.ok(chosen);
  const draft = await (await fetch(`${baseUrl}/advisor/recommendations/${rec.recommendation.id}/draft`, {
    method: 'POST', headers, body: JSON.stringify({ planId: chosen.planId, projectId: 'p-infer' }),
  })).json();
  const orderCountBefore = db.prepare('SELECT COUNT(*) count FROM orders').get().count;
  const instanceCountBefore = db.prepare('SELECT COUNT(*) count FROM instances').get().count;

  const submitResponse = await fetch(`${baseUrl}/approvals-v3/drafts/${draft.draft.id}/submit`, { method: 'POST', headers });
  assert.equal(submitResponse.status, 201);
  const submitted = await submitResponse.json();
  assert.equal(submitted.request.status, '待审批');
  assert.equal(submitted.request.steps.length, 1);
  assert.equal(submitted.request.steps[0].approverId, 'u-admin');

  const decisionResponse = await fetch(`${baseUrl}/approvals-v3/requests/${submitted.request.id}/decision`, {
    method: 'POST', headers, body: JSON.stringify({ action: '通过', comment: '预算与资源证据已核验' }),
  });
  assert.equal(decisionResponse.status, 200);
  const decision = await decisionResponse.json();
  assert.equal(decision.request.status, '已通过');
  assert.equal(decision.request.draftStatus, '待确认');
  assert.equal(db.prepare('SELECT COUNT(*) count FROM orders').get().count, orderCountBefore);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM instances').get().count, instanceCountBefore);

  const confirmResponse = await fetch(`${baseUrl}/advisor/drafts/${draft.draft.id}/confirm`, { method: 'POST', headers });
  assert.equal(confirmResponse.status, 201);
  const confirmation = await confirmResponse.json();
  assert.equal(confirmation.order.status, '待支付');
  assert.equal(confirmation.order.amount, chosen.totalCost);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM orders').get().count, orderCountBefore + 1);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM instances').get().count, instanceCountBefore);
});
