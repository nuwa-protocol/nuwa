# 📁 Payment Kit – 项目结构与架构总览

> 适用版本：`@nuwa-ai/payment-kit@latest`
>
> 本文档合并了原 `FINAL_ARCHITECTURE.md` 与 `PROJECT_STRUCTURE.md`，并同步至当前代码目录结构。

---

## 目录一览

```text
payment-kit/
├── README.md               # 项目介绍 & 快速开始
├── CHANGELOG.md            # 版本变更记录
├── package.json            # NPM 包配置
├── tsconfig.json           # TypeScript 编译配置
├── jest.config*.ts         # 单元 / E2E 测试配置
├── docs/                   # 📚 文档（本文件所在位置）
│   └── PROJECT_STRUCTURE.md
├── __tests__/              # 通用测试目录
│   └── basic.test.ts
└── src/                    # 源代码根目录
    ├── index.ts            # 包导出入口
    ├── schema/             # 📦 数据模型 & Zod 验证
    │   ├── core/           #   ├─ 核心业务数据模型
    │   └── api/            #   └─ 各 API 端点请求/响应模型
    ├── types/              # 🧩 框架层类型定义
    │   ├── api.ts          #   └─ Handler / ApiContext / ErrorCode 等
    │   └── internal.ts     #       服务端专用扩展类型
    ├── api/                # 🎯 内置 API Handler 注册与实现
    │   ├── handlers/       #   ├─ 业务 Handler 实现
    │   └── index.ts        #   └─ BuiltInApiHandlers 注册表
    ├── transport/          # 🚚 协议适配层
    │   └── express/        #       HTTP/Express 适配
    │       ├── BillableRouter.ts
    │       ├── HandlerRestAdapter.ts
    │       ├── PaymentKitExpressAdapter.ts
    │       └── ExpressPaymentKit.ts
    ├── integrations/       # 🔌 客户端 / 外部集成
    │   └── http/           #       HTTP 客户端实现
    ├── middlewares/        # 🛡️ 共享中间件
    ├── core/               # ⚙️ 协议核心（链无关）
    └── rooch/              # 🌐 Rooch 区块链特定实现
```

---

## 分层架构

| 层级         | 目录             | 职责                                                                                               | 关键文件                    |
| ------------ | ---------------- | -------------------------------------------------------------------------------------------------- | --------------------------- |
| **框架层**   | `src/types/`     | 定义通用 Handler、Context、ErrorCode 等基础设施类型                                                | `api.ts`                    |
| **数据层**   | `src/schema/`    | 使用 **Zod** 声明可序列化的数据结构 & 运行时验证；`z.infer` 自动生成 TS 类型                       | `core/index.ts`, `api/*.ts` |
| **业务层**   | `src/api/`       | 将业务 Handler 与 Schema 关联，组成 **BuiltInApiHandlers** 注册表；支持 REST/MCP/JSON-RPC 等多协议 | `handlers/*.ts`, `index.ts` |
| **适配层**   | `src/transport/` | 将业务 Handler 适配到具体传输协议（HTTP、gRPC、MCP…）                                              | `express/*`                 |
| **核心协议** | `src/core/`      | NIP-4 支付协议核心逻辑，与区块链无关                                                               | `subrav.ts`, `types.ts`     |
| **链适配**   | `src/rooch/`     | Rooch 链特定合约调用、客户端封装                                                                   | `contract.ts`, `client.ts`  |

### 💡 关键设计原则

1. **Schema 专注数据**：所有可序列化的数据结构统一放在 `schema/`，通过 Zod 保障运行时安全。
2. **框架类型独立**：`Handler`、`ApiContext`、`ApiResponse` 等放在 `src/types/`，不与业务数据耦合。
3. **语义化 Handler 命名**：`BuiltInApiHandlers` 以 _语义化名称_ 作为 key，`path`/`method` 仅在 REST 适配层使用。
4. **单一路由层**：`HandlerRestAdapter` 将 PaymentKit Handler 直接注册到 `BillableRouter`，消除 dummy 层。
5. **BigInt 安全**：统一使用自定义 JSON 序列化辅助函数 + Zod Transform，避免手动白名单。

---

## 📦 关键目录详解

### 1. `src/schema/`

- **`core/`**：通用可复用实体（`SubRAVSchema`、`ChannelInfoSchema`…）
- **`api/`**：按端点拆分的请求/响应 Schema
- **输出**：构建后只保留类型信息，供应用/SDK 使用

### 2. `src/api/`

- **`handlers/`**：纯业务逻辑实现，零 Express 依赖
- **`index.ts`**
  - 通过 `createValidatedHandler()` 将 Schema 绑定到 Handler
  - **`BuiltInApiHandlers`** 注册表（语义化名称 → `ApiHandlerConfig`）

```ts
export const BuiltInApiHandlers = {
  recovery:     { path: '/recovery', method: 'GET',   handler, options },
  commit:       { path: '/commit',   method: 'POST',  handler, options },
  health:       { path: '/health',   method: 'GET',   handler, options },
  subravQuery:  { path: '/subrav',   method: 'GET',   handler, options },
  adminClaims:  { path: '/admin/claims', ... },
  // ...
} as const;
```

### 3. `src/transport/express/`

| 文件                          | 职责                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| `BillableRouter.ts`           | 维护计费规则 & 路由统一入口                                    |
| `HandlerRestAdapter.ts`       | **核心适配器**：把 PaymentKit Handler ➜ Express RequestHandler |
| `PaymentKitExpressAdapter.ts` | 协调 `BuiltInApiHandlers` 与 `BillableRouter`，注册所有路由    |
| `ExpressPaymentKit.ts`        | 封装为可直接挂载的 Express App 组件                            |

### 4. `src/integrations/http/`

- 客户端 SDK，处理序列化、签名、缓存等
- `HostChannelMappingStore.ts` 通过 `PersistedHttpClientStateSchema` 保证 BigInt 转换安全

---

## 🧪 测试

- **单元测试**：`__tests__/basic.test.ts`
- **端到端 (E2E)**：`test/e2e/HttpPaymentKit.e2e.test.ts`
- **BigInt 序列化**：`src/__tests__/bigint-serialization.test.ts`

运行：

```bash
pnpm test            # 单元测试
pnpm test:e2e:local  # E2E 测试（需本地 Rooch 节点）
```

---

## 🚀 快速开始

```bash
# 安装依赖
cd nuwa-kit/typescript/packages/payment-kit
pnpm install

# 构建
pnpm build

# 启动示例 Express 服务
node dist/examples/server.js
```

---

> **最后更新**：2025-08-06
