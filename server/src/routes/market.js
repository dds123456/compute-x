import { Router } from 'express';
import db from '../db.js';
import { genId, genNo, notify } from '../utils.js';

const r = Router();

// 资源列表（筛选）
r.get('/resources', (req, res) => {
  const q = req.query;
  let sql = `SELECT r.*, p.name provider_name, p.rating provider_rating, p.location provider_location FROM resources r LEFT JOIN providers p ON r.provider_id = p.id WHERE 1=1`;
  const params = [];
  if (q.keyword) { sql += ` AND (r.spec LIKE ? OR r.gpu_model LIKE ?)`; params.push(`%${q.keyword}%`, `%${q.keyword}%`); }
  if (q.gpu_model) { sql += ` AND r.gpu_model = ?`; params.push(q.gpu_model); }
  if (q.region) { sql += ` AND r.region = ?`; params.push(q.region); }
  if (q.status && q.status !== '全部') { sql += ` AND r.status = ?`; params.push(q.status); }
  if (q.max_price) { sql += ` AND r.price_hour <= ?`; params.push(Number(q.max_price)); }
  if (q.min_price) { sql += ` AND r.price_hour >= ?`; params.push(Number(q.min_price)); }
  if (q.availability) { sql += ` AND r.availability >= ?`; params.push(Number(q.availability)); }
  const sortMap = { price: 'price_hour ASC', benchmark: 'benchmark DESC', created: 'created_at DESC' };
  sql += ` ORDER BY ${sortMap[q.sort] || 'benchmark DESC'}`;
  const rows = db.prepare(sql).all(...params);
  res.json({ ok: true, resources: rows });
});

// 资源详情
r.get('/resources/:id', (req, res) => {
  const row = db.prepare(`SELECT r.*, p.name provider_name, p.rating provider_rating, p.location provider_location, p.contacts FROM resources r LEFT JOIN providers p ON r.provider_id = p.id WHERE r.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, msg: '资源不存在' });
  // 历史基准测试记录（读表，无数据时降级为模拟）
  let benches = db.prepare('SELECT bench_date AS date, train_throughput, inference_latency, stability FROM resource_benchmarks WHERE resource_id = ? ORDER BY bench_date DESC').all(req.params.id);
  if (!benches.length) {
    benches = [
      { date: '2026-08-01', train_throughput: Math.round(row.benchmark * 1.8), inference_latency: (Math.random() * 8 + 5).toFixed(1), stability: '稳定' },
      { date: '2026-07-15', train_throughput: Math.round(row.benchmark * 1.75), inference_latency: (Math.random() * 8 + 5).toFixed(1), stability: '稳定' },
      { date: '2026-07-01', train_throughput: Math.round(row.benchmark * 1.7), inference_latency: (Math.random() * 8 + 6).toFixed(1), stability: '稳定' },
    ];
  }
  let reviews = db.prepare('SELECT user_name AS user, created_at AS time, content, stars FROM resource_reviews WHERE resource_id = ? ORDER BY created_at DESC').all(req.params.id);
  if (!reviews.length) {
    reviews = [
      { user: '李算法', time: '2026-08-10', content: '性能符合预期，训练吞吐与基准分一致。', stars: 5 },
      { user: '王项目', time: '2026-07-28', content: '交付快，网络稳定，售后响应及时。', stars: 4 },
      { user: '匿名用户', time: '2026-07-15', content: '高峰期偶有排队，整体可用。', stars: 4 },
    ];
  }
  res.json({ ok: true, resource: { ...row, benches, reviews } });
});

// 发表资源评价（登录成员）
r.post('/resources/:id/review', (req, res) => {
  const { content, stars = 5 } = req.body || {};
  const resource = db.prepare('SELECT id FROM resources WHERE id = ?').get(req.params.id);
  if (!resource) return res.status(404).json({ ok: false, msg: '资源不存在' });
  const member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(req.auth.userId);
  db.prepare(`INSERT INTO resource_reviews (id, resource_id, enterprise_id, member_id, user_name, content, stars, created_at) VALUES (?,?,?,?,?,?,?,datetime('now','localtime'))`)
    .run(genId('rv'), req.params.id, req.auth.enterpriseId, req.auth.userId, member?.name || '成员', content, Number(stars));
  const reviews = db.prepare('SELECT user_name AS user, created_at AS time, content, stars FROM resource_reviews WHERE resource_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ok: true, reviews });
});

// 资源对比
r.get('/compare', (req, res) => {
  const ids = (req.query.ids || '').split(',').filter(Boolean).slice(0, 3);
  const rows = ids.map(id => db.prepare(`SELECT r.*, p.name provider_name, p.rating FROM resources r LEFT JOIN providers p ON r.provider_id = p.id WHERE r.id = ?`).get(id)).filter(Boolean);
  res.json({ ok: true, resources: rows });
});

// 镜像列表
r.get('/images', (req, res) => {
  const rows = db.prepare('SELECT * FROM images').all();
  res.json({ ok: true, images: rows });
});

// GPU 型号 / 地域 筛选项
r.get('/filters', (req, res) => {
  const gpus = db.prepare('SELECT DISTINCT gpu_model FROM resources ORDER BY gpu_model').all().map(x => x.gpu_model);
  const regions = db.prepare('SELECT DISTINCT region FROM resources').all().map(x => x.region);
  res.json({ ok: true, gpus, regions });
});

// 成本估算器
r.post('/estimate', (req, res) => {
  const { taskType = '训练', gpuModel, cards = 1, hours = 24, dataSize = 100 } = req.body || {};
  let sql = `SELECT * FROM resources WHERE status = '可售'`;
  const params = [];
  if (gpuModel) { sql += ` AND gpu_model = ?`; params.push(gpuModel); }
  const rows = db.prepare(sql).all(...params);
  const list = rows.map(res => {
    const nodeCost = res.price_hour * hours * Math.ceil(cards / 8 || 1);
    const storageCost = dataSize * 0.1 * hours;
    const bwCost = dataSize * 0.5;
    return {
      ...res,
      nodeCount: Math.ceil(cards / 8 || 1),
      estimate: Math.round((nodeCost + storageCost + bwCost) * 100) / 100,
      storageCost: Math.round(storageCost * 100) / 100,
      bwCost,
    };
  }).sort((a, b) => a.estimate - b.estimate).slice(0, 6);
  const low = list.length ? Math.min(...list.map(x => x.estimate)) : 0;
  const high = list.length ? Math.max(...list.slice(0, 3).map(x => x.estimate)) : 0;
  res.json({ ok: true, range: [low, high], recommendations: list, taskType, hours, cards });
});

// 订阅降价提醒
r.post('/subscribe', (req, res) => {
  const { resourceId, type = '降价提醒' } = req.body || {};
  db.prepare(`INSERT OR REPLACE INTO subscriptions (id,enterprise_id,member_id,resource_id,type,created_at) VALUES (?,?,?,?,?,datetime('now','localtime'))`)
    .run(genId('sub'), req.auth.enterpriseId, req.auth.userId, resourceId, type);
  res.json({ ok: true });
});

export default r;
