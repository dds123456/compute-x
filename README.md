<div align="center">

<img src="docs/assets/logo.svg" width="136" height="136" alt="ComputeX logo">

# ComputeX 算力租赁平台

**面向企业 GPU 采购、FinOps 成本治理与多级审批的可部署演示版**

[![Release](https://img.shields.io/badge/release-v1.0.0-2f54eb?style=for-the-badge&logo=semver&logoColor=white)](package.json)
[![npm](https://img.shields.io/badge/npm-private%20%C2%B7%20not%20published-cb3837?style=for-the-badge&logo=npm&logoColor=white)](package.json)
[![License](https://img.shields.io/badge/license-none%20declared-lightgrey?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](#-许可证)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2024-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](#-运行方法)
[![CI](https://github.com/dds123456/compute-x/actions/workflows/ci.yml/badge.svg)](https://github.com/dds123456/compute-x/actions/workflows/ci.yml)
[![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=black)](web)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?style=for-the-badge&logo=vite&logoColor=white)](web)

[快速开始](#-运行方法) · [使用说明](#-使用说明) · [目录结构](#-目录结构与基本原理) · [常见问题](#-常见问题)

</div>

---

## 📌 软件定位

ComputeX 是一个**算力（GPU）租赁与治理平台的演示版**，把“算力选型 → 报价锁价 → 多级审批 → 支付交付 → 计费出账 → 结算”串成一条可以端到端走通的业务链路。

> 🟦 **它是什么**：一个可运行、可测试的产品基线，用来展示双边算力市场的业务流程与治理规则。
> 🟥 **它不是什么**：不是真实的算力交付系统。实例交付、监控、日志、数据擦除与支付渠道都是**模拟**实现，界面和接口中均有标注。

### 三类用户

| 角色 | 入口 | 核心场景 |
|:---:|:---|:---|
| 🏢 **企业成员** | `/console` 控制台 | 选型、下单、审批、看账单、管实例 |
| 🛠️ **资源方运营** | `/provider` 后台 | 上架资源、调价、看收益、提现 |
| 🧭 **平台运营** | `/admin` 后台 | 审核资源方、管理市场、月度结算、发公告 |

## ✨ 基本功能

<table>
<tr>
<td width="50%">

**🧮 算力决策**
- 按模型规模、数据量、时限、预算生成 **3 个可售方案**
- 确定性引擎负责价格、库存、排序；AI 只增强解释
- 推荐引用**报价快照**，支持锁价生成订单草稿

</td>
<td width="50%">

**🔐 治理与审批**
- 项目级审批阈值，超阈值自动进入**多级审批**
- 审批通过**不等于**交付：确认后才生成待支付订单
- 完整审计日志，关键操作留痕

</td>
</tr>
<tr>
<td>

**🖥️ 实例全生命周期**
- 状态机：创建中 → 运行中 ⇄ 已停止 → 释放中 → 已释放
- 启停、续费（按小时计价）、变更配置（补差）、快照恢复
- 监控曲线、日志、告警、计费明细

</td>
<td>

**💳 账务与结算**
- 余额支付、充值（模拟渠道）、账单与发票申请
- 平台与资源方 **T+7 结算**，平台佣金 **7%**
- 资源方提现：仅本资源方可提取，状态校验防重复

</td>
</tr>
<tr>
<td>

**📊 FinOps 成本治理**
- 窗口成本、平均利用率、闲置成本、月度预测、碳排放
- 按 GPU 型号、资源方分组；低利用率实例给出优化建议
- 每个 KPI 公开口径与数据新鲜度

</td>
<td>

**🛡️ 安全与隔离**
- Bearer 会话令牌，登出即撤销；登录失败锁定
- 企业数据按会话隔离，跨企业访问统一返回 404
- 资源方身份以会话绑定为准，不信任请求参数

</td>
</tr>
</table>

---

## 🚀 运行方法

### 1️⃣ 环境要求

| 依赖 | 版本 | 说明 |
|:---|:---|:---|
| ![Node](https://img.shields.io/badge/Node.js-24.x-339933?logo=nodedotjs&logoColor=white) | `24.x` | 根目录 `engines` 要求；后端最低 `>= 23.4` |
| ![npm](https://img.shields.io/badge/npm-11%2B-cb3837?logo=npm&logoColor=white) | `11+` | 随 Node 24 提供 |
| ![SQLite](https://img.shields.io/badge/SQLite-内置-003b57?logo=sqlite&logoColor=white) | — | 使用 Node 内置 `node:sqlite`，无需安装数据库 |

> ✅ 不需要 Docker、MySQL 或 Redis。

### 2️⃣ 安装依赖

```bash
git clone https://github.com/dds123456/compute-x.git
cd compute-x
npm ci            # 根目录会安装 server 与 web 两个工作区
```

### 3️⃣ 启动服务

需要**两个终端**：

```bash
# 终端 A：后端 API（端口 8787）
cd server
npm start
# → ComputeX API 已启动  http://localhost:8787/api/health
```

```bash
# 终端 B：前端（端口 5173，已代理 /api 到 8787）
cd web
npm run dev
# → http://localhost:5173
```

打开 **http://localhost:5173**，点击登录页的演示账号即可一键进入。

### 4️⃣ 运行测试与构建

| 命令 | 作用 | 期望结果 |
|:---|:---|:---|
| `npm test` | 运行服务端测试（35 项） | ![](https://img.shields.io/badge/-35%20passing-22c55e) |
| `npm run build` | 构建前端生产包 | `dist/` 生成，约 1.4 MB（gzip 约 424 KB） |
| `npm audit --audit-level=high` | 依赖安全审计 | `found 0 vulnerabilities` |

### 5️⃣ 环境变量（可选）

| 变量 | 默认 | 作用 |
|:---|:---|:---|
| `PORT` | `8787` | 后端端口 |
| `SESSION_SECRET` | 开发默认值 | 会话签名密钥，**生产环境必须 ≥ 32 位** |
| `AI_GATEWAY_API_KEY` | 未设置 | 配置后启用大模型解释；未设置则走确定性引擎 |
| `AI_ADVISOR_MODEL` | `openai/gpt-5.4-mini` | 大模型名称 |
| `GUEST_RATE_LIMIT_MAX` | `20` | 游客入口每 10 分钟次数上限 |

---

## 🧭 使用说明

### 🔑 演示账号

登录页提供一键登录。也可以手动登录（**密码均为 `123456`**）：

| 账号 | 角色 | 可做的事 |
|:---|:---|:---|
| `陈远` | 企业管理员 | 全部控制台功能、创建企业密钥 |
| `林财务` | 财务 | 账单、发票、充值 |
| `王项目` | 项目负责人 | 项目、审批、下单 |
| `李算法` | 工程师 | 下单、实例操作 |
| `赵只读` | 只读成员 | 只能浏览，不能修改数据 |

> 💡 **API 调用示例**（使用 ASCII 用户 ID，避免中文编码问题）：
>
> ```bash
> # 1. 登录，取得会话令牌
> curl -X POST http://localhost:8787/api/auth/login \
>   -H 'Content-Type: application/json' \
>   -d '{"userId":"u-admin","password":"123456"}'
>
> # 2. 携带令牌访问市场
> curl http://localhost:8787/api/market/resources \
>   -H 'Authorization: Bearer <上一步返回的 token>'
> ```

### 🗺️ 推荐体验路线

```
1. 陈远登录 → 资源市场：按地域、GPU 型号筛选，对比 3 个资源
2. 算力顾问：输入 Qwen3-32B、300GB 数据、300 小时、预算 3 万 → 生成 3 个方案
3. 选择方案 → 生成订单草稿（报价锁定）→ 超阈值进入审批
4. 审批中心：审批通过 → 确认下单 → 支付余额 → 2 秒后实例运行中
5. 实例详情：查看监控、日志、续费、变更配置
6. FinOps：查看成本、闲置实例与碳排放
7. 退出登录 → 用资源方账号进入 /provider，查看收益与提现
```

### 🧩 三个后台入口

| 入口 | 地址 | 登录方式 |
|:---|:---|:---|
| 企业控制台 | `/console` | 账号密码 |
| 资源方后台 | `/provider` | 登录页 “华东智算中心” 一键进入（绑定 `prv-cloud`） |
| 平台后台 | `/admin` | 登录页 “平台运营中心” 一键进入 |

---

## 🏗️ 目录结构与基本原理

### 目录树

```
compute-x/
├── 📦 package.json            根工作区（npm workspaces: server, web）
├── 🔁 .github/workflows/      CI：npm ci → test → build → audit
├── 🌐 api/index.js            Vercel 函数入口（复用 server 的 app）
├── 🗄️ database/postgres/      PostgreSQL V3 DDL（参考结构，当前运行时用 SQLite）
├── 📚 docs/
│   ├── PRD.md                 产品需求（v1.5 现状版）
│   ├── adr/                   架构决策记录（ADR-0001/0002）
│   └── assets/logo.svg        项目 logo
├── 🎨 design/                 视觉设计稿与渲染脚本
├── 🌍 landing/                静态官网页面
│   ├── index.html · about.html · privacy.html · terms.html
│   └── css/style.css
│
├── 🖥️ server/                 后端（Express + node:sqlite）
│   ├── src/
│   │   ├── index.js           入口：中间件、路由挂载、会话校验（端口 8787）
│   │   ├── db.js              建表（30 张）、幂等迁移、种子数据
│   │   ├── security.js        会话签发与校验、限流、角色守卫、密码哈希
│   │   ├── utils.js           状态机、计费、通知、审计
│   │   ├── services/
│   │   │   └── advisor.js     算力决策引擎（确定性 + 可选大模型解释）
│   │   └── routes/            13 个路由模块（见下表）
│   └── test/                  10 个测试文件，35 个用例
│
└── 🎛️ web/                    前端（React 18 + Vite 8 + Ant Design 5）
    ├── src/
    │   ├── pages/Login.jsx    登录页与演示账号入口
    │   ├── console/           企业控制台（约 19 个页面）
    │   ├── provider/          资源方后台
    │   ├── admin/             平台运营后台
    │   ├── app/               移动端（手机壳模拟，4 个底部 Tab）
    │   ├── components/        自绘 SVG 图表（无额外图表库）
    │   └── api.js             axios 实例：自动附加 Bearer 令牌，401 跳回登录
    └── vite.config.js         开发代理 /api → localhost:8787
```

### 路由模块一览

| 路由 | 挂载路径 | 职责 |
|:---|:---|:---|
| `auth` | `/api/auth` | 登录、游客、后台入口、登出、企业与项目切换 |
| `market` | `/api/market` | 资源筛选、详情、对比、评价、估算、降价订阅 |
| `orders` | `/api/orders` | 下单、支付、实例操作、快照、变更配置、恢复、用量 |
| `billing` | `/api/billing` | 账单、支付、充值、发票、结算列表与提现 |
| `org` | `/api/org` | 成员、项目与预算、审批、审计日志 |
| `tickets` | `/api/tickets` | 工单、SLA 统计、升级 |
| `notify` | `/api/notify` | 消息、告警、API 密钥、通知偏好 |
| `provider` | `/api/provider` | 资源方概览、上下架、调价、收益（按会话资源方隔离） |
| `admin` | `/api/admin` | 平台概览、资源方审核、月度结算运行、公告 |
| `dashboard` | `/api/dashboard` | 需求方概览、全局搜索 |
| `advisor` | `/api/advisor` | 推荐、草稿、确认下单 |
| `approvals-v3` | `/api/approvals-v3` | 多级审批策略与审批决策 |
| `finops` | `/api/finops` | FinOps 指标、趋势、优化机会、护栏 |

### 🔬 基本原理

**1. 请求如何被处理**

```
浏览器 ──▶ Vite 代理 /api ──▶ Express
                              │
                              ├─ authenticateApi  ← 解析 Bearer 令牌，写入 req.auth
                              │                     （企业、角色、资源方身份）
                              ├─ 路由模块         ← 所有查询按 req.auth 过滤
                              │
                              └─ SQLite（node:sqlite，同步 API，WAL 模式）
```

**2. 三条核心原则**

| 原则 | 实现 |
|:---|:---|
| 🏷️ **身份以会话为准** | 企业、用户、资源方一律取自 `req.auth`，忽略请求体或查询参数里的同名字段 |
| 🧱 **归属先于操作** | 按 `id + enterprise_id` 查询；越权与“不存在”返回相同的 404，不泄露对象是否存在 |
| ⚖️ **确定性先于智能** | 价格、库存、排序由确定性引擎计算；大模型只能解释，不能改写任何事实 |

**3. 状态机与计费**

- 实例状态由 `utils.js` 的 `transitionInstance` 统一迁移；非法迁移返回明确原因。
- 计费口径：运行时长 × 小时单价；续费顺延 7 天（168 小时）按小时计价；变更配置按差价 × 168 小时补扣。

**4. 审批与履约分离**

审批通过只改变决策状态，订单进入“待确认”；**用户确认下单后**才生成待支付订单，支付成功才创建实例。这保证“审批通过 ≠ 交付完成”。

---

## 🙋 常见问题

<details>
<summary><b>🔴 启动后打开页面是白屏或 401？</b></summary>

- 401 通常是登录已过期。点击右上角“退出登录”，重新选择演示账号。
- 白屏多半是后端没启动：确认终端 A 显示 `ComputeX API 已启动`，并访问 `http://localhost:8787/api/health` 返回 `{"ok":true,...}`。

</details>

<details>
<summary><b>🟠 为什么 <code>npm ci</code> 报错 <code>Missing: … from lock file</code>？</b></summary>

锁文件与 `package.json` 不一致时 `npm ci` 会拒绝安装。请确认使用仓库自带的 `package-lock.json`，不要用 `npm install` 重写它；若修改了依赖，请在同一分支一并提交锁文件。

</details>

<details>
<summary><b>🟡 “AI 推荐”是真的大模型吗？</b></summary>

**不一定。** 方案的价格、库存、排序都由确定性引擎计算。只有配置了 `AI_GATEWAY_API_KEY` 时才会调用大模型生成解释；未配置或调用失败时，界面标记为 `deterministic-fallback`（规则引擎解释）。大模型无法改写任何金额或库存。

</details>

<details>
<summary><b>🟡 实例“交付”和“数据擦除”是真的吗？</b></summary>

**都是模拟。** 下单支付后约 2 秒实例进入运行中，不对接真实 GPU；释放实例时只写入“已按 NIST 800-88 擦除”的通知文字，并不执行真实擦除。界面与文档均按诚实原则标注。

</details>

<details>
<summary><b>🟡 充值和支付会扣真钱吗？</b></summary>

不会。充值使用“开发模拟渠道”直接入账并落库；支付仅扣减站内余额。没有接入任何第三方支付。

</details>

<details>
<summary><b>🔵 测试为什么在 Windows 上显示失败，但 CI 是绿的？</b></summary>

Windows 上 Node 的 `server.close()` 偶发 libuv 断言（`UV_HANDLE_CLOSING`），会让测试文件的退出码变为 1，但**测试用例本身全部通过**。CI 运行在 Linux 上，结果以 `npm test` 的 `35 pass / 0 fail` 为准。

</details>

<details>
<summary><b>🔵 为什么测试里的续费金额是 1008 元？</b></summary>

续费顺延 7 天 = 168 小时，按 RTX 4090 的 6 元/小时计价：`6 × 168 = 1008`。计价口径与实例小时计费一致，见 `server/src/utils.js` 的 `RENEW_HOURS`。

</details>

<details>
<summary><b>🟣 资源方能看到别的资源方的收益吗？</b></summary>

不能。资源方路由只使用会话绑定的 `providerId`，请求参数会被忽略；跨资源方提现返回 404。平台管理员可通过参数查看任一资源方，这是运营需要。

</details>

<details>
<summary><b>🟣 已知限制有哪些？</b></summary>

| 限制 | 说明 |
|:---|:---|
| 数据库是 SQLite | 适合演示与单机；生产需迁移到 PostgreSQL（见 `database/postgres/`） |
| 密码为明文比对 | 演示数据仍用明文 `123456`；生产需改为 BCrypt（提示词 §3.6 要求） |
| 资源方与会话未完全绑定 | 资源方运营账号绑定 `provider_id`，但资源方注册与绑定流程尚未实现 |
| 全局鉴权尚未覆盖所有老接口 | `/api` 已统一校验令牌，部分老接口的细粒度权限仍需逐个收紧 |
| 包未发布到 npm | 仓库为私有包（`"private": true`），不提供 npm 安装 |

</details>

<details>
<summary><b>🟣 如何贡献或修改？</b></summary>

1. 先读 `docs/adr/` 中的决策记录，理解“审批与履约分离”“证据约束的 AI 推荐”两条原则。
2. 修改后执行 `npm test`、`npm run build`、`npm audit --audit-level=high`，三者都通过再提交。
3. 修改依赖时同步提交 `package-lock.json`。

</details>

---

## 📄 许可证

<img src="https://img.shields.io/badge/license-none%20declared-lightgrey?style=flat-square" alt="license: none declared">

**本仓库目前未声明许可证。** 仓库中不存在 `LICENSE` 文件，`package.json` 中也没有 `license` 字段。在作者补充许可证之前，请勿默认视为可自由使用、修改或分发；如需使用，请先联系作者。

---

<div align="center">

**ComputeX** · 让企业像用电一样按需获得算力

<img src="https://img.shields.io/badge/built%20with-Node%2024%20%C2%B7%20React%2018%20%C2%B7%20Vite%208-2f54eb?style=flat-square" alt="built with">

</div>
