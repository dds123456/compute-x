// ComputeX 算力租赁平台 - API 服务入口
import express from 'express';
import cors from 'cors';
import './db.js';

import auth from './routes/auth.js';
import market from './routes/market.js';
import orders from './routes/orders.js';
import billing from './routes/billing.js';
import org from './routes/org.js';
import tickets from './routes/tickets.js';
import notifications from './routes/notifications.js';
import provider from './routes/provider.js';
import admin from './routes/admin.js';
import dashboard from './routes/dashboard.js';

const app = express();
app.use(cors());
app.use(express.json());

// 简单请求日志
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

app.use('/api/auth', auth);
app.use('/api/market', market);
app.use('/api/orders', orders);
app.use('/api/billing', billing);
app.use('/api/org', org);
app.use('/api/tickets', tickets);
app.use('/api/notify', notifications);
app.use('/api/provider', provider);
app.use('/api/admin', admin);
app.use('/api/dashboard', dashboard);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'ComputeX API', time: new Date().toISOString() }));

// 错误兜底
app.use((err, _req, res, _next) => {
  console.error('API Error:', err);
  res.status(500).json({ ok: false, msg: err.message || '服务器内部错误' });
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`\n══════════════════════════════════════`);
  console.log(`  ComputeX 算力租赁平台 API 已启动`);
  console.log(`  地址: http://localhost:${PORT}/api/health`);
  console.log(`══════════════════════════════════════\n`);
});
