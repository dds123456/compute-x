// ComputeX 数据库层：schema + 种子数据
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'computex.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ============ Schema ============
db.exec(`
CREATE TABLE IF NOT EXISTS enterprises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cert_status TEXT DEFAULT '已认证',
  credit_limit REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  invoice_qualification INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  password TEXT DEFAULT '123456',
  role TEXT DEFAULT '工程师',
  status TEXT DEFAULT '正常',
  project_ids TEXT DEFAULT '[]',
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT,
  name TEXT NOT NULL,
  owner_id TEXT,
  budget REAL DEFAULT 0,
  used REAL DEFAULT 0,
  approval_rule TEXT DEFAULT '{"threshold":0,"approvers":[],"levels":1}',
  status TEXT DEFAULT '正常',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cert_status TEXT DEFAULT '已通过',
  location TEXT,
  rating REAL DEFAULT 4.5,
  deposit REAL DEFAULT 50000,
  fee_rate REAL DEFAULT 0.07,
  settlement_cycle TEXT DEFAULT 'T+7',
  contacts TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  provider_id TEXT,
  spec TEXT NOT NULL,
  gpu_model TEXT NOT NULL,
  vram TEXT,
  ram TEXT,
  cpu TEXT,
  bandwidth TEXT,
  storage TEXT,
  region TEXT,
  site TEXT,
  price_hour REAL NOT NULL,
  price_day REAL,
  price_month REAL,
  status TEXT DEFAULT '可售',
  stock INTEGER DEFAULT 10,
  benchmark REAL,
  health REAL DEFAULT 95,
  availability REAL DEFAULT 99.5,
  fault_rate REAL DEFAULT 0.1,
  extra_fee TEXT DEFAULT '带宽0.5元/GB；存储0.1元/GB/小时；镜像免费',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT,
  framework TEXT,
  type TEXT DEFAULT '官方',
  size TEXT,
  desc TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_no TEXT,
  enterprise_id TEXT,
  project_id TEXT,
  member_id TEXT,
  resource_id TEXT,
  spec TEXT,
  quantity INTEGER DEFAULT 1,
  duration_hours REAL,
  billing_type TEXT DEFAULT '按小时',
  amount REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  status TEXT DEFAULT '待支付',
  pay_method TEXT DEFAULT '余额',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  order_id TEXT,
  enterprise_id TEXT,
  project_id TEXT,
  member_id TEXT,
  resource_id TEXT,
  provider_id TEXT,
  spec TEXT,
  gpu_model TEXT,
  image TEXT,
  region TEXT,
  status TEXT DEFAULT '创建中',
  billing_type TEXT DEFAULT '按小时',
  price_hour REAL DEFAULT 0,
  ssh_host TEXT,
  ssh_port TEXT,
  ssh_user TEXT,
  auto_release INTEGER DEFAULT 0,
  checkpoint INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  expires_at TEXT,
  stopped_at TEXT,
  current_cost REAL DEFAULT 0,
  env_vars TEXT DEFAULT '[]',
  key_name TEXT
);
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  bill_no TEXT,
  enterprise_id TEXT,
  period TEXT,
  amount REAL DEFAULT 0,
  status TEXT DEFAULT '待支付',
  invoice_status TEXT DEFAULT '未开票',
  items TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_no TEXT,
  enterprise_id TEXT,
  bill_ids TEXT DEFAULT '[]',
  title TEXT,
  tax_no TEXT,
  email TEXT,
  type TEXT DEFAULT '电子普票',
  status TEXT DEFAULT '已受理',
  amount REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  ticket_no TEXT,
  enterprise_id TEXT,
  user_id TEXT,
  type TEXT,
  related TEXT,
  content TEXT,
  status TEXT DEFAULT '待处理',
  priority TEXT DEFAULT '普通',
  sla_at TEXT,
  handler TEXT,
  replies TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  settle_no TEXT,
  provider_id TEXT,
  period TEXT,
  gmv REAL DEFAULT 0,
  commission REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  status TEXT DEFAULT '待结算',
  cycle TEXT DEFAULT 'T+7',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  type TEXT,
  title TEXT,
  applicant_id TEXT,
  approver_id TEXT,
  project_id TEXT,
  related TEXT,
  detail TEXT DEFAULT '{}',
  status TEXT DEFAULT '待审批',
  history TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  instance_id TEXT,
  type TEXT,
  level TEXT DEFAULT '警告',
  metric TEXT,
  message TEXT,
  status TEXT DEFAULT '触发中',
  triggered_at TEXT DEFAULT (datetime('now','localtime')),
  recovered_at TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT,
  user_id TEXT,
  category TEXT DEFAULT '系统',
  title TEXT,
  content TEXT,
  is_read INTEGER DEFAULT 0,
  link TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enterprise_id TEXT,
  user_id TEXT,
  user_name TEXT,
  action TEXT,
  target TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  instance_id TEXT,
  name TEXT,
  size TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT,
  name TEXT,
  key TEXT,
  webhook TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT,
  member_id TEXT,
  resource_id TEXT,
  type TEXT DEFAULT '降价提醒',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);

const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;

// ============ 种子数据 ============
if (count('enterprises') === 0) seed();

function seed() {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // 企业
  db.prepare(`INSERT INTO enterprises VALUES (?,?,?,?,?,?,?)`).run('ent-demo', '星云智能科技有限公司', '已认证', 100000, 38560.5, 1, now);
  db.prepare(`INSERT INTO enterprises VALUES (?,?,?,?,?,?,?)`).run('ent-lab', '启明大学高性能计算实验室', '已认证', 50000, 22000, 0, now);

  // 成员
  const members = [
    ['u-admin', 'ent-demo', '陈远', '13800000001', 'admin@xingyun.ai', '企业管理员', '正常'],
    ['u-fin', 'ent-demo', '林财务', '13800000002', 'fin@xingyun.ai', '财务', '正常'],
    ['u-pm', 'ent-demo', '王项目', '13800000003', 'pm@xingyun.ai', '项目负责人', '正常'],
    ['u-eng', 'ent-demo', '李算法', '13800000004', 'eng@xingyun.ai', '工程师', '正常'],
    ['u-ro', 'ent-demo', '赵只读', '13800000005', 'ro@xingyun.ai', '只读成员', '正常'],
    ['u-lab', 'ent-lab', '周教授', '13900000001', 'zhou@qiming.edu.cn', '企业管理员', '正常'],
  ];
  const pm = db.prepare(`INSERT INTO members (id,enterprise_id,name,phone,email,password,role,status,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?,1,?)`);
  members.forEach(m => pm.run(m[0], m[1], m[2], m[3], m[4], '123456', m[5], m[6], now));

  // 项目
  const proj = db.prepare(`INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?)`);
  proj.run('p-llm', 'ent-demo', '大模型微调项目', 'u-pm', 50000, 31800, JSON.stringify({ threshold: 10000, approvers: ['u-pm'], levels: 1 }), '正常', now);
  proj.run('p-infer', 'ent-demo', '推理服务扩容', 'u-pm', 30000, 8600, JSON.stringify({ threshold: 8000, approvers: ['u-admin'], levels: 1 }), '正常', now);
  proj.run('p-render', 'ent-demo', '渲染工作室', 'u-admin', 20000, 6200, JSON.stringify({ threshold: 5000, approvers: ['u-admin', 'u-fin'], levels: 2 }), '正常', now);
  proj.run('p-paper', 'ent-lab', '论文复现实验', 'u-lab', 10000, 4500, JSON.stringify({ threshold: 3000, approvers: ['u-lab'], levels: 1 }), '正常', now);

  // 资源方
  const prov = db.prepare(`INSERT INTO providers VALUES (?,?,?,?,?,?,?,?,?,?)`);
  prov.run('prv-cloud', '华东智算中心', '已通过', '上海·临港', 4.9, 100000, 0.07, 'T+7', JSON.stringify({ contact: '许工', phone: '021-88880001' }), now);
  prov.run('prv-idc', '中科云谷 IDC', '已通过', '北京·亦庄', 4.7, 80000, 0.08, 'T+7', JSON.stringify({ contact: '吴工', phone: '010-66660002' }), now);
  prov.run('prv-hz', '杭城超算中心', '已通过', '杭州·余杭', 4.8, 60000, 0.07, 'T+7', JSON.stringify({ contact: '孙工', phone: '0571-55550003' }), now);
  prov.run('prv-sz', '鹏城智能算力', '已通过', '深圳·南山', 4.6, 50000, 0.09, 'T+7', JSON.stringify({ contact: '郑工', phone: '0755-44440004' }), now);
  prov.run('prv-audit', '西部云谷科技', '审核中', '成都·高新', 0, 0, 0.09, 'T+7', JSON.stringify({ contact: '何工', phone: '028-33330005' }), now);

  // 资源
  const res = db.prepare(`INSERT INTO resources VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  res.run('r-01', 'prv-cloud', 'A100-40G-8卡节点', 'NVIDIA A100 40G', '40GB×8', '512GB', '64核', '25Gbps', '4TB NVMe', '上海', '临港机房 A区', 28, 620, 7800, '可售', 6, 92, 98, 99.7, 0.05, '带宽0.5元/GB；存储0.1元/GB/小时；镜像免费', now);
  res.run('r-02', 'prv-cloud', 'A100-80G-8卡节点', 'NVIDIA A100 80G', '80GB×8', '1TB', '96核', '25Gbps', '8TB NVMe', '上海', '临港机房 A区', 36, 800, 9800, '可售', 4, 94, 99, 99.8, 0.04, '带宽0.5元/GB；存储0.1元/GB/小时；镜像免费', now);
  res.run('r-03', 'prv-idc', 'H100-80G-8卡节点', 'NVIDIA H100 80G', '80GB×8', '1TB', '96核', '50Gbps', '8TB NVMe', '北京', '亦庄机房 B栋', 68, 1500, 19800, '可售', 3, 96, 99, 99.9, 0.03, '带宽0.6元/GB；存储0.1元/GB/小时；镜像免费', now);
  res.run('r-04', 'prv-hz', 'RTX 4090-24G-8卡节点', 'NVIDIA RTX 4090', '24GB×8', '256GB', '32核', '10Gbps', '2TB NVMe', '杭州', '余杭机房 C区', 6, 130, 1650, '可售', 20, 88, 96, 99.2, 0.2, '带宽0.4元/GB；存储0.08元/GB/小时；镜像免费', now);
  res.run('r-05', 'prv-sz', 'L40S-48G-8卡节点', 'NVIDIA L40S 48G', '48GB×8', '512GB', '64核', '25Gbps', '4TB NVMe', '深圳', '南山机房 D区', 22, 480, 6200, '可售', 8, 90, 97, 99.5, 0.1, '带宽0.5元/GB；存储0.1元/GB/小时；镜像免费', now);
  res.run('r-06', 'prv-cloud', 'A10-24G-4卡节点', 'NVIDIA A10 24G', '24GB×4', '128GB', '16核', '10Gbps', '1TB NVMe', '上海', '临港机房 B区', 8, 170, 2200, '可售', 15, 85, 95, 99.0, 0.3, '带宽0.4元/GB；存储0.08元/GB/小时；镜像免费', now);
  res.run('r-07', 'prv-idc', 'V100-16G-8卡节点', 'NVIDIA V100 16G', '16GB×8', '256GB', '32核', '10Gbps', '2TB SSD', '北京', '亦庄机房 A栋', 12, 260, 3200, '维护中', 0, 82, 93, 98.5, 0.4, '带宽0.4元/GB；存储0.08元/GB/小时；镜像免费', now);
  res.run('r-08', 'prv-hz', '国产昇腾910B-8卡节点', '昇腾 910B', '64GB×8', '512GB', '64核', '25Gbps', '4TB NVMe', '杭州', '余杭机房 A区', 20, 440, 5600, '可售', 10, 86, 94, 99.3, 0.15, '带宽0.5元/GB；存储0.1元/GB/小时；镜像免费', now);
  res.run('r-09', 'prv-sz', 'RTX 3090-24G-4卡节点', 'NVIDIA RTX 3090', '24GB×4', '128GB', '16核', '10Gbps', '1TB NVMe', '深圳', '南山机房 E区', 4, 88, 1080, '可售', 12, 84, 94, 98.8, 0.35, '带宽0.4元/GB；存储0.08元/GB/小时；镜像免费', now);

  // 镜像
  const img = db.prepare(`INSERT INTO images VALUES (?,?,?,?,?,?,?)`);
  img.run('img-1', 'PyTorch 2.4 训练镜像', 'py311-cu124', 'PyTorch', '官方', '18GB', 'CUDA 12.4 + Python 3.11 + PyTorch 2.4');
  img.run('img-2', 'TensorFlow 2.16', 'tf216-py311', 'TensorFlow', '官方', '16GB', 'CUDA 12.3 + TensorFlow 2.16');
  img.run('img-3', 'DeepSpeed 微调镜像', 'ds-py311-cu124', 'DeepSpeed', '官方', '22GB', '含 DeepSpeed/FlashAttention/LoRA');
  img.run('img-4', 'CUDA 12.4 基础环境', 'cuda124-ubuntu', 'CUDA', '官方', '12GB', 'Ubuntu 22.04 + CUDA 12.4 + 驱动');
  img.run('img-5', 'Blender 渲染环境', 'blender-4.2', '渲染', '官方', '8GB', 'Blender 4.2 + Cycles + OptiX');
  img.run('img-6', 'vLLM 推理镜像', 'vllm-040', '推理', '社区', '20GB', 'vLLM 0.4 + FastAPI 推理服务');
  img.run('img-7', '用户私有-实验环境', 'lab-custom-v3', '自定义', '私有', '25GB', '团队自建实验镜像');

  // 历史实例
  const inst = db.prepare(`INSERT INTO instances (id,name,order_id,enterprise_id,project_id,member_id,resource_id,provider_id,spec,gpu_model,image,region,status,billing_type,price_hour,ssh_host,ssh_port,ssh_user,checkpoint,created_at,expires_at,current_cost,env_vars,key_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const instRows = [
    ['ins-001', 'llm-train-a100-01', 'ord-2026080001', 'ent-demo', 'p-llm', 'u-eng', 'r-02', 'prv-cloud', 'A100-80G-8卡节点', 'NVIDIA A100 80G', 'PyTorch 2.4 训练镜像', '上海', '运行中', '按小时', 36, '10.20.1.101', '1022', 'ubuntu', 1, '2026-08-15 09:12:00', '2026-08-20 09:12:00', 6120, '["WANDB_API_KEY=sk-xxx","DATA_DIR=/data/llm"]', 'kp-llm'],    ['ins-002', 'llm-train-a100-02', 'ord-2026080002', 'ent-demo', 'p-llm', 'u-eng', 'r-02', 'prv-cloud', 'A100-80G-8卡节点', 'NVIDIA A100 80G', 'PyTorch 2.4 训练镜像', '上海', '运行中', '按小时', 36, '10.20.1.102', '1022', 'ubuntu', 1, '2026-08-15 09:12:00', '2026-08-20 09:12:00', 6120, '[]', 'kp-llm'],    ['ins-003', 'infer-vllm-h100-01', 'ord-2026080003', 'ent-demo', 'p-infer', 'u-pm', 'r-03', 'prv-idc', 'H100-80G-8卡节点', 'NVIDIA H100 80G', 'vLLM 推理镜像', '北京', '运行中', '包日', 1500, '10.30.1.201', '1022', 'ubuntu', 0, '2026-08-16 18:00:00', '2026-08-19 18:00:00', 4500, '["MODEL=Qwen2-72B"]', 'kp-infer'],    ['ins-004', 'render-4090-batch', 'ord-2026080004', 'ent-demo', 'p-render', 'u-eng', 'r-04', 'prv-hz', 'RTX 4090-24G-8卡节点', 'NVIDIA RTX 4090', 'Blender 渲染环境', '杭州', '已停止', '按小时', 6, '10.40.1.301', '1022', 'ubuntu', 0, '2026-08-10 10:00:00', '2026-08-17 10:00:00', 480, '[]', 'kp-render'],    ['ins-005', 'paper-v100-repro', 'ord-2026080005', 'ent-lab', 'p-paper', 'u-lab', 'r-07', 'prv-idc', 'V100-16G-8卡节点', 'NVIDIA V100 16G', 'CUDA 12.4 基础环境', '北京', '运行中', '包月', 3200, '10.30.2.401', '1022', 'ubuntu', 1, '2026-08-01 00:00:00', '2026-09-01 00:00:00', 3200, '[]', 'kp-lab'],    ['ins-006', 'llm-train-4090-01', 'ord-2026080006', 'ent-demo', 'p-llm', 'u-eng', 'r-04', 'prv-hz', 'RTX 4090-24G-8卡节点', 'NVIDIA RTX 4090', 'DeepSpeed 微调镜像', '杭州', '待续费', '按小时', 6, '10.40.1.302', '1022', 'ubuntu', 0, '2026-08-12 08:00:00', '2026-08-17 21:00:00', 760, '[]', 'kp-render'],    ['ins-007', 'test-l40s-sandbox', 'ord-2026080007', 'ent-demo', 'p-infer', 'u-eng', 'r-05', 'prv-sz', 'L40S-48G-8卡节点', 'NVIDIA L40S 48G', 'TensorFlow 2.16', '深圳', '异常', '按小时', 22, '10.50.1.501', '1022', 'ubuntu', 0, '2026-08-16 14:00:00', '2026-08-17 14:00:00', 88, '[]', 'kp-test'],    ['ins-008', 'archieved-a10-01', 'ord-2026080008', 'ent-demo', 'p-render', 'u-eng', 'r-06', 'prv-cloud', 'A10-24G-4卡节点', 'NVIDIA A10 24G', 'Blender 渲染环境', '上海', '已释放', '按小时', 8, '', '', '', 0, '2026-08-05 09:00:00', '2026-08-08 09:00:00', 576, '[]', 'kp-render'],  ];
  instRows.forEach(r => inst.run(...r));

  // 订单
  const ord = db.prepare(`INSERT INTO orders (id,order_no,enterprise_id,project_id,member_id,resource_id,spec,quantity,duration_hours,billing_type,amount,discount,status,pay_method,created_at,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  ord.run('ord-001', 'ORD202608170001', 'ent-demo', 'p-llm', 'u-eng', 'r-02', 'A100-80G-8卡节点', 2, 120, '按小时', 8640, 0, '已完成', '余额', '2026-08-15 09:10:00', '2026-08-15 09:11:00');
  ord.run('ord-002', 'ORD202608170002', 'ent-demo', 'p-infer', 'u-pm', 'r-03', 'H100-80G-8卡节点', 1, 72, '包日', 4500, 0, '已完成', '余额', '2026-08-16 17:58:00', '2026-08-16 18:00:00');
  ord.run('ord-003', 'ORD202608170003', 'ent-demo', 'p-render', 'u-eng', 'r-04', 'RTX 4090-24G-8卡节点', 1, 24, '按小时', 144, 0, '已完成', '余额', '2026-08-10 09:55:00', '2026-08-10 10:00:00');
  ord.run('ord-004', 'ORD202608170004', 'ent-demo', 'p-infer', 'u-eng', 'r-05', 'L40S-48G-8卡节点', 1, 24, '按小时', 528, 0, '已完成', '余额', '2026-08-16 13:50:00', '2026-08-16 14:00:00');
  ord.run('ord-005', 'ORD202608170005', 'ent-demo', 'p-llm', 'u-eng', 'r-04', 'RTX 4090-24G-8卡节点', 1, 168, '按小时', 1008, 50, '已完成', '余额', '2026-08-12 07:55:00', '2026-08-12 08:00:00');

  // 账单
  const bill = db.prepare(`INSERT INTO bills (id,bill_no,enterprise_id,period,amount,status,invoice_status,items,created_at,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  bill.run('bill-01', 'BIL20260701001', 'ent-demo', '2026-07', 26840.00, '已支付', '已开票', JSON.stringify([
    { name: 'llm-train-a100-01', spec: 'A100-80G-8卡节点', hours: 170, rate: 36, amount: 6120 },
    { name: 'llm-train-a100-02', spec: 'A100-80G-8卡节点', hours: 170, rate: 36, amount: 6120 },
    { name: 'infer-vllm-h100-01', spec: 'H100-80G-8卡节点', days: 5, rate: 1500, amount: 7500 },
    { name: 'render-4090-batch', spec: 'RTX 4090-24G-8卡节点', hours: 120, rate: 6, amount: 720 },
    { name: 'archieved-a10-01', spec: 'A10-24G-4卡节点', hours: 720, rate: 8, amount: 5760 },
    { name: '其他存储与带宽', spec: '附加费用', amount: 620 },
  ].map((x, i) => ({ id: i + 1, ...x }))), '2026-08-01 00:00:00', '2026-08-02 10:00:00');
  bill.run('bill-02', 'BIL20260801001', 'ent-demo', '2026-08', 47692.00, '待支付', '已受理', JSON.stringify([
    { name: 'llm-train-a100-01', spec: 'A100-80G-8卡节点', hours: 170, rate: 36, amount: 6120 },
    { name: 'llm-train-a100-02', spec: 'A100-80G-8卡节点', hours: 170, rate: 36, amount: 6120 },
    { name: 'infer-vllm-h100-01', spec: 'H100-80G-8卡节点', days: 3, rate: 1500, amount: 4500 },
    { name: 'render-4090-batch', spec: 'RTX 4090-24G-8卡节点', hours: 80, rate: 6, amount: 480 },
    { name: 'llm-train-4090-01', spec: 'RTX 4090-24G-8卡节点', hours: 127, rate: 6, amount: 762 },
    { name: 'test-l40s-sandbox', spec: 'L40S-48G-8卡节点', hours: 4, rate: 22, amount: 88 },
    { name: 'paper-v100-repro', spec: 'V100-16G-8卡节点', days: 16, rate: 3200 / 30, amount: 1706.67 },
    { name: '其他存储与带宽', spec: '附加费用', amount: 215.33 },
  ].map((x, i) => ({ id: i + 1, ...x }))), '2026-08-17 00:00:00', null);
  bill.run('bill-03', 'BIL20260801002', 'ent-lab', '2026-08', 4800.00, '已支付', '未开票', JSON.stringify([
    { name: 'paper-v100-repro', spec: 'V100-16G-8卡节点', days: 30, rate: 160, amount: 4800 },
  ]), '2026-08-17 00:00:00', '2026-08-17 12:00:00');

  // 发票
  db.prepare(`INSERT INTO invoices VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run('inv-01', 'INV2026080001', 'ent-demo', '["bill-01"]', '星云智能科技有限公司', '91110000MA01XXXXXX', 'fin@xingyun.ai', '电子普票', '已开具', 26840.00, now);

  // 工单
  const tk = db.prepare(`INSERT INTO tickets (id,ticket_no,enterprise_id,user_id,type,related,content,status,priority,sla_at,handler,replies,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  tk.run('tk-01', 'TK20260817001', 'ent-demo', 'u-eng', '故障', 'ins-007', '实例 test-l40s-sandbox SSH 连接中断，无法登录，请协助排查。', '处理中', '紧急', '2026-08-17 14:35:00', '平台运维-老周', JSON.stringify([{ who: '平台运维-老周', at: '2026-08-17 14:40:00', msg: '已定位到宿主机网络抖动，正在重启网络服务，预计 10 分钟内恢复。' }]), '2026-08-17 14:25:00');
  tk.run('tk-02', 'TK20260817002', 'ent-demo', 'u-pm', '计费争议', 'bill-02', '8 月账单中 llm-train-a100-01 的计费时长与我的使用记录不一致，请求复核。', '待处理', '普通', '2026-08-17 22:00:00', '', JSON.stringify([]), '2026-08-17 19:00:00');
  tk.run('tk-03', 'TK20260810003', 'ent-demo', 'u-eng', '发票', 'inv-01', '申请把 7 月发票抬头改为增值税专票，可以吗？', '已解决', '普通', '2026-08-11 12:00:00', '平台财务-小赵', JSON.stringify([{ who: '平台财务-小赵', at: '2026-08-11 10:00:00', msg: '已为您重新开具增值税专用发票，专票开具需企业具备开票资质，本次已通过校验。' }, { who: 'u-eng', at: '2026-08-11 11:30:00', msg: '收到，谢谢！' }]), '2026-08-10 09:00:00');

  // 结算单
  const st = db.prepare(`INSERT INTO settlements VALUES (?,?,?,?,?,?,?,?,?,?)`);
  st.run('st-01', 'STL202607001', 'prv-cloud', '2026-07', 180000, 12600, 167400, '已提现', 'T+7', now);
  st.run('st-02', 'STL202608001', 'prv-cloud', '2026-08', 96000, 6720, 89280, '已结算', 'T+7', now);
  st.run('st-03', 'STL202608002', 'prv-idc', '2026-08', 54000, 4320, 49680, '待结算', 'T+7', now);
  st.run('st-04', 'STL202608003', 'prv-hz', '2026-08', 22000, 1540, 20460, '待结算', 'T+7', now);

  // 审批
  const ap = db.prepare(`INSERT INTO approvals (id,type,title,applicant_id,approver_id,project_id,related,detail,status,history,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  ap.run('ap-01', '实例购买', '申请租用 H100-80G-8卡节点（3天推理扩容）', 'u-pm', 'u-admin', 'p-infer', 'ord-002', JSON.stringify({ spec: 'H100-80G-8卡节点', amount: 4500, duration: '3天' }), '已通过', JSON.stringify([{ who: 'u-admin', at: '2026-08-16 17:20:00', action: '通过', note: '预算内，同意' }]), '2026-08-16 17:10:00');
  ap.run('ap-02', '实例购买', '申请租用 A100-80G-8卡节点×2（大模型微调）', 'u-eng', 'u-pm', 'p-llm', 'ord-001', JSON.stringify({ spec: 'A100-80G-8卡节点', amount: 8640, duration: '5天' }), '已通过', JSON.stringify([{ who: 'u-pm', at: '2026-08-15 09:05:00', action: '通过', note: 'OK' }]), '2026-08-15 09:00:00');
  ap.run('ap-03', '预算申请', 'p-render 项目追加预算 5000 元', 'u-pm', 'u-admin', 'p-render', 'p-render', JSON.stringify({ amount: 5000, reason: '渲染单量增加' }), '已通过', JSON.stringify([{ who: 'u-admin', at: '2026-08-13 15:00:00', action: '通过' }]), '2026-08-13 14:30:00');
  ap.run('ap-04', '实例购买', '申请租用 A100-40G-8卡节点（1周，实验复现）', 'u-lab', 'u-lab', 'p-paper', '', JSON.stringify({ spec: 'A100-40G-8卡节点', amount: 4704, duration: '7天' }), '待审批', JSON.stringify([]), '2026-08-17 20:30:00');

  // 告警
  const al = db.prepare(`INSERT INTO alerts (id,instance_id,type,level,metric,message,status,triggered_at,recovered_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  al.run('al-01', 'ins-007', '掉线', '严重', '网络连通性', '实例 SSH 连接中断超过 5 分钟', '触发中', '2026-08-17 14:20:00', null);
  al.run('al-02', 'ins-001', '过载', '警告', 'GPU 利用率', 'GPU 利用率持续 98% 以上 2 小时', '触发中', '2026-08-17 13:00:00', null);
  al.run('al-03', 'ins-006', '到期提醒', '提示', '到期时间', '实例将于 2026-08-17 21:00 到期，请及时续费', '触发中', '2026-08-17 18:00:00', null);
  al.run('al-04', 'ins-003', '性能下降', '警告', '推理延迟', 'p99 推理延迟较基线上升 45%', '已恢复', '2026-08-16 20:00:00', '2026-08-16 21:30:00');
  al.run('al-05', 'ins-004', '费用异常', '提示', '日费用', '单日费用较前 7 日均值上升 120%', '已恢复', '2026-08-11 09:00:00', '2026-08-11 10:00:00');

  // 通知
  const nt = db.prepare(`INSERT INTO notifications (id,enterprise_id,user_id,category,title,content,is_read,link,created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  nt.run('n-01', 'ent-demo', 'u-admin', '审批', '待办审批', 'u-lab 提交了实例购买申请（A100-40G-8卡节点，4704元）', 0, '/approvals', '2026-08-17 20:30:00');
  nt.run('n-02', 'ent-demo', 'u-admin', '告警', '实例告警', 'test-l40s-sandbox 掉线，SSH 无法连接', 0, '/instances/ins-007', '2026-08-17 14:20:00');
  nt.run('n-03', 'ent-demo', 'u-eng', '账单', '账单出账', '2026-08 月账单已生成，金额 47,692.00 元', 1, '/bills/bill-02', '2026-08-17 00:05:00');
  nt.run('n-04', 'ent-demo', 'u-pm', '告警', '预算提醒', 'p-infer 项目预算已使用 28.7%', 0, '/projects', '2026-08-16 12:00:00');
  nt.run('n-05', 'ent-demo', 'u-eng', '系统', '系统公告', '8 月 20 日 02:00-04:00 平台维护升级通知', 1, '/notice', '2026-08-15 10:00:00');

  // 审计日志
  const audit = db.prepare(`INSERT INTO audit_logs (enterprise_id,user_id,user_name,action,target,created_at) VALUES (?,?,?,?,?,?)`);
  audit.run('ent-demo', 'u-eng', '李算法', '创建实例', 'llm-train-a100-01 (A100-80G-8卡节点)', '2026-08-15 09:12:00');
  audit.run('ent-demo', 'u-pm', '王项目', '审批通过', '订单 ORD202608170002 (H100推理扩容)', '2026-08-16 17:20:00');
  audit.run('ent-demo', 'u-eng', '李算法', '停止实例', 'render-4090-batch', '2026-08-14 10:00:00');
  audit.run('ent-demo', 'u-admin', '陈远', '修改项目预算', 'p-render 预算 15000 → 20000', '2026-08-13 15:05:00');
  audit.run('ent-demo', 'u-eng', '李算法', '释放实例', 'archieved-a10-01（数据已擦除）', '2026-08-08 09:00:00');
  audit.run('ent-demo', 'u-fin', '林财务', '申请开票', '7 月账单 26,840.00 元', '2026-08-02 11:00:00');

  // 快照
  db.prepare(`INSERT INTO snapshots VALUES (?,?,?,?,?)`).run('snap-01', 'ins-001', 'llm-train-0801', '120GB', '2026-08-16 00:00:00');
  db.prepare(`INSERT INTO snapshots VALUES (?,?,?,?,?)`).run('snap-02', 'ins-003', 'infer-before-upgrade', '80GB', '2026-08-16 12:00:00');

  // API 密钥
  db.prepare(`INSERT INTO api_keys VALUES (?,?,?,?,?,?)`).run('key-01', 'ent-demo', '生产环境密钥', 'ck_live_9f8e7d6c5b4a3f2e1d0c', 'https://hooks.example.com/computex', now);
}

export default db;
