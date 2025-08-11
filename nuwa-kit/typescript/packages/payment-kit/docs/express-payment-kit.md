# ExpressPaymentKit —— 一站式计费集成

> ⚠️ 当前 `@nuwa-ai/payment-kit` 尚未正式发布，API 仍可能调整。
>
> 本文档介绍 **ExpressPaymentKit** —— 将 `BillableRouter` 与 `HttpBillingMiddleware` 封装到一起，提供"三行代码"即可完成计费／支付接入的高阶封装。

---

## 背景

在旧的集成方式里，你需要：

1. 创建 `BillableRouter` 声明路由与价格；
2. 创建 `HttpBillingMiddleware` 做支付校验；
3. 手动组合前置 / 后置中间件或自己包装 handler；
4. 处理 `/admin*`、`/health` 等无需计费的特殊路径。

这造成了**样板代码多、容易出错**。`ExpressPaymentKit` 的目标是：

- **一步可用**——最小化"胶水"代码；
- **灵活可插拔**——高级用户仍能替换策略、存储等实现；
- **按需生效**——只对通过 Kit 注册的路由做计费，不影响其它中间件。

---

## 快速开始

```ts
import express from 'express';
import { createExpressPaymentKit } from '@nuwa-ai/payment-kit/express';
import { KeyManager } from '@nuwa-ai/identity-kit';
import OpenAIProxy from './handlers/openai.js';

const app = express();
app.use(express.json());

// 1. 创建 PaymentKit（最小配置）
const payment = await createExpressPaymentKit({
  serviceId: 'llm-gateway',                                  // 服务标识
  signer: KeyManager.fromPrivateKey(process.env.SERVICE_PRIVATE_KEY!), // 服务私钥

  // 可选配置
  rpcUrl: 'https://rooch.dev.node',                          // 默认取 env.ROOCH_NODE_URL
  network: 'dev',                                            // 默认 'local'
  defaultAssetId: '0x3::gas_coin::RGas',                     // 默认结算资产
  defaultPricePicoUSD: '500000000',                          // 未匹配规则时的兜底价
  didAuth: true,                                             // 默认开启 DID 认证
  debug: true                                                // 调试日志
});

// 2. 注册路由及定价（支持多种策略）
payment.post('/v1/chat/completions', {
  type: 'PerToken',
  unitPricePicoUSD: '20000',         // 每 token 0.00002 USD
  usageKey: 'usage.total_tokens'     // 从响应中提取 token 数量
}, OpenAIProxy);                     // 你的业务逻辑 handler

payment.get('/v1/models', '500000000', (req, res) => {
  res.json([{ id: 'gpt-4', ... }]);
});

// 3. 挂载到应用
app.use('/api', payment.router);

// 额外功能：管理 / 恢复路由
app.use('/admin', payment.adminRouter());
app.use('/payment', payment.recoveryRouter());

app.listen(3000);
```

**仅此三步！** 所有计费、认证、异常处理都已自动完成。

---

## 核心 API

### `createExpressPaymentKit(options)`

```ts
interface ExpressPaymentKitOptions {
  // 必需参数
  serviceId: string; // 服务 ID，用于生成计费规则
  signer: SignerInterface; // 服务签名器（包含私钥）

  // 可选参数
  rpcUrl?: string; // Rooch RPC 节点地址
  network?: 'local' | 'dev' | 'test' | 'main';
  defaultAssetId?: string; // 默认结算资产
  defaultPricePicoUSD?: string | bigint; // 兜底价格（皮USD）
  didAuth?: boolean; // 是否启用 DID 认证
  debug?: boolean; // 调试模式
}
```

### Kit 实例方法

```ts
interface ExpressPaymentKit {
  // Express Router（挂载到你的应用）
  readonly router: Router;

  // HTTP 动词方法（类似 Express 但支持定价）
  get(path: string, pricing: PricingStrategy, handler: RequestHandler): this;
  post(path: string, pricing: PricingStrategy, handler: RequestHandler): this;
  put(path: string, pricing: PricingStrategy, handler: RequestHandler): this;
  delete(path: string, pricing: PricingStrategy, handler: RequestHandler): this;
  patch(path: string, pricing: PricingStrategy, handler: RequestHandler): this;

  // 管理和恢复功能
  recoveryRouter(): Router; // 客户端数据恢复
  adminRouter(options?: AdminOptions): Router; // 运营管理接口

  // 高级功能
  getPayeeClient(): PaymentChannelPayeeClient;
}
```

---

## 定价策略

`ExpressPaymentKit` 支持多种灵活的定价方式：

### 1. 固定价格

```ts
payment.get('/v1/status', '1000000000', handler); // 0.001 USD
payment.post('/v1/simple', 500_000_000n, handler); // 0.0005 USD（BigInt）
```

### 2. 按 Token 计费

```ts
payment.post(
  '/v1/chat/completions',
  {
    type: 'PerToken',
    unitPricePicoUSD: '20000', // 每 token 价格
    usageKey: 'usage.total_tokens', // 从 res.locals.usage 提取用量
  },
  (req, res) => {
    // 你的业务逻辑
    const result = await openai.chat.completions.create(req.body);

    // 🔑 关键：设置用量到 res.locals，Kit 会自动计费
    res.locals.usage = result.usage;

    res.json(result);
  }
);
```

### 3. 分层定价

