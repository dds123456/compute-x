import { Router } from 'express';
import db from '../db.js';
import { genId, now } from '../utils.js';

const r = Router();

function serializeRequest(request) {
  const steps = db.prepare(`SELECT id,step_no,approver_id,status,comment,decided_at
    FROM approval_request_steps WHERE request_id = ? ORDER BY step_no`).all(request.id)
    .map(step => ({ id: step.id, stepNo: step.step_no, approverId: step.approver_id, status: step.status, comment: step.comment, decidedAt: step.decided_at }));
  const draft = db.prepare('SELECT status FROM order_drafts WHERE id = ?').get(request.draft_id);
  return {
    id: request.id, enterpriseId: request.enterprise_id, draftId: request.draft_id, policyId: request.policy_id,
    applicantId: request.applicant_id, amount: request.amount, status: request.status,
    currentStep: request.current_step, submittedAt: request.submitted_at, decidedAt: request.decided_at,
    draftStatus: draft?.status, steps,
  };
}

r.get('/policies', (req, res) => {
  const rows = db.prepare(`SELECT p.*, pr.name project_name FROM approval_policies p
    JOIN projects pr ON pr.id = p.project_id WHERE p.enterprise_id = ? ORDER BY p.project_id, p.version DESC`).all(req.auth.enterpriseId)
    .map(policy => ({ ...policy, steps: JSON.parse(policy.steps_json), steps_json: undefined }));
  res.json({ ok: true, policies: rows });
});

r.get('/requests', (req, res) => {
  const params = [req.auth.enterpriseId];
  let sql = 'SELECT * FROM approval_requests_v3 WHERE enterprise_id = ?';
  if (req.query.status) { sql += ' AND status = ?'; params.push(req.query.status); }
  sql += ' ORDER BY submitted_at DESC';
  res.json({ ok: true, requests: db.prepare(sql).all(...params).map(serializeRequest) });
});

r.post('/drafts/:draftId/submit', (req, res, next) => {
  try {
    const draft = db.prepare(`SELECT * FROM order_drafts WHERE id = ? AND enterprise_id = ?`).get(req.params.draftId, req.auth.enterpriseId);
    if (!draft) return res.status(404).json({ ok: false, msg: '订单草稿不存在或无权访问' });
    if (draft.status !== '草稿') return res.status(409).json({ ok: false, msg: `当前草稿状态为${draft.status}，不可重复提交` });
    const policy = db.prepare(`SELECT * FROM approval_policies WHERE enterprise_id = ? AND project_id = ? AND status = '启用'
      AND min_amount <= ? ORDER BY min_amount DESC, version DESC LIMIT 1`).get(req.auth.enterpriseId, draft.project_id, draft.amount);
    const createdAt = now();
    if (!policy) {
      db.prepare(`UPDATE order_drafts SET status='待确认',updated_at=? WHERE id=?`).run(createdAt, draft.id);
      return res.status(201).json({ ok: true, approvalRequired: false, request: null, draftStatus: '待确认' });
    }
    const configuredSteps = JSON.parse(policy.steps_json || '[]');
    if (!configuredSteps.length) return res.status(422).json({ ok: false, msg: '审批策略未配置审批人' });
    const requestId = genId('apr');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`INSERT INTO approval_requests_v3
        (id,enterprise_id,draft_id,policy_id,applicant_id,amount,status,current_step,submitted_at,updated_at)
        VALUES (?,?,?,?,?,?,'待审批',1,?,?)`).run(requestId, req.auth.enterpriseId, draft.id, policy.id, req.auth.userId, draft.amount, createdAt, createdAt);
      const insertStep = db.prepare(`INSERT INTO approval_request_steps (id,request_id,step_no,approver_id,status) VALUES (?,?,?,?,?)`);
      configuredSteps.forEach((step, index) => insertStep.run(genId('aps'), requestId, index + 1, step.approverId, index === 0 ? '待审批' : '等待中'));
      db.prepare(`UPDATE order_drafts SET status='审批中',updated_at=? WHERE id=?`).run(createdAt, draft.id);
      db.prepare(`INSERT INTO audit_logs (enterprise_id,user_id,user_name,action,target,created_at) VALUES (?,?,?,?,?,?)`)
        .run(req.auth.enterpriseId, req.auth.userId, '成员', '提交采购审批', `${requestId} · ${draft.amount} 元`, createdAt);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    const request = db.prepare('SELECT * FROM approval_requests_v3 WHERE id = ?').get(requestId);
    res.status(201).json({ ok: true, approvalRequired: true, request: serializeRequest(request) });
  } catch (error) { next(error); }
});

r.post('/requests/:id/decision', (req, res, next) => {
  const { action, comment = '' } = req.body || {};
  if (!['通过', '驳回'].includes(action)) return res.status(400).json({ ok: false, msg: '审批动作必须是通过或驳回' });
  try {
    const request = db.prepare(`SELECT * FROM approval_requests_v3 WHERE id = ? AND enterprise_id = ?`).get(req.params.id, req.auth.enterpriseId);
    if (!request) return res.status(404).json({ ok: false, msg: '审批请求不存在或无权访问' });
    if (request.status !== '待审批') return res.status(409).json({ ok: false, msg: `审批已${request.status}` });
    const step = db.prepare(`SELECT * FROM approval_request_steps WHERE request_id = ? AND step_no = ? AND status = '待审批'`).get(request.id, request.current_step);
    if (!step) return res.status(409).json({ ok: false, msg: '当前审批步骤不存在' });
    if (step.approver_id !== req.auth.userId && req.auth.role !== '平台管理员') return res.status(403).json({ ok: false, msg: '当前用户不是本步骤审批人' });
    const decidedAt = now();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`UPDATE approval_request_steps SET status=?,comment=?,decided_at=? WHERE id=?`).run(action === '通过' ? '已通过' : '已驳回', String(comment).slice(0, 500), decidedAt, step.id);
      if (action === '驳回') {
        db.prepare(`UPDATE approval_requests_v3 SET status='已驳回',decided_at=?,updated_at=? WHERE id=?`).run(decidedAt, decidedAt, request.id);
        db.prepare(`UPDATE order_drafts SET status='已驳回',updated_at=? WHERE id=?`).run(decidedAt, request.draft_id);
      } else {
        const nextStep = db.prepare(`SELECT * FROM approval_request_steps WHERE request_id=? AND step_no=?`).get(request.id, request.current_step + 1);
        if (nextStep) {
          db.prepare(`UPDATE approval_request_steps SET status='待审批' WHERE id=?`).run(nextStep.id);
          db.prepare(`UPDATE approval_requests_v3 SET current_step=current_step+1,updated_at=? WHERE id=?`).run(decidedAt, request.id);
        } else {
          db.prepare(`UPDATE approval_requests_v3 SET status='已通过',decided_at=?,updated_at=? WHERE id=?`).run(decidedAt, decidedAt, request.id);
          db.prepare(`UPDATE order_drafts SET status='待确认',updated_at=? WHERE id=?`).run(decidedAt, request.draft_id);
        }
      }
      db.prepare(`INSERT INTO audit_logs (enterprise_id,user_id,user_name,action,target,created_at) VALUES (?,?,?,?,?,?)`)
        .run(req.auth.enterpriseId, req.auth.userId, '审批人', `${action}采购审批`, `${request.id}${comment ? ` · ${String(comment).slice(0, 80)}` : ''}`, decidedAt);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.json({ ok: true, request: serializeRequest(db.prepare('SELECT * FROM approval_requests_v3 WHERE id=?').get(request.id)) });
  } catch (error) { next(error); }
});

export default r;

