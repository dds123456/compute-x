import { Router } from 'express';
import db from '../db.js';
import { now, genId, notify, auditLog } from '../utils.js';

const r = Router();

// ============ 成员 ============
r.get('/members', (req, res) => {
  const rows = db.prepare('SELECT * FROM members WHERE enterprise_id = ? ORDER BY created_at').all(req.query.enterpriseId);
  res.json({ ok: true, members: rows });
});

r.post('/members', (req, res) => {
  const { enterpriseId, name, phone, email, role, projectIds } = req.body || {};
  const id = genId('u');
  db.prepare(`INSERT INTO members (id,enterprise_id,name,phone,email,password,role,status,project_ids,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, enterpriseId, name, phone, email || `${phone}@invite.com`, '123456', role, '待激活', JSON.stringify(projectIds || []), now());
  auditLog(enterpriseId, req.headers['x-user-id'], '成员', '邀请成员', `${name}（${role}）`);
  notify(enterpriseId, req.headers['x-user-id'], '系统', '邀请已发送', `已向 ${email || phone} 发送邀请链接（有效期 72 小时）`, '/members');
  res.json({ ok: true, msg: '邀请已发送', id });
});

r.post('/members/:id/status', (req, res) => {
  const { status } = req.body || {};
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE members SET status=? WHERE id=?').run(status, m.id);
  auditLog(m.enterprise_id, req.headers['x-user-id'], '成员', status === '禁用' ? '禁用成员' : '启用成员', m.name);
  res.json({ ok: true });
});

// 离职交接
r.post('/members/:id/transfer', (req, res) => {
  const { toId } = req.body || {};
  const from = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  const to = db.prepare('SELECT * FROM members WHERE id = ?').get(toId);
  db.prepare('UPDATE projects SET owner_id = ? WHERE owner_id = ?').run(toId, from.id);
  db.prepare('UPDATE instances SET member_id = ? WHERE member_id = ?').run(toId, from.id);
  db.prepare(`UPDATE members SET status='禁用' WHERE id=?`).run(from.id);
  auditLog(from.enterprise_id, req.headers['x-user-id'], '成员', '离职交接', `${from.name} → ${to.name}`);
  notify(from.enterprise_id, toId, '系统', '离职交接完成', `已接收 ${from.name} 的实例与项目所有权`, '/members');
  res.json({ ok: true, msg: '交接完成，原成员已禁用' });
});

// ============ 项目 ============
r.post('/projects', (req, res) => {
  const { enterpriseId, name, ownerId, budget, threshold } = req.body || {};
  const id = genId('p');
  db.prepare(`INSERT INTO projects (id,enterprise_id,name,owner_id,budget,used,approval_rule,status,created_at) VALUES (?,?,?,?,?,0,?,?,?)`)
    .run(id, enterpriseId, name, ownerId, Number(budget), JSON.stringify({ threshold: Number(threshold || 0), approvers: [ownerId], levels: 1 }), '正常', now());
  auditLog(enterpriseId, req.headers['x-user-id'], '成员', '创建项目', `${name}（预算 ${budget} 元）`);
  res.json({ ok: true, msg: '项目创建成功', id });
});

r.post('/projects/:id/budget', (req, res) => {
  const { budget } = req.body || {};
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE projects SET budget=? WHERE id=?').run(Number(budget), p.id);
  auditLog(p.enterprise_id, req.headers['x-user-id'], '成员', '修改项目预算', `${p.name} → ${budget} 元`);
  res.json({ ok: true, msg: '预算已更新' });
});

// ============ 审批 ============
r.get('/approvals', (req, res) => {
  const { userId, enterpriseId } = req.query;
  const rows = db.prepare(`SELECT a.*, m.name applicant_name FROM approvals a LEFT JOIN members m ON a.applicant_id = m.id ORDER BY datetime(a.created_at) DESC`)
    .all().filter(a => a.applicant_id === userId || a.approver_id === userId);
  res.json({ ok: true, approvals: rows });
});

r.post('/approvals/:id/decide', (req, res) => {
  const { action, note } = req.body || {};
  const ap = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id);
  if (!ap) return res.status(404).json({ ok: false, msg: '审批不存在' });
  const history = JSON.parse(ap.history || '[]');
  history.push({ who: req.headers['x-user-id'], at: now(), action, note });
  const nextStatus = action === '通过' ? '已通过' : '已驳回';
  db.prepare(`UPDATE approvals SET status=?, history=? WHERE id=?`).run(nextStatus, JSON.stringify(history), ap.id);
  const applicant = db.prepare('SELECT enterprise_id FROM members WHERE id = ?').get(ap.applicant_id);
  notify(applicant?.enterprise_id || 'ent-demo', ap.applicant_id, '审批', '审批结果', `您的审批「${ap.title}」已${action === '通过' ? '通过' : '驳回'}`, '/approvals');
  // 若为实例购买审批，通过后自动支付并交付
  if (ap.type === '实例购买' && nextStatus === '已通过' && ap.related) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(ap.related);
    if (order && order.status === '待支付') {
      const ent = db.prepare('SELECT * FROM enterprises WHERE id = ?').get(order.enterprise_id);
      if (ent.balance >= order.amount) {
        db.prepare('UPDATE enterprises SET balance = balance - ? WHERE id = ?').run(order.amount, order.enterprise_id);
        db.prepare(`UPDATE orders SET status='已支付', paid_at=? WHERE id=?`).run(now(), order.id);
        const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(order.resource_id);
        const expires = order.duration_hours ? new Date(Date.now() + order.duration_hours * 3600000).toISOString().slice(0, 19).replace('T', ' ') : null;
        for (let i = 0; i < order.quantity; i++) {
          db.prepare(`INSERT INTO instances (id,name,order_id,enterprise_id,project_id,member_id,resource_id,provider_id,spec,gpu_model,image,region,status,billing_type,price_hour,ssh_host,ssh_port,ssh_user,created_at,expires_at,current_cost)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(genId('ins'), `${resource.spec.split('-')[0].toLowerCase()}-${genId('i').slice(-4)}`, order.id, order.enterprise_id, order.project_id, order.member_id,
              resource.id, resource.provider_id, resource.spec, resource.gpu_model, 'PyTorch 2.4 训练镜像', resource.region, '创建中', order.billing_type,
              resource.price_hour, '10.88.1.99', '1022', 'ubuntu', now(), expires, 0);
        }
        db.prepare('UPDATE resources SET stock = stock - ? WHERE id = ?').run(order.quantity, resource.id);
        setTimeout(() => {
          const rows = db.prepare('SELECT * FROM instances WHERE order_id = ?').all(order.id);
          rows.forEach(ins => {
            db.prepare(`UPDATE instances SET status='运行中' WHERE id=?`).run(ins.id);
            notify(order.enterprise_id, order.member_id, '实例', '实例交付成功', `${ins.name} 已可登录，开始计费`, `/instances/${ins.id}`);
          });
          db.prepare(`UPDATE orders SET status='已完成' WHERE id=?`).run(order.id);
        }, 2000);
      }
    }
  }
  res.json({ ok: true, msg: '已处理' });
});

// ============ 审计日志 ============
r.get('/audit', (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_logs WHERE enterprise_id = ? ORDER BY id DESC LIMIT 200').all(req.query.enterpriseId);
  res.json({ ok: true, logs: rows });
});

// ============ 预算提醒 ============
r.get('/budget-status', (req, res) => {
  const rows = db.prepare('SELECT * FROM projects WHERE enterprise_id = ?').all(req.query.enterpriseId);
  const list = rows.map(p => ({
    ...p,
    percent: p.budget > 0 ? Math.min(100, Math.round(p.used / p.budget * 100)) : 0,
    level: p.budget > 0 && p.used / p.budget >= 0.8 ? (p.used / p.budget >= 1 ? '超支' : '预警') : '正常',
  }));
  res.json({ ok: true, projects: list });
});

export default r;