```ts
payment.post(
  '/v1/analyze',
  {
    type: 'Tiered',
    tiers: [
      { threshold: 1000, unitPricePicoUSD: '10000' }, // 前 1k tokens: 0.00001 USD/token
      { threshold: 10000, unitPricePicoUSD: '8000' }, // 1k-10k tokens: 0.000008 USD/token
      { threshold: Infinity, unitPricePicoUSD: '5000' }, // 10k+ tokens: 0.000005 USD/token
    ],
    usageKey: 'usage.total_tokens',
  },
  handler
);
```

---

## 中间件行为

### 自动路径处理

`ExpressPaymentKit` 默认对以下路径**跳过计费**：

- `/admin/*` —— 管理接口
- `/health` —— 健康检查

对于通过 Kit 注册的路由，会自动应用：

1. **DID 认证**（可选）—— 验证 `Authorization: DIDAuthV1 ...` 头
2. **支付校验** —— 解析 `X-Payment-Channel-Data`，验证 SubRAV
3. **计费计算** —— 根据定价策略计算费用
4. **使用量提取** —— 从 `res.locals.usage` 读取实际用量（适用于动态定价）

### 错误处理

- **认证失败** → 401 Unauthorized
- **支付信息无效** → 400 Bad Request
- **余额不足** → 402 Payment Required
- **内部错误** → 500 Internal Server Error

所有错误都包含详细的 `error` 和 `details` 字段。

---

## 管理功能

### 管理路由 (`adminRouter()`)

```ts
app.use(
  '/admin',
  payment.adminRouter({
    auth: (req, res, next) => {
      // 可选：添加管理员认证逻辑
      if (req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    },
  })
);
```

可用端点：

- `GET /admin/claims` —— 查看结算状态和统计
- `POST /admin/claim/:channelId` —— 手动触发特定通道的结算
- `GET /admin/subrav/:channelId/:nonce` —— 查看指定 SubRAV
- `DELETE /admin/cleanup?maxAge=30` —— 清理过期提案（默认 30 分钟）

### 恢复路由 (`recoveryRouter()`)

```ts
app.use('/payment', payment.recoveryRouter());
```

客户端数据恢复端点：

- `GET /payment/pending` —— 获取待签名的 SubRAV（需要通道认证头）
- `GET /payment/price/:assetId` —— 查询资产当前价格

---

## 高级用法

### 访问底层组件

```ts
const payeeClient = payment.getPayeeClient();

// 直接操作 PaymentChannel
const channels = await payeeClient.listChannels();
const balance = await payeeClient.getChannelBalance(channelId);

// 手动结算
await payeeClient.claimPayment(channelId);
```

### 自定义计费规则 ID

```ts
payment.post('/v1/special', '2000000000', handler, 'special-endpoint-rule');
```

为特定路由指定自定义规则 ID，便于后续管理和统计。

### 环境配置

```bash
# .env
ROOCH_NODE_URL=https://rooch.dev.node
SERVICE_PRIVATE_KEY=0x1234...
SERVICE_DID=did:rooch:0xabcd...
NODE_ENV=production
```

生产环境建议：

- 启用 DID 认证（`didAuth: true`）
- 关闭调试日志（`debug: false`）
- 使用 KMS 管理私钥

---

## 错误排查

### 常见问题

1. **"Missing X-Payment-Channel-Data header"**

   - 客户端未提供支付通道信息
   - 检查客户端是否正确集成 PaymentKit

2. **"DID authentication failed"**

   - Authorization 头格式错误或签名无效
   - 确认客户端 DID 签名逻辑

3. **"Payment processing failed"**
   - 通道余额不足或 SubRAV 格式错误
   - 检查通道状态和余额

### 调试模式

启用 `debug: true` 查看详细日志：

```bash
🔍 Payment validation for /v1/chat/completions
📊 Usage extracted: { total_tokens: 150 }
💰 Cost calculated: 3000000000 picoUSD (0.003 USD)
✅ SubRAV validated, nonce: 12345
```

### 性能监控

```ts
const stats = payment.adminRouter().getProcessingStats();
console.log('Average response time:', stats.avgResponseTime);
console.log('Success rate:', stats.successRate);
```

---

## 迁移指南

如果你之前使用 `BillableRouter` + `HttpBillingMiddleware`：

### 原有方式

```ts
// 原有方式（较复杂）
const billableRouter = new BillableRouter({ serviceId: 'test' });
const middleware = new HttpBillingMiddleware({ payeeClient, billingEngine });

billableRouter.post('/v1/chat', '1000000000', handler);

app.use('/api', (req, res, next) => {
  // 手动处理路径跳过逻辑
  if (req.path === '/health') return next();

  middleware.createExpressMiddleware()(req, res, err => {
    if (err) return res.status(500).json({ error: err.message });
    next();
  });
});

app.use('/api', billableRouter.router);
```

### 新方式

```ts
// 新方式（简化）
const payment = await createExpressPaymentKit({
  serviceId: 'test',
  signer: keyManager,
  // ... 其他配置
});

payment.post('/v1/chat', '1000000000', handler);
app.use('/api', payment.router);
```

减少了 **70%** 的样板代码！

---

## 最佳实践

1. **服务拆分** —— 为每个微服务创建独立的 PaymentKit 实例
2. **监控集成** —— 定期检查 `/admin/claims` 确保结算正常
3. **错误处理** —— 为支付失败提供友好的用户提示
4. **测试覆盖** —— 使用 Mock 客户端测试计费逻辑

---

这就是 `ExpressPaymentKit` 的完整使用指南。它将复杂的支付集成简化为三行代码，同时保留了足够的灵活性供高级用户自定义。
