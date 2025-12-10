# @nuwa-ai/payment-kit

> SDK for NIP-4 Unidirectional Payment Channels on Rooch and other ledgers

基于《NIP-4 Unidirectional Payment Channel Core》规范以及 Rooch 链上支付通道合约的 TypeScript/JavaScript SDK。

[English](./README.md)|[中文]

## ✨ 功能特性

- **NIP-4 兼容**: 完整实现 SubRAV (Sub-channel Receipt And Voucher) 协议
- **版本化协议**: 支持 SubRAV 版本控制，确保向后兼容性和协议演进
- **BCS 序列化**: 使用 Rooch 原生 BCS 序列化，确保与链上合约的完全兼容
- **多设备支持**: 支持单一通道内的多个子通道，每个绑定不同的验证方法
- **链兼容**: 抽象化设计，当前支持 Rooch，未来可扩展到其他区块链
- **HTTP 客户端**: 提供 `PaymentChannelHttpClient`，自动处理 `X-Payment-Channel-Data` 协议头、通道建立与支付跟踪
- **API 服务端集成**: 提供 `ExpressPaymentKit`，一行挂载支付能力与计费规则（内置按请求/按用量策略、自动结算与管理端点）
- **MCP 集成**: 提供 `McpPaymentKit` 与 `PaymentChannelMcpClient`，为 MCP 工具提供支付通道能力
- **类型安全**: 100% TypeScript 实现，提供完整的类型定义

### 流式输出支持（SSE/NDJSON）

Payment Kit 支持流式端点（SSE、NDJSON）的“带内支付帧（In-band Payment Frame）”，并在客户端自动过滤支付帧。

- 服务端（ExpressPaymentKit）
  - 识别：根据请求提示判断（body.stream=true、query.stream=true、或路径包含":stream"）。
  - 结算：对 post-flight 策略（如 FinalCost/PerToken），在响应结束时计算费用并结算。
  - 帧注入：仅注入编码后的 Header 值，确保与响应头完全一致：
    - SSE: `data: { "nuwa_payment_header": "<X-Payment-Channel-Data>" }`\n\n
    - NDJSON: `{ "__nuwa_payment_header__": "<X-Payment-Channel-Data>" }`\n
  - 响应头：若仍可写头，会同时发送标准 `X-Payment-Channel-Data`。

- 客户端（PaymentChannelHttpClient）
  - 识别：仅依据 Content-Type（SSE `text/event-stream`、NDJSON `application/x-ndjson`）。
  - 响应包装：对流式响应进行包装过滤：
    - 提取 `nuwa_payment_header`/`__nuwa_payment_header__` 并通过相同的 `HttpPaymentCodec` 解码
    - 将这些控制帧从流中移除，只向上层透出业务数据
  - 无需 tee：只有包装层读取原始流，避免与应用层竞争导致的挂起。
  - 恢复：若本次流未收到支付帧，下次请求会按正常恢复流程获取最新 SubRAV。

说明

- 应用代码按常规读取响应体，不会看到支付帧，只会看到业务数据。
- 非流式端点行为不变（仍使用响应头）。

## 📦 安装

```bash
npm install @nuwa-ai/payment-kit @nuwa-ai/identity-kit @roochnetwork/rooch-sdk
```

## 🚀 快速开始

### 客户端集成（HTTP）

> 推荐方式：使用 `PaymentChannelHttpClient` 或工厂方法 `createHttpClient` 进行 HTTP 集成，自动完成通道初始化、签名、头注入与支付解析。

```typescript
import { IdentityKit } from '@nuwa-ai/identity-kit';
import { createHttpClient } from '@nuwa-ai/payment-kit';

// 1) 初始化身份环境（Rooch 网络和 rpcUrl）
const env = await IdentityKit.bootstrap({
  method: 'rooch',
  vdrOptions: { rpcUrl: 'https://test-seed.rooch.network', network: 'test' },
});

// 2) 创建 HTTP 客户端（自动管理通道与支付）
const http = await createHttpClient({
  baseUrl: 'http://localhost:3003',
  env,
  maxAmount: BigInt('10000000000'), // 每次请求的最大可接受金额（资产最小单位）
  debug: true,
});

// 3) 发起带支付的请求（自动注入/解析 X-Payment-Channel-Data）
const { data, payment } = await http.get('/echo?message=hello');
console.log('Echo:', data);
console.log('Payment cost (asset units):', payment?.cost.toString());
```

