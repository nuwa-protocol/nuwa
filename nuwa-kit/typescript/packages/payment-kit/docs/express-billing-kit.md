# ExpressBillingKit —— 一站式计费集成

> ⚠️  当前 `@nuwa-ai/payment-kit` 尚未正式发布，API 仍可能调整。
>
> 本文档介绍 **ExpressBillingKit** —— 将 `BillableRouter` 与 `HttpBillingMiddleware` 封装到一起，提供"三行代码"即可完成计费／支付接入的高阶封装。

---

## 背景

在旧的集成方式里，你需要：

1. 创建 `BillableRouter` 声明路由与价格；
2. 创建 `HttpBillingMiddleware` 做支付校验；
3. 手动组合前置 / 后置中间件或自己包装 handler；
4. 处理 `/admin*`、`/health` 等无需计费的特殊路径。

这造成了**样板代码多、容易出错**。`ExpressBillingKit` 的目标是：

* **一步可用**——最小化"胶水"代码；
* **灵活可插拔**——高级用户仍能替换策略、存储等实现；
* **按需生效**——只对通过 Kit 注册的路由做计费，不影响其它中间件。

---

## 快速开始

```ts
import express from 'express';
import { createExpressBillingKit } from '@nuwa-ai/payment-kit/express';
import { KeyManager } from '@nuwa-ai/identity-kit';
import OpenAIProxy from './handlers/openai.js';

const app = express();
app.use(express.json());

// 1. 创建 BillingKit（最小配置）
const billing = await createExpressBillingKit({
  serviceId: 'llm-gateway',                                  // 服务标识
  signer: KeyManager.fromPrivateKey(process.env.SERVICE_PRIVATE_KEY!), // 服务私钥
  did: process.env.SERVICE_DID,                              // 可选：如果 signer 不含 DID
  
  // 可选配置
  rpcUrl: 'https://rooch.dev.node',                          // 默认取 env.ROOCH_NODE_URL
  network: 'dev',                                            // 默认 'local'
  defaultAssetId: '0x3::gas_coin::RGas',                     // 默认结算资产
  defaultPricePicoUSD: '500000000',                          // 未匹配规则时的兜底价
  didAuth: true,                                             // 默认开启 DID 认证
  debug: true                                                // 调试日志
});

// 2. 声明路由 & 计价策略
billing.post('/chat/completions',
  {
    type: 'PerToken',               // 动态按 token 计价
    unitPricePicoUSD: '20000',      // = 0.00002 USD / token
    usageKey: 'usage.total_tokens'  // 从 res.locals.usage.total_tokens 取用量
  },
  OpenAIProxy                       // 你的业务 handler（可异步）
);

// 3. 挂载到应用
app.use('/api/v1', billing.router);

app.listen(3000, () => console.log('🚀 Server ready on :3000'));
```

完成！从此：

* 客户端请求需携带上一笔签名好的 SubRAV；
* `ExpressBillingKit` 自动做握手 / 校验 / 计价 / 续签提案；
* 业务 handler 只关心把 LLM 结果写回并把 `usage` 丢进 `res.locals`。

---

## 服务身份与密钥管理

| 场景 | 推荐做法 |
|------|-----------|
| **本地开发** | 用脚本一次性生成 DID + 私钥，保存到 `.env` 或 `.dev-secrets/service.json`；在代码里 `KeyManager.fromPrivateKey()` 读取即可。 |
| **CI / 演示环境** | 在 Cadop 控制台（或其它 DID 平台）预先创建 Agent，拿到私钥后存入云端 Secret Manager；启动时通过 `process.env` 注入。 |
| **生产环境** | 同上，但私钥应托管在云 KMS / HSM。编写一个 `KmsSigner` 适配 `SignerInterface`，注入到 `signer` 参数。私钥不可导出，满足合规与审计要求。 |

### 最小代码示例

```ts
import { KeyManager } from '@nuwa-ai/identity-kit';

const billing = await createExpressBillingKit({
  serviceId: 'echo-service',
  signer: KeyManager.fromPrivateKey(process.env.SERVICE_PRIVATE_KEY!),
  did: process.env.SERVICE_DID  // 如果 signer 能自报 DID，此项可省略
});
```

---

## API 设计

### `createExpressBillingKit(options)`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `serviceId` | `string` | ✅ | 服务标识，用于链上计费配置 |
| `signer` | `SignerInterface` | ✅ | 服务私钥（或 KMS Signer） |
| `did` | `string` | ⬜ | 可选：若 Signer 无法自报 DID，可手动指定 |
| `rpcUrl` | `string` | ⬜ | RPC 地址，默认取 `env.ROOCH_NODE_URL` |
| `network` | `'local' \| 'dev' \| 'test' \| 'main'` | ⬜ | 网络，默认 `'local'` |
| `defaultAssetId` | `string` | ⬜ | 默认结算资产 ID |
| `defaultPricePicoUSD` | `string \| bigint` | ⬜ | 未命中规则的默认价 |
| `didAuth` | `boolean` | ⬜ | DID 身份认证开关，默认 `true` |
| `debug` | `boolean` | ⬜ | 打印调试日志 |

