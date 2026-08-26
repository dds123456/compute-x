import { Router } from 'express';
import { confirmOrderDraft, createOrderDraft, createRecommendation, validateIntent } from '../services/advisor.js';
import db from '../db.js';

const r = Router();
const recommendationBuckets = new Map();
const RECOMMEND_WINDOW_MS = 10 * 60 * 1000;
const RECOMMEND_MAX = Number(process.env.AI_ADVISOR_RATE_LIMIT_MAX || 20);

function limitRecommendations(req, res, next) {
  const key = req.auth.userId;
  const current = Date.now();
  const recent = (recommendationBuckets.get(key) || []).filter(time => current - time < RECOMMEND_WINDOW_MS);
  if (recent.length >= RECOMMEND_MAX) {
    const retryAfter = Math.max(1, Math.ceil((RECOMMEND_WINDOW_MS - (current - recent[0])) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ ok: false, msg: '推荐请求过于频繁，请稍后重试' });
  }
  recent.push(current);
  recommendationBuckets.set(key, recent);
  next();
}

r.get('/drafts', (req, res) => {
  const drafts = db.prepare(`SELECT d.*,p.name project_name,r.spec,r.gpu_model
    FROM order_drafts d JOIN projects p ON p.id=d.project_id JOIN resources r ON r.id=d.resource_id
    WHERE d.enterprise_id=? ORDER BY d.created_at DESC LIMIT 50`).all(req.auth.enterpriseId).map(row => ({
      id: row.id, recommendationId: row.recommendation_id, planId: row.plan_id, enterpriseId: row.enterprise_id,
      projectId: row.project_id, projectName: row.project_name, resourceId: row.resource_id, spec: row.spec,
      gpuModel: row.gpu_model, quantity: row.quantity, durationHours: row.duration_hours, amount: row.amount,
      status: row.status, orderId: row.order_id, quote: JSON.parse(row.quote_json), createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  res.json({ ok: true, drafts });
});

r.post('/recommend', limitRecommendations, async (req, res, next) => {
  const errors = validateIntent(req.body);
  if (errors.length) return res.status(400).json({ ok: false, msg: '推荐输入不完整', errors });
  try {
    const recommendation = await createRecommendation(req.body, req.auth);
    res.status(201).json({ ok: true, recommendation });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, msg: error.message });
    next(error);
  }
});

r.post('/recommendations/:id/draft', (req, res, next) => {
  const { planId, projectId } = req.body || {};
  if (!planId || !projectId) return res.status(400).json({ ok: false, msg: '请选择推荐方案和归属项目' });
  try {
    const draft = createOrderDraft(req.params.id, planId, projectId, req.auth);
    res.status(201).json({ ok: true, draft });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, msg: error.message });
    next(error);
  }
});

r.post('/drafts/:id/confirm', (req, res, next) => {
  try {
    const order = confirmOrderDraft(req.params.id, req.auth);
    res.status(201).json({ ok: true, order });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, msg: error.message });
    next(error);
  }
});

export default r;
