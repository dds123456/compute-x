# ⚡ ComputeX 算力租赁平台

> 面向企业算力采购、FinOps 成本治理与多级审批的可部署产品基线。
> 覆盖 **需求方控制台 / 资源方后台 / 平台管理后台 / 移动端 App** 四端，从「算力选型」到「T+7 结算」全链路闭环。

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24.x-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/React-18.x-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Ant%20Design-5.x-0170FE?logo=antdesign&logoColor=white" alt="Ant Design">
  <img src="https://img.shields.io/badge/SQLite-built--in-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/tests-31%20passed-2ea44f" alt="Tests">
</p>

---

## 📑 目录

- [项目简介](#-项目简介)
- [核心能力](#-核心能力)
- [四端功能](#-四端功能)
- [技术栈](#-技术栈)
- [快速开始](#-快速开始)
- [演示账号](#-演示账号)
- [核心业务链路](#-核心业务链路)
- [安全与治理](#-安全与治理)
- [数据模型](#-数据模型)
- [测试](#-测试)
- [目录结构](#-目录结构)
- [部署与生产](#-部署与生产)
- [已知边界](#-已知边界)
- [版本记录](#-版本记录)

---

## 🧭 项目简介

ComputeX 是一款面向**企业 GPU 算力采购与治理**的演示/基线产品。它将算力选型、AI 决策、报价锁价、多级审批、订单支付、实例交付、用量计费、账单开票、售后工单、平台结算等环节全部线上化，并以**「实例 × 自然日」的用量事实**作为成本与治理的可复算依据。

**设计原则**

- **证据绑定**：推荐方案只能引用生成时真实存在的资源与报价快照，AI 仅增强解释、失败明确降级。
- **审批与履约分离**：审批通过不等于交付完成，需人工确认后才生成待支付订单。
- **租户隔离**：企业数据不得跨租户读取或写入，写操作逐端点校验归属。
- **可观测**：成本、利用率、碳排放均可按窗口、项目、GPU 型号、资源方维度复算。

---

## ✨ 核心能力

| 能力 | 说明 |
| --- | --- |
| 🤖 AI 算力决策 | 输入工作负载/模型/数据/时限/预算/地域/合规 → 输出 3 个可售库存方案；确定性引擎负责价格/库存/排序，AI 仅增强解释 |
| 🔒 不可篡改报价草稿 | 推荐转为服务端锁价草稿，客户端提交的金额不覆盖证据快照；库存或价格变化时拒绝确认 |
| 📊 FinOps 控制台 | 窗口成本、利用率、闲置成本、月度预测、可优化金额、**碳排放**、**成本环比**，按项目/GPU 型号/资源方分解 |
| 🛡️ 审批 2.0 | 版本化项目策略、多级审批步骤、租户隔离、完整审计 |
| 💳 订单/实例/计费 | 订单 → 实例完整状态机 → 按秒计量/按小时出账 → 账单 → 开票 → 售后 |
| 🎫 工单 SLA | 六类工单、SLA 首响时限、**升级动作**、**首响达标率统计** |
| 🏦 结算引擎 | 平台与资源方 T+7 结算、佣金入库、提现校验 |
| 🔐 安全治理 | 租户隔离、登录/写接口限流、四种会话、审计留痕 |

---

## 🖥️ 四端功能

### 需求方控制台（`/console`）

- **概览**：本月消费（用量事实）、实例状态、预算进度、30 天消费趋势、状态分布、项目利用率
- **资源市场**：GPU/地域/价格/状态多维筛选、基准分排序、资源详情（评测基准/用户评论）、3 资源对比、成本估算器、降价订阅
- **创建实例**：4 步向导（选资源 → 配置 → 项目与审批 → 确认支付）、实时费用估算、超预算拦截、超阈值自动触发审批
- **实例管理**：完整状态机、真实监控曲线（GPU/显存/CPU/内存）、SSH、日志、告警、快照（创建/恢复）、计费明细、续费（真实扣费）、变更配置（差价补扣）
- **账单与发票**：账期账单、真实明细（用量事实）、余额支付、充值（渠道抽象）、开票申请与进度、争议工单
- **组织与项目**：成员邀请/禁用/离职交接、项目预算、多级审批人配置、审计日志
- **审批中心**：多级审批（V3）、逐级处理、审计轨迹
- **工单中心**：六类工单、SLA、回复流转、升级
- **消息中心 / 设置**：分类通知、通知偏好、API 密钥（脱敏预览）

### 资源方后台（`/provider`）

- 收益概览（结算收益/利用率/趋势，真实计算）、库存监控
- 资源上架/下架、实时调价（留痕）、健康分
- 订单与结算（T+7、佣金 7%）、提现（状态校验）
- 工单协同（派单接单、SLA 计时）

### 平台管理后台（`/admin`）

- 平台概览（GMV 趋势/利用率真实计算）、资源方审核（留痕）
- 市场管理、企业/订单/账单/工单管理（只读）
- **月度结算引擎**（一键生成结算单 + 佣金）、系统公告（按成员企业推送）

### 移动端 App（`/app`）

- 底部 4 Tab：工作台（费用/实例/待办/告警）、实例（启停/续费/释放）、账单（支付/明细）、我的（成员/审批/帮助）
- 告警动态（真实告警表）、消息中心（分类+未读）、审批处理、新建工单
- 危险操作二次确认（输入实例名）

---

## 🛠️ 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Node.js 24、Express 4、内置 `node:sqlite`（零原生依赖）、HMAC 签名会话、scrypt 密码 |
| 前端 | React 18、Vite 8、Ant Design 5、自绘 SVG 图表（零图表库依赖） |
| 工程 | npm workspaces（monorepo）、`node --test` 测试、Docker 单容器、Vercel 函数 |

---

## 🚀 快速开始

### 方式一：Windows 一键启动

```bat
双击 启动ComputeX.cmd    :: 自动检查依赖 → 后台启动前后端 → 健康检查 → 打开浏览器
双击 停止ComputeX.cmd    :: 停止服务
```

本地访问 **http://localhost:5173**；生产环境访问 **https://compute-x-zeta.vercel.app/console**。

### 方式二：手动启动

```bash
# 1. 启动后端（端口 8787）
cd compute-x/server
node src/index.js

# 2. 启动前端（端口 5173）
cd compute-x/web
npm run dev
```

生产环境提供 30 分钟、无密码、只读、租户锁定的游客会话；游客不能支付、审批、访问密钥或修改数据。生产部署、外部依赖和上线门禁见 [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)。

### 方式三：Docker

```bash
docker build -t computex:latest .
docker run --env-file .env -p 8787:8787 -v computex-data:/data computex:latest
```

访问 `http://localhost:8787`，健康检查 `GET /api/health`。

---

## 👥 本地开发演示账号

以下账号仅供本地开发环境使用，生产环境不会开放账号枚举或后台一键登录。线上体验请使用 30 分钟、只读、租户锁定的游客入口。

| 端 | 账号 | 角色 | 说明 |
| --- | --- | --- | --- |
| 需求方 | 陈远 / 林财务 / 王项目 / 李算法 / 赵只读 | 企业管理员 / 财务 / 项目负责人 / 工程师 / 只读 | 初始密码均为 `123456` |
| 需求方 | 周教授 | 企业管理员（启明大学实验室） | 独立租户，验证隔离 |
| 资源方 | 华东智算中心（一键进入） | 资源方运营 | `/provider` |
| 平台 | 平台运营中心（一键进入） | 平台管理员 | `/admin` |
| 移动端 | 任意成员一键进入 | 轻量协同 | `/app` |
| 游客 | 游客体验入口 | 只读成员（锁定演示租户） | 30 分钟只读会话 |

---

## 🔁 核心业务链路

```
登录/进入角色 → 浏览资源（筛选/对比/估算/评测评价）
  → AI 推荐与证据核验 → 锁价草稿 → 多级审批（审批与履约分离）
  → 人工确认订单 → 支付（余额）→ 实例创建中 → 交付 → SSH 可登录
  → 运行计费（按秒计量/按小时出账）→ 监控/日志/告警/快照/续费/变更配置
  → 释放（数据擦除 NIST 800-88）→ 按用量事实出账 → 开票/充值支付 → 工单售后
  → 平台与资源方 T+7 结算（佣金 7%）
```

---

## 🔐 安全与治理

| 机制 | 实现 |
| --- | --- |
| **租户隔离** | 普通成员 query/body 的 `enterpriseId` 被强制覆写为本企业；按裸 ID 查对象统一追加 `AND enterprise_id = ?` 校验 |
| **限流** | 游客会话限流、登录限流（IP+账号双维度失败锁定）、订单/账单写接口限流；`createRateLimiter` 可插拔存储 |
| **会话体系** | 账号会话（scrypt）、游客会话 `gst.`、超管测试会话 `sat.`、后台专属会话（平台/资源方一键进入） |
| **审计** | 创建/支付/审批/上架/调价/审核/充值/续费/变更配置/恢复快照/工单回复与升级均留痕 |
| **安全头** | `nosniff`、`DENY`、`Referrer-Policy`、`Permissions-Policy` |

---

## 🗄️ 数据模型

核心实体：`enterprises`、`members`、`projects`、`providers`、`resources`、`images`、`orders`、`instances`、`snapshots`、`bills`、`invoices`、`settlements`、`recharge_records`、`approvals`、`approval_policies`、`approval_requests_v3`、`approval_request_steps`、`workload_intents`、`recommendations`、`order_drafts`、`usage_records`、`instance_metrics`、`instance_logs`、`resource_benchmarks`、`resource_reviews`、`tickets`、`alerts`、`notifications`、`notification_preferences`、`audit_logs`、`auth_sessions`、`api_keys`、`subscriptions`。

生产数据库目标见 [`database/postgres/0001_v3_foundation.sql`](database/postgres/0001_v3_foundation.sql)（精确数值类型、外键、复合索引、租户 RLS）。

---

## 🧪 测试

```bash
npm test
```

- 框架 `node --test`，每个测试文件独立进程、`DB_PATH=:memory:` 自动种子数据。
- **31 项全部通过**，覆盖：会话安全闭环、游客隔离/限流、API 密钥、AI 推荐、锁价草稿、多级审批、FinOps 聚合、租户隔离（跨企业 404）、登录锁定 429、工单 SLA/升级、实例监控/日志/计费明细、资源评测评论、续费扣费、结算引擎/提现校验、项目多级审批人、后台会话可达、充值渠道、变更配置/快照恢复、移动端告警。

---

## 📁 目录结构

```
compute-x/
├── server/                  # Node.js + Express + SQLite
│   ├── src/
│   │   ├── index.js          # 服务入口（8787）
│   │   ├── db.js             # Schema + 种子数据（含观测/评测/充值表）
│   │   ├── security.js       # 鉴权/会话/限流/角色门禁
│   │   ├── utils.js          # 状态机/计费/通知/审计
│   │   ├── services/advisor.js
│   │   └── routes/           # auth/market/orders/billing/org/tickets/
│   │                         # notifications/provider/admin/dashboard/
│   │                         # advisor/finops/approvals-v3
│   ├── test/                 # 11 个测试文件（31 用例）
│   └── data/                 # SQLite 数据库（自动生成）
├── web/                      # React + Vite + Ant Design
│   └── src/
│       ├── console/          # 需求方控制台（18 页）
│       ├── provider/         # 资源方后台
│       ├── admin/            # 平台管理后台
│       ├── app/              # 移动端 App
│       ├── components/       # 自绘 SVG 图表
│       └── pages/Login.jsx   # 一键登录/游客/后台会话
├── database/postgres/        # 生产 PostgreSQL 基线
├── docs/                     # PRD.md + ADR
├── landing/                  # 静态落地页
├── api/                      # Vercel 函数
└── Dockerfile
```

---

## 🚢 部署与生产

- **开发**：后端 `node src/index.js`（8787）+ 前端 `npm run dev`（5173）。
- **生产**：`docker build` 构建单容器，前端由 API 同源托管；`NODE_ENV=production` 关闭演示登录与后台一键进入、开启游客只读。
- **生产配置**：`SESSION_SECRET`（≥32 字符，必填）、`CORS_ORIGINS`、`DB_PATH=/data/computex.db`。
- **外部依赖**：实例交付/监控/日志/用量为模拟；支付仅余额扣减 + 模拟充值回调，未接第三方支付。

---

## ⚠️ 已知边界

| 项 | 说明 |
| --- | --- |
| 实例交付 | 模拟（下单约 2 秒进入运行中），未接真实 GPU 资源 |
| 监控/日志/用量 | 模拟生成（已按真实表结构组织，可替换数据源） |
| 支付 | 仅余额扣减；充值为模拟渠道回调，未接持牌支付 |
| 双审批 | 旧 `approvals` 与 V3 并存，`orders/create` 仍走旧路径（后续统一） |
| 数据库 | 演示用 SQLite；商业化前切换至托管 PostgreSQL 基线 |

---

## 🗓️ 版本记录

| 轮次 | 内容 |
| --- | --- |
| R1 治理安全 | 租户隔离补全、登录/写接口限流、工单治理（SLA/升级/审计）、实例观测真实化 |
| R2 功能完整 | 资源评测/评论真实化、续费真实扣费、报表真实计算、月度结算引擎 |
| R3 体验深度 | FinOps 维度扩展、项目多级审批人、审计补全、移动端回复 bug 修复 |
| R4 关键链路 | 平台/资源方后台专属会话、仪表盘趋势真实化、充值渠道抽象 |
| R5 实例增强 | 变更配置（差价补扣）、快照恢复、移动端告警真实化 |

---

<p align="center">ComputeX · 算力租赁平台 · Enterprise</p>