返回对象：

```ts
interface ExpressBillingKit {
  router: Router;                     // 挂载到 app 的 Express Router
  get: (...args) => this;            // 同下方所有 HTTP 动词
  post: (...args) => this;
  put: (...args) => this;
  delete: (...args) => this;
  patch: (...args) => this;
  // ...其它工具方法
}
```

### `kit.<verb>(path, pricing, handler, ruleId?)`

* `path`：Express 路径模式；
* `pricing`：两种写法
  * **固定价**：字符串 / bigint → 走 `PerRequest` 策略；
  * **策略对象**：`StrategyConfig`（如 `PerToken`）→ 走动态计价；
* `handler`：业务函数，可返回 `Promise`；
* `ruleId`：覆盖默认生成的规则 ID（可选）。

> **提示**：若要按 token 计价，请确保在 `handler` 内写入
> ```ts
> res.locals.usage = response.usage; // OpenAI / LiteLLM 标准格式
> ```

---

## 内部实现概要

1. **路由注册包装**
   * **Step-0 DIDAuth**：验证 `Authorization: DIDAuthV1 ...` 头并填充 `req.didInfo`；
   * 预检阶段：解析 `X-Payment-Channel-Data`，校验 & 预算检查；
   * 业务 handler 执行；
   * 后置阶段：读取 `res.locals` 或配置的 `resolver()` 提取用量，计算费用，生成下一张 SubRAV，写回响应头。 

2. **策略工厂**
   * 继续使用 `StrategyFactory`，新增 `PerTokenStrategy` 支持 `unitPricePicoUSD` × `usageKey`。  

3. **无需额外中间件顺序**
   * 所有逻辑都包在注册的路由 handler 中，对 `/admin/*`, `/health` 等路径不产生影响。

### DID 身份认证

`ExpressBillingKit` 默认会在每个计费路由前插入 **DIDAuthV1** 认证中间件，确保请求者拥有合法 DID，且签名与 `req.didInfo` 记录在案。

自定义：

```ts
const billing = await createExpressBillingKit({
  serviceId: 'svc',
  signer: myKeyManager,
  didAuth: false  // 关闭 DID 认证（不推荐生产环境）
});
```

若 `didAuth=false`，Kit 只做延迟支付校验，不做身份鉴权。

---

## 进阶用法

### 自定义计价策略
```ts
billing.post('/high-memory-task', {
  type: 'PerByte',           // 你自定义的策略
  unitPricePicoUSD: '50',
  usageKey: 'stats.bytes'
}, handler);
```
在 `StrategyFactory` 中注册你的 `PerByteStrategy` 即可。

### 内置运维 & 恢复接口

`ExpressBillingKit` 额外暴露两个可选 Router，帮助开发者快速集成运维面板和客户端恢复能力：

| Router | 默认挂载路径 | 典型接口 | 主要用途 |
|--------|--------------|----------|----------|
| **AdminRouter** | `/admin/pay` | `GET /claims` `POST /claim/:id` `DELETE /cleanup` `GET /stats` | 运维/监控，需要加认证 |
| **RecoveryRouter** | `/payment` | `GET /pending` `GET /price/:assetId` | 客户端在数据丢失后拉取最新未签名 SubRAV 或资产价格 |

启用示例：

```ts
app.use('/payment', billing.recoveryRouter());           // 面向客户端，无需额外认证

app.use('/admin/pay', billing.adminRouter({              // 仅在测试 / 运维环境启用
  auth: myBasicAuth                                     // 自定义鉴权中间件
}));
```

`RecoveryRouter` 的核心接口：

```
GET /payment/pending
Headers:
  X-Channel-Id: <channelId>
  X-VM-Fragment: <vmIdFrag>
  X-Signed-Nonce: <sig of "pending:<channelId>:<nonce>">

200 → { subRav: {...} }   // 最新未签名提案
404 → 无待签提案
403 → 签名无效
```

客户端只需用自己的私钥签一个简单字符串即可安全拉取提案，便于恢复缓存。

---

## Roadmap

* [ ] 支持 Fastify / Koa Kit
* [ ] CLI 自动生成链上 YAML 计费配置
* [ ] DevTools：实时查看计费规则与测试覆盖

---

如有问题或建议，欢迎在 GitHub Discussion 区讨论 💬。 