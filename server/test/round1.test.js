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
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, password }),
  });
  return { status: r.status, body: await r.json() };
}

test('F1 租户隔离：跨企业访问账单/实例/工单被拒绝', async () => {
  const admin = await login('陈远');
  assert.equal(admin.status, 200);
  const headers = { authorization: `Bearer ${admin.body.token}` };

  const foreignBill = await fetch(`${baseUrl}/billing/bills/bill-03`, { headers });
  assert.equal(foreignBill.status, 404);

  const payForeignBill = await fetch(`${baseUrl}/billing/bills/bill-03/pay`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.equal(payForeignBill.status, 404);

  const foreignInstance = await fetch(`${baseUrl}/orders/instances/ins-005`, { headers });
  assert.equal(foreignInstance.status, 404);

  const foreignAction = await fetch(`${baseUrl}/orders/instances/ins-005/action`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ action: '停止' }),
  });
  assert.equal(foreignAction.status, 404);

  const lab = await login('周教授');
  const labHeaders = { authorization: `Bearer ${lab.body.token}` };
  const foreignTicket = await fetch(`${baseUrl}/tickets/tickets/tk-01`, { headers: labHeaders });
  assert.equal(foreignTicket.status, 404);
});

test('F1 订阅写入使用登录企业而非硬编码', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const sub = await fetch(`${baseUrl}/market/subscribe`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ resourceId: 'r-01' }),
  });
  assert.equal(sub.status, 200);
  const row = db.prepare('SELECT enterprise_id, member_id FROM subscriptions WHERE resource_id = ?').get('r-01');
  assert.equal(row.enterprise_id, 'ent-demo');
  assert.equal(row.member_id, 'u-admin');
});

test('F1 账单明细按用量事实汇总（优先 usage_records）', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const r = await (await fetch(`${baseUrl}/billing/bills/bill-02/items`, { headers })).json();
  assert.equal(r.source, 'usage_records');
  assert.ok(r.items.length > 0);
  assert.ok(r.items.every((i) => i.instance_id && Number(i.amount) >= 0));
});

test('F2 登录失败锁定：连续错误密码触发 429', async () => {
  for (let i = 0; i < 8; i += 1) {
    const r = await login('林财务', 'wrong-password');
    assert.equal(r.status, 401);
  }
  const locked = await login('林财务', 'wrong-password');
  assert.equal(locked.status, 429);
});

test('F3 工单 SLA 统计与升级动作可用', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const stats = await (await fetch(`${baseUrl}/tickets/tickets/sla-stats?enterpriseId=ent-demo`, { headers })).json();
  assert.equal(stats.ok, true);
  assert.ok('firstResponseRate' in stats.stats);

  const esc = await fetch(`${baseUrl}/tickets/tickets/tk-02/escalate`, { method: 'POST', headers });
  assert.equal(esc.status, 200);
  const t = db.prepare("SELECT priority FROM tickets WHERE id = 'tk-02'").get();
  assert.equal(t.priority, '紧急');
  const audit = db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE target = 'TK20260817002'").get();
  assert.ok(audit.c >= 1);
});

test('F4 实例监控/日志/计费明细来自真实数据表', async () => {
  const admin = await login('陈远');
  const headers = { authorization: `Bearer ${admin.body.token}` };
  const inst = await (await fetch(`${baseUrl}/orders/instances/ins-001`, { headers })).json();
  assert.equal(inst.instance.monitor.gpu.length, 60);

  const logs = await (await fetch(`${baseUrl}/orders/instances/ins-001/logs`, { headers })).json();
  assert.ok(logs.lines.length > 3);
  assert.ok(logs.lines.some((l) => l.includes('nvidia-smi')));

  const usage = await (await fetch(`${baseUrl}/orders/instances/ins-001/usage`, { headers })).json();
  assert.equal(usage.usage.length, 7);
  assert.ok(usage.usage.every((u) => u.usage_date && Number(u.cost) >= 0));
});