也可直接用底层类自定义初始化：

```typescript
import { PaymentChannelHttpClient } from '@nuwa-ai/payment-kit';

const client = new PaymentChannelHttpClient({
  baseUrl: 'http://localhost:3003',
  chainConfig: { chain: 'rooch', network: 'test', rpcUrl: 'https://test-seed.rooch.network' },
  signer, // 兼容 IdentityKit 的 SignerInterface
  keyId, // 建议显式指定
  payerDid, // 可选，默认从 signer.getDid() 推导
  defaultAssetId: '0x3::gas_coin::RGas',
  maxAmount: BigInt('10000000000'),
  debug: true,
});

const result = await client.post('/process', { text: 'hello world' });
console.log(result.data, result.payment);
```

### API 服务端集成（Express）

> 推荐方式：使用 `createExpressPaymentKit` / `createExpressPaymentKitFromEnv` 快速为现有 Express 服务接入支付与计费。你只需声明路由与定价策略，其余由框架自动完成（验证、计费、回写响应头、持久化与自动提取）。

```typescript
import express from 'express';
import { IdentityKit } from '@nuwa-ai/identity-kit';
import { createExpressPaymentKitFromEnv } from '@nuwa-ai/payment-kit';

// 1) 启动 Identity 环境
const env = await IdentityKit.bootstrap({
  method: 'rooch',
  vdrOptions: { rpcUrl: 'https://test-seed.rooch.network', network: 'test' },
});

// 2) 创建并配置 Payment Kit（默认价格、资产、管理员 DID 等）
const billing = await createExpressPaymentKitFromEnv(env, {
  serviceId: 'payment-example',
  defaultAssetId: '0x3::gas_coin::RGas',
  defaultPricePicoUSD: '1000000000', // 0.001 USD 默认价
  adminDid: 'did:rooch:...',
  debug: true,
});

// 3) 声明业务路由与定价策略（按请求）
billing.get('/echo', { pricing: '2000000000' }, (req, res) => {
  res.json({ echo: req.query.message || 'Hello, World!', timestamp: new Date().toISOString() });
});

// 4) 按用量（Token）后计费：在处理后把 usage 写入 res.locals
billing.post(
  '/chat/completions',
  { pricing: { type: 'PerToken', unitPricePicoUSD: '50000000' } },
  (req, res) => {
    const { messages = [], max_tokens = 100 } = req.body || {};
    const prompt = messages.map((m: any) => m.content).join(' ');
    const prompt_tokens = Math.ceil(prompt.length / 4);
    const completion_tokens = Math.min(max_tokens, 50);
    const total_tokens = prompt_tokens + completion_tokens;
    (res as any).locals.usage = total_tokens; // 供策略计算
    res.json({
      choices: [{ message: { role: 'assistant', content: 'mock response' } }],
      usage: { prompt_tokens, completion_tokens, total_tokens },
    });
  }
);

// 5) 挂载路由，包含支付通道管理端点与业务路由
const app = express();
app.use(express.json());
app.use(billing.router);
app.listen(3000);
```

#### 服务端密钥配置（SERVICE_KEY）

服务端需要可签名的私钥用于 DID 身份与链上操作。推荐通过环境变量注入，并在进程启动时导入：

```bash
# 建议以多环境方式配置（.env / 部署平台变量）
export SERVICE_KEY="<your-service-private-key>"
```

```typescript
import { IdentityKit } from '@nuwa-ai/identity-kit';

const env = await IdentityKit.bootstrap({
  method: 'rooch',
  vdrOptions: { rpcUrl: 'https://test-seed.rooch.network', network: 'test' },
});

const serviceKey = process.env.SERVICE_KEY;
if (!serviceKey) throw new Error('SERVICE_KEY is required');

// 导入服务端私钥（与部署环境一致的字符串格式）
const imported = await env.keyManager.importKeyFromString(serviceKey);
const serviceDid = await env.keyManager.getDid();

// 然后创建 ExpressPaymentKit（示例见上文）
```

