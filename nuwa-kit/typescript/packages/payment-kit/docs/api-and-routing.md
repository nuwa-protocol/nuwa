# Payment Kit API & Routing Guide (v1.0)

> 本文档是 Payment Kit 服务端集成的核心指南，描述了其 API 结构、服务发现机制以及业务路由的集成方式。

---

## 1. 核心设计理念

Payment Kit 的服务端设计遵循以下原则，以实现高度的灵活性和可维护性：

1.  **框架无关 (Framework-Agnostic)**：核心业务逻辑（如计费、状态管理）与具体的 Web 框架（如 Express）解耦。通过适配器模式，可以轻松扩展至 Koa、Fastify 或其他框架。

2.  **分层架构**：代码库结构清晰，职责分离：
    *   `core/`：业务核心，包含 `BillingEngine`、`PayeeClient` 等。
    *   `api/`：内置接口的纯业务实现 (Handlers)，不依赖任何框架。
    *   `transport/`：框架适配层，负责将业务 Handlers “嫁接”到具体的框架上，如 `transport/express/`。

3.  **服务发现 (Service Discovery)**：客户端通过一个标准的 `/.well-known` 端点来自动发现 API 的基础路径 (`basePath`) 和其他关键配置，移除了硬编码的路径依赖。

4.  **统一的 API 响应**：所有内置接口都返回标准的 `ApiResponse` 结构，简化了客户端的处理逻辑和错误处理。

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

interface ApiError {
  code: string; // e.g., 'UNAUTHORIZED', 'NOT_FOUND'
  message: string;
  details?: unknown;
}
```

---

## 2. 服务发现机制

为了让客户端能够动态适配服务端配置，Payment Kit 提供了一个标准的、无需认证的“众所周知” (well-known) 端点。

| Path                             | Method | Auth | Description                               |
| -------------------------------- | ------ | ---- | ----------------------------------------- |
| `/.well-known/nuwa-payment/info` | `GET`  | ❌   | 返回服务端的公共配置，最关键的是 `basePath`。 |

#### 2.1 发现端点响应示例

```json
{
  "version": 1,
  "serviceId": "my-llm-service",
  "serviceDid": "did:rooch:0x...",
  "network": "test",
  "defaultAssetId": "0x3::gas_coin::RGas",
  "basePath": "/payment-channel"
}
```

*   **`basePath`**: 这是客户端后续所有 API 请求都需要添加的前缀。它可以是 `/payment-channel`，也可以是 `/api/billing` 等任何自定义路径。

---

## 3. 内置 API 终结点

所有内置的功能性 API 都挂载在服务发现返回的 `basePath` 之下。例如，如果 `basePath` 是 `/payment-channel`，那么健康检查的完整路径就是 `/payment-channel/health`。

| 路径 (Path)        | 方法 (Method) | 认证 (Authentication) | 描述                                                       |
| ------------------ | ------------- | --------------------- | ---------------------------------------------------------- |
| `/health`          | `GET`         | **Public**            | 健康检查端点，返回服务状态。                               |
| `/recovery`        | `GET`         | **DID Auth**          | 恢复客户端的通道状态和待处理的 `SubRAV`。                  |
| `/commit`          | `POST`        | **DID Auth**          | 提交一个已签名的 `SubRAV` 到服务端。                       |
| `/subrav`          | `GET`         | **DID Auth**          | 查询一个待处理 `SubRAV` 的详情 (用户只能查询自己的通道)。    |
| `/admin/claims`    | `GET`         | **Admin DID Auth**    | 获取当前 Claim 队列的状态和统计数据。                      |
| `/admin/claim-trigger` | `POST`    | **Admin DID Auth**    | 手动触发对某个通道的 Claim 操作。                          |
| `/admin/cleanup`   | `DELETE`      | **Admin DID Auth**    | 清理服务端存储的、已处理或过期的 `SubRAV` 提案。           |

---

## 4. 集成业务 API 与计费

除了内置 API，`ExpressPaymentKit` 的核心功能是让你能够轻松地为自己的业务 API 添加按需计费能力。

这通过 `paymentKit` 实例上的 `get`, `post` 等方法实现，它们在注册 Express 路由的同时，也定义了计费规则。

#### 4.1 使用示例

```typescript
import express from 'express';
import { createExpressPaymentKit, RouteOptions } from '@nuwa-ai/payment-kit';
// ... 其他 imports

const app = express();
app.use(express.json());

// 1. 创建 Payment Kit 实例
const paymentKit = await createExpressPaymentKit({
  serviceId: 'my-llm-service',
  basePath: '/api/billing', // 自定义基础路径
  signer: /* your signer */,
  adminDid: /* your admin DID */,
  // ... 其他配置
});

// 2. 注册你的业务路由并定义计费规则
// 这是一个需要付费的接口，价格为 0.001 USD (1e9 picoUSD)
paymentKit.post(
  '/v1/chat/completions',
  { pricing: '1000000000' }, // 价格单位为 picoUSD
  (req, res) => {
    // 你的业务逻辑...
    // 只有在支付成功后，这段代码才会被执行
    res.json({ message: 'Hello from your paid API!' });
  }
);

// 这是一个免费但需要用户登录（DID 认证）的接口
paymentKit.get(
  '/v1/user/profile',
  { pricing: '0', authRequired: true },
  (req, res) => {
    // 你的业务逻辑...
    const did = (req as any).didInfo.did; // 获取认证后的 DID
    res.json({ did, profile: { ... } });
  }
);

// 3. 将 Payment Kit 的总路由挂载到你的 Express 应用
app.use(paymentKit.router);

app.listen(3000, () => {
  console.log('🚀 Server with Payment Kit is running!');
});
```

`RouteOptions` 接口让你能精细控制每个路由的行为：
```typescript
interface RouteOptions {
  pricing: string | bigint; // 价格 (picoUSD), '0' 表示免费
  authRequired?: boolean;  // 是否需要 DID 认证 (付费接口默认 true)
  adminOnly?: boolean;     // 是否仅限管理员访问
}
```

---

## 5. 客户端集成 (`PaymentChannelHttpClient`)

客户端的集成流程被设计为高度自动化：

1.  **自动发现**：客户端在初始化时，会自动请求 `/.well-known/nuwa-payment/info` 端点。
2.  **获取 `basePath`**：客户端解析响应，获取 `basePath` 并将其缓存。
3.  **自动拼接路径**：之后，所有对内置 API（如 `recoverFromService`, `healthCheck`）的调用，都会自动将路径拼接在 `basePath` 之后。

开发者只需提供服务的基础 URL，剩下的工作由客户端库自动完成。