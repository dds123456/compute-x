// ComputeX 算力租赁平台 - API 服务入口
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
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
import { authenticateApi } from './security.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(v => v.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)) }));
app.use(express.json({ limit: '1mb' }));
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// 简单请求日志
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

app.use('/api', authenticateApi);

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

// 生产环境由同一进程托管前端静态产物，避免跨域与双服务部署漂移。
const webDist = path.resolve(__dirname, '../../web/dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(webDist)) {
  app.use(express.static(webDist, { maxAge: '1y', immutable: true, index: false }));
  app.get('*', (req, res, next) => req.path.startsWith('/api') ? next() : res.sendFile(path.join(webDist, 'index.html')));
}

// 错误兜底
app.use((err, _req, res, _next) => {
  console.error('API Error:', err);
  res.status(500).json({ ok: false, msg: err.message || '服务器内部错误' });
});

const PORT = process.env.PORT || 8787;
export function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`\n══════════════════════════════════════`);
    console.log(`  ComputeX 算力租赁平台 API 已启动`);
    console.log(`  地址: http://localhost:${port}/api/health`);
    console.log(`══════════════════════════════════════\n`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`))) {
  startServer();
}

export default app;