说明：`SERVICE_KEY` 的具体字符串格式需与 `IdentityKit` 的 `importKeyFromString` 一致（例如经 CADOP 管理的密钥或本地生成的 Ed25519 私钥编码）。

获取 SERVICE_KEY 的推荐方式：

- 访问 CADOP 测试站点：[CADOP Test ID](https://test-id.nuwa.dev/)
- 在 DID 配置中选择 “Add Authentication Method”
- 选择密钥类型（建议 Ed25519），生成后妥善保存私钥字符串（与 `importKeyFromString` 兼容）
- 将该私钥字符串配置到部署环境的 `SERVICE_KEY` 环境变量中

你也可以参考示例中的深链授权流程（见 `../../examples/payment-kit-integration/src/client-cli.ts` 的 `connectToCadop`），了解密钥与 DID 的关联与获取方式。

管理端（Admin）与发现（Discovery）相关端点（由框架自动提供）：

- `/.well-known/nuwa-payment/info` 服务信息与发现
- `/payment-channel/health` 健康检查
- `/payment-channel/admin/claims` 索赔调度状态与触发

客户端可配合 `PaymentChannelAdminClient` 调用：

```typescript
import { PaymentChannelAdminClient } from '@nuwa-ai/payment-kit';

const admin = new PaymentChannelAdminClient(httpClient);
await admin.getClaimsStatus();
await admin.triggerClaim({ channelId: '0x...' });
```

## 🛠️ API 参考

### 核心类型

```typescript
interface SubRAV {
  version: number; // Protocol version (default: 1)
  chainId: bigint;
  channelId: string; // 32-byte hex string
  channelEpoch: bigint;
  vmIdFragment: string; // DID verification method fragment
  accumulatedAmount: bigint;
  nonce: bigint;
}

interface SignedSubRAV {
  subRav: SubRAV;
  signature: Uint8Array;
}
```

### HTTP 客户端与服务端要点

- **`PaymentChannelHttpClient`**：HTTP 侧自动完成签名、头注入、支付跟踪、通道状态缓存与恢复。
- **`ExpressPaymentKit`**：按路由声明计费规则（`PerRequest`/`PerToken`/`FinalCost`），自动生成并返回下一张 SubRAV 提案，失败时返回协议错误头。
- **`PaymentChannelAdminClient`**：调用服务端管理端点（查询/触发 claim、SubRAV 查询等）。

### SubRAVSigner

```typescript
class SubRAVSigner {
  static async sign(subRav: SubRAV, signer: SignerInterface, keyId: string): Promise<SignedSubRAV>;

  static async verify(signedSubRAV: SignedSubRAV, resolver: DIDResolver): Promise<boolean>;
}
```

### MCP（Model Context Protocol）集成

Payment Kit 为 MCP 场景提供完整的支付通道支持，便于 AI Agent 在调用 MCP 工具时进行计费与结算。

#### MCP 服务端

```typescript
import { createFastMcpServer } from '@nuwa-ai/payment-kit/mcp';

// 1) 创建 MCP 服务
const app = await createFastMcpServer({
  serviceId: 'my-ai-service',
  port: 8080,
  debug: true,
});

// 2) 逐个注册工具（FREE / 付费）
app.freeTool({
  name: 'hello',
  description: '打招呼',
  parameters: { type: 'object', properties: { name: { type: 'string' } } },
  execute: async ({ name }) => ({ message: `Hello, ${name || 'World'}!` }),
});

app.paidTool({
  name: 'analyze',
  description: '数据分析（付费）',
  pricePicoUSD: 1_000_000_000n, // 0.001 USD
  parameters: { type: 'object', properties: { data: { type: 'string' } } },
  execute: async ({ data }) => ({ analysis: `Analysis of "${data}"` }),
});

// 3) 启动服务
await app.start();
```

#### MCP 客户端

```typescript
import { PaymentChannelMcpClient } from '@nuwa-ai/payment-kit/mcp';
import { createTestSigner } from '@nuwa-ai/identity-kit/testHelpers';

const signer = await createTestSigner();
const client = new PaymentChannelMcpClient({
  baseUrl: 'http://localhost:8080/mcp',
  signer,
});

// 付费调用示例
const result = await client.call('analyze', { data: '待分析文本' });
console.log('响应:', result.data);
console.log('支付信息:', result.payment);

// 内置 FREE 工具
const health = await client.healthCheck();
const recovery = await client.recoverFromService();

// 提交待签 SubRAV（如有）
const pendingSubRAV = client.getPendingSubRAV();
if (pendingSubRAV) {
  const signedSubRAV = await client.getPayerClient().signSubRAV(pendingSubRAV);
  await client.commitSubRAV(signedSubRAV);
}
```

#### MCP 支付内容格式（服务端响应）

- 业务结果作为常规 MCP `content` 返回（例如 `type: "text"`，或你的工具原生支持的其他类型）。
- 支付信息以独立的资源内容项追加：

```json
{
  "type": "resource",
  "resource": {
    "uri": "nuwa:payment",
    "mimeType": "application/vnd.nuwa.payment+json",
    "text": "{\"version\":1,\"clientTxRef\":\"...\",\"serviceTxRef\":\"...\",\"subRav\":{...},\"cost\":\"...\",\"costUsd\":\"...\"}"
  }
}
```

- `resource.text` 中的 JSON 遵循 `SerializableResponsePayload`（所有 BigInt 使用字符串）。
- 提供辅助方法：
  - 服务端：`HttpPaymentCodec.buildMcpPaymentResource(payload)`
  - 客户端：`HttpPaymentCodec.parseMcpPaymentFromContents(contents)`

#### MCP 工具参数：保留键合并与严格校验

- 每个工具参数的 schema 会合并保留键：
  - `__nuwa_auth`（字符串；由 IdentityKit 生成的 DIDAuthV1 授权头）
  - `__nuwa_payment`（对象；`SerializableRequestPayload` 形状的序列化请求负载）
- 注册器通过 `buildParametersSchema(userSchema, { mergeReserved: true })` 与 `compileStandardSchema(...)`（Ajv + formats）编译，确保在 FastMCP 边界进行严格校验。

客户端每次调用最小的 `__nuwa_payment` 结构：

```json
{
  "version": 1,
  "clientTxRef": "<uuid>",
  "maxAmount": "<string-amount>?",
  "signedSubRav": { "subRav": { ... }, "signature": "..." }?
}
```

服务端校验并结算后，在响应中追加上述支付资源项。

### SubRAV BCS 序列化

```typescript
import { SubRAVCodec, SubRAVUtils } from '@nuwa-ai/payment-kit';

// 创建 SubRAV (自动使用当前版本)
const subRav = SubRAVUtils.create({
  chainId: BigInt(4),
  channelId: '0x1234...',
  channelEpoch: BigInt(0),
  vmIdFragment: 'device-key',
  accumulatedAmount: BigInt(1000),
  nonce: BigInt(1),
});

// BCS 序列化
const encoded = SubRAVCodec.encode(subRav);
const hex = SubRAVCodec.toHex(subRav);

// 反序列化
const decoded = SubRAVCodec.decode(encoded);
const fromHex = SubRAVCodec.fromHex(hex);
```

## 🔧 开发

### 构建

```bash
cd nuwa-kit/typescript/packages/payment-kit
pnpm build
```

### 测试

```bash
# 单元测试
pnpm test
```

## 📄 设计文档

详细的设计文档请参考：[DESIGN.md](./DESIGN.md)

### 📚 示例参考

- HTTP 集成示例：`nuwa-kit/typescript/examples/payment-kit-integration`
  - 客户端 CLI：`src/client-cli.ts`（演示 `PaymentChannelHttpClient`、`PaymentChannelAdminClient` 的用法）
  - 服务端示例：`src/server.ts`（演示 `createExpressPaymentKitFromEnv` 与多种计费策略）

- MCP 集成示例：`nuwa-kit/typescript/packages/payment-kit/examples`
  - MCP Server：`mcp-server.ts`（演示使用 `createFastMcpServer` 逐个注册 FREE/付费工具）
  - MCP Client：`mcp-client.ts`（演示 `PaymentChannelMcpClient` 的用法与支付流程）

## 📄 许可证

Apache-2.0
