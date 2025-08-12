## 在 LLM Gateway 集成 @nuwa-ai/payment-kit（路径依赖版）

本文档给出在 `nuwa-services/llm-gateway` 中集成 `@nuwa-ai/payment-kit` 的最小可行方案（MVP）。先以“基于路径的依赖”进行集成，评审通过后再落地代码与灰度切换。

> 约定：本文用中文说明，代码与标识使用英文。项目内统一使用 pnpm 进行安装与构建 [[memory:5553005]]。

---

### 1. 依赖与构建

- 在 `nuwa-services/llm-gateway/package.json` 增加本地路径依赖：

```json
{
  "dependencies": {
    "@nuwa-ai/payment-kit": "file:../../nuwa-kit/typescript/packages/payment-kit"
  }
}
```

- 安装与构建顺序（先构建 kit，再构建 gateway）：

```bash
pnpm -C nuwa-kit/typescript/packages/payment-kit build
pnpm -C nuwa-services/llm-gateway install
pnpm -C nuwa-services/llm-gateway build
```

---

### 2. 环境变量

最小必需：

- `SERVICE_KEY`: 服务端私钥（用于服务 DID 签名）
- `ROOCH_NODE_URL`: Rooch 节点 URL（如 `http://localhost:6767`）
- `ROOCH_NETWORK`: `local | dev | test | main`（默认 `test`）
- `DEFAULT_ASSET_ID`: 结算资产，默认 `0x3::gas_coin::RGas`

存储后端（MVP 默认内存；生产建议 SQL，如 Supabase）：

- 内存（默认）：无需额外配置
- SQL（Postgres/Supabase）：
  - `PAYMENTKIT_BACKEND=sql`
  - `PAYMENTKIT_CONNECTION_STRING=$SUPABASE_DB_URL`
  - `PAYMENTKIT_TABLE_PREFIX=nuwa_`（可选）
  - `PAYMENTKIT_AUTO_MIGRATE=true`（建议仅在非生产或明确允许的生产场景）

可选：

- `ADMIN_DID`: 允许访问 admin 接口的 DID（逗号分隔），默认服务 DID
- `DEBUG=true`: 打开调试日志

---

### 3. 服务端集成方式（推荐）

采用 `ExpressPaymentKit`（服务端收款方）对业务路由进行“计费注册”。流程与 `nuwa-kit/typescript/examples/payment-kit-integration/src/server.ts` 一致：

1) 初始化 PaymentKit（从 IdentityEnv）：

```ts
import express from 'express';
import { IdentityKit, DebugLogger } from '@nuwa-ai/identity-kit';
import { createExpressPaymentKitFromEnv } from '@nuwa-ai/payment-kit';

const app = express();
app.use(express.json());

async function initPaymentKit() {
  const env = await IdentityKit.bootstrap({
    method: 'rooch',
    vdrOptions: {
      rpcUrl: process.env.ROOCH_NODE_URL,
      network: process.env.ROOCH_NETWORK || 'test',
    },
  });

  if (!process.env.SERVICE_KEY) throw new Error('SERVICE_KEY is required');
  await env.keyManager.importKeyFromString(process.env.SERVICE_KEY);

  const billing = await createExpressPaymentKitFromEnv(env, {
    serviceId: 'llm-gateway',
    defaultAssetId: process.env.DEFAULT_ASSET_ID || '0x3::gas_coin::RGas',
    defaultPricePicoUSD: '0',
    adminDid: process.env.ADMIN_DID?.split(',') || [],
    debug: process.env.DEBUG === 'true',
  });

  if (process.env.DEBUG === 'true') DebugLogger.setGlobalLevel('debug');

  // 暴露服务发现、健康检查、admin 等内置路径
  app.use(billing.router);

  return { billing };
}
```

2) 将计费应用到 LLM 业务路由（非流式接口，使用 FinalCost 后记账）：

