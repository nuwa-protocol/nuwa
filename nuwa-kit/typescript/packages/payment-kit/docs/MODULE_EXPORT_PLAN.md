# Payment Kit 模块导出与环境适配规划

> 目标：保持单包，不拆分 NPM 包；通过“条件导出 + 子路径导出 + 双入口（browser/node）”实现浏览器与 Node 友好集成，避免前端解析到 Node-only 代码。

---

## 1. 导出策略总览

- 根入口 `@nuwa-ai/payment-kit`：条件导出
  - browser → `dist/browser/index.js`
  - import/require → `dist/node/index.(js|cjs)`
  - types → 统一指向 Node 产物的 d.ts（两端共享类型）

- 子路径按“功能”命名（避免以环境命名）：
  - `@nuwa-ai/payment-kit/http`：HTTP Payer Client（浏览器与 Node 通用）
  - `@nuwa-ai/payment-kit/express`：Express 集成（Node-only）
  - `@nuwa-ai/payment-kit/storage/sql`：SQL 存储（Node-only）
  - `@nuwa-ai/payment-kit/storage/indexeddb`：IndexedDB 存储（Browser-only）

- 依赖治理
  - `sideEffects: false` 以利于 tree-shaking
  - 将 `express`、`pg` 标记为可选 peerDependencies，避免前端强装

---

## 2. 模块逐项分析

下列为 `src/` 目录下模块分组与导出位置建议。

### 2.1 Isomorphic（浏览器/Node 通用）

- `core/**`
  - 依赖：纯 TS，依赖 `@nuwa-ai/identity-kit` 类型与 BCS 序列化；无 Node/DOM 顶层访问
  - 导出：根入口（browser/node 均可）；保留
  - 路径调整：无

- `contracts/IPaymentChannelContract.ts`
  - 依赖：纯接口
  - 导出：根入口
  - 路径调整：无

- `client/PaymentChannelPayerClient.ts`, `client/PaymentHubClient.ts`
  - 依赖：合约接口 + 存储工厂（内存/IndexedDB/SQL 通过工厂选择）；无 Node-only 顶层依赖
  - 导出：根入口（browser/node 均可）
  - 路径调整：无

- `client/PaymentChannelPayeeClient.ts`
  - 依赖：合约接口 + DIDResolver + 存储工厂；默认可在两端运行（SQL 需显示选择）
  - 导出：根入口（browser/node 均可）
  - 路径调整：无

- `billing/**`
  - 依赖：纯算法与接口；`rate/contract.ts` 通过合约接口获取价格（isomorphic）
  - 导出：根入口
  - 路径调整：无

- `integrations/http/**`
  - 依赖：`fetch` 经 `FetchLike` 抽象；`globalThis.fetch` 可在浏览器/Node18+ 可用
  - 导出：子路径 `http`（两端均可），同时可从根入口再导出（可选）
  - 路径调整：无

- `middlewares/http/HttpPaymentCodec.ts`
  - 依赖：纯编解码
  - 导出：根入口
  - 路径调整：无

- `utils/**`, `schema/**`, `types/**`, `errors/**`, `factory/chainFactory.ts`, `helpers/fromIdentityEnv.ts`
  - 依赖：纯 TS
  - 导出：根入口
  - 路径调整：无

### 2.2 Browser-only

- `storage/indexeddb/*.ts`
  - 依赖：`window.indexedDB`
  - 导出：子路径 `storage/indexeddb`（仅 browser 包导出）；根入口 browser 侧间接可用
  - 路径调整：新增 `storage/indexeddb/index.ts` 汇总导出（见第 3 节）

### 2.3 Node-only

- `transport/express/**`
  - 依赖：Express 类型/运行时（Node）
  - 导出：子路径 `express`（仅 node 包导出）
  - 路径调整：维持 `transport/express` 为权威导出源；弃用 `integrations/express`（保留兼容期但不再从根入口导出）

- `api/**`
  - 依赖：服务端上下文（但不强依赖 express）
  - 导出：仅随 `express` 子路径在 Node 侧导出或从 node 根入口导出
  - 路径调整：无

- `storage/sql/*.ts`, `storage/sql/serialization.ts`
  - 依赖：`pg`
  - 导出：子路径 `storage/sql`（仅 node 包导出）
  - 路径调整：新增 `storage/sql/index.ts` 汇总导出（见第 3 节）

### 2.4 可移除/合并/命名清理

- `integrations/express/index.ts`
  - 状态：有 `transport/express/index.ts` 作为新路径
  - 建议：标注 deprecated；不再从根入口导出，避免歧义

- `storage/sql/index.ts` 目前为空
  - 建议：实现为 SQL 子路径的聚合导出（见第 3 节）

- `storage/indexeddb/index.ts` 不存在
  - 建议：新增聚合导出，便于子路径映射

---

## 3. 入口与导出文件规划

### 3.1 双入口文件

- `src/index.browser.ts`
  - 导出：core、billing、contracts、clients、integrations/http、utils、schema、errors、factory、helpers、middlewares/http
  - 不导出：`transport/express`、`api/**`、`storage/sql/**`

- `src/index.node.ts`
  - 导出：上述通用模块 + `transport/express`、`api/**`、`storage/sql/**`
  - 不导出：`storage/indexeddb/**`（仍可通过子路径获取）

### 3.2 子路径聚合文件

- `src/storage/sql/index.ts`：导出 `Sql*Repository` 与 `serialization`
- `src/storage/indexeddb/index.ts`：导出 `IndexedDB*Repository`

---

## 4. package.json 与构建

- `exports`：
  - `"."`: { browser/import/require/types } 指向双产物
  - `"./http"`: browser → `dist/browser/integrations/http/index.js`；node → `dist/node/integrations/http/index.js`
  - `"./express"`: node-only → `dist/node/transport/express/index.(js|cjs)`
  - `"./storage/sql"`: node-only → `dist/node/storage/sql/index.(js|cjs)`
  - `"./storage/indexeddb"`: browser-only → `dist/browser/storage/indexeddb/index.js`

- `peerDependencies`：把 `express`、`pg` 标记为可选

- `tsup.config.ts`：两套构建配置
  - browser：entry `index.browser.ts`、`integrations/http/index.ts`、`storage/indexeddb/index.ts`
  - node：entry `index.node.ts`、`integrations/http/index.ts`、`transport/express/index.ts`、`storage/sql/index.ts`
  - 为 browser-only 子路径在 Node 端提供空模块占位：`src/node/empty.ts`

---

## 5. 迁移与兼容说明

- 用户导入：
  - 通用：`import { ... } from '@nuwa-ai/payment-kit'`
  - HTTP 客户端：`import { PaymentChannelHttpClient } from '@nuwa-ai/payment-kit/http'`
  - Express：`import { createExpressPaymentKit } from '@nuwa-ai/payment-kit/express'`
  - SQL/IndexedDB：使用 `@nuwa-ai/payment-kit/storage/sql` 或 `.../storage/indexeddb`

- 兼容旧路径：`integrations/express` 标注 deprecated，不再从根入口导出

---

以上规划将减少前端构建报错与无用依赖，保持 API 清晰稳定。