```ts
// 假设已有 handleNonStreamLLM(req) 能返回 { status, body, usage?: { cost } }
export function registerBillableRoutes(billing: any) {
  // 非流式：最终成本（美元）→ picoUSD（×1e12）写入 res.locals.usage
  billing.post(
    '/api/v1/chat/completions',
    { pricing: { type: 'FinalCost' } },
    async (req, res) => {
      const result = await handleNonStreamLLM(req);
      const totalCostUSD = result?.usage?.cost ?? 0; // 以美元计价（数字）
      (res as any).locals.usage = Math.round(totalCostUSD * 1e12); // USD → picoUSD
      res.status(result.status).json(result.body);
    },
    'llm.chat.completions'
  );

  // 免费查询类路由（如 /usage）：需要 DID 鉴权但不计费
  billing.get('/usage', { pricing: '0', authRequired: true }, async (req, res) => {
    const data = await getUsageForDid(req);
    res.json({ success: true, data });
  }, 'usage.get');
}
```

> 说明：
> - `FinalCost` 策略期望传入的是 picoUSD（整数）。如果上游返回美元成本（浮点数/数字），需乘以 `1e12`。
> - 对接入 `billing.*` 的付费路由，PaymentKit 内部会执行 DIDAuthV1 鉴权，无需再叠加项目内已有的 DID 中间件。

3) 在 `src/index.ts` 中先 `await initPaymentKit()`，再 `registerBillableRoutes(billing)`，最后保留历史路由用于灰度（见第 5 节）。

---

### 4. 关于流式响应的计费

流式响应的首包很早发出，难以在响应头中注入最终成本（`FinalCost` 需要 usage）。建议两步走：

- 短期（MVP）：流式接口按“固定单价”计费（`PerRequest`），或暂不计费（FREE）。

```ts
billing.post('/api/v1/chat/completions:stream', { pricing: '2000000000' }, async (req, res) => {
  // 固定价格（示例 0.002 USD）
  await handleStreamLLM(req, res);
});
```

- 后续：采用“提案 + 提交”的 Commit 流程（开始时发提案，结束后提交最终金额），需要在网关中对接 PaymentKit 的提交接口，或在流结束前缓冲并延迟首包（较复杂，建议单独迭代）。

---

### 5. 功能开关与灰度

建议引入 `ENABLE_PAYMENT_KIT=true|false`：

- `true`：启用本文所述 `billing.*` 路由；原有 `llmRoutes` 可部分迁移或关闭对应路径。
- `false`：保持现有实现不变，便于回滚与灰度发布。

---

### 6. 客户端（Payer）调用建议

推荐使用 `@nuwa-ai/payment-kit` 的 `PaymentChannelHttpClient` 作为支付方客户端：

- 自动发现服务（`/.well-known/nuwa-payment/info`）
- 自动创建/复用支付通道并附加 `X-Payment-Channel-Data`
- 自动解析服务端返回支付头与完成签名/提交

参考示例：`nuwa-kit/typescript/examples/payment-kit-integration/src/client-cli.ts`。

---

### 7. 验证流程（本地）

1) 构建 kit 与网关：

```bash
pnpm -C nuwa-kit/typescript/packages/payment-kit build
pnpm -C nuwa-services/llm-gateway build
pnpm -C nuwa-services/llm-gateway dev
```

2) 准备 payer 资金与通道（可用示例 CLI 或自写脚本）：
   - 调用 `discoverService` → `openChannel` → `depositToHub`（如需）

3) 使用 `PaymentChannelHttpClient` 发起到 `POST /api/v1/chat/completions` 的非流式请求：
   - 检查响应头 `X-Payment-Channel-Data`
   - 检查服务端 RAV 持久化（若启用 SQL 后端）与自动/手动 claim 结果

---

### 8. 后续迭代

- 完成流式响应的 Commit 流程
- 将默认价格与策略抽到配置（按模型/路径维度）
- 完善管理员端与监控面板
- 引入 e2e 自动化测试（参考 payment-kit e2e）

---

### 9. 参考

- `nuwa-kit/typescript/examples/payment-kit-integration/src/server.ts`
- `@nuwa-ai/payment-kit` `ExpressPaymentKit` 与 `HttpBillingMiddleware`
- `/.well-known/nuwa-payment/info` 服务发现约定


