# PaymentChannelHttpClient

PaymentChannelHttpClient 提供了一套 **Payer 侧的 HTTP 高级封装**，让开发者无需关心 SubRAV 生成、签名、请求头格式、响应解析等细节即可完成延迟支付流程。

## 特性

- **开箱即用**：只需配置 `baseUrl` 和链配置即可发送带支付能力的 HTTP 请求
- **协议无关**：底层支付逻辑全部依赖于 `PaymentChannelPayerClient`，不绑定具体区块链
- **最小侵入**：API 与 `fetch` 保持高度一致，方便集成到现有代码中
- **自动握手与续签**：首次请求自动完成握手；后续请求根据服务器返回的 unsigned SubRAV 自动签名
- **错误处理**：对 402/409 等支付相关错误做集中处理
- **可扩展**：支持自定义 Header、错误处理和存储

## 快速开始

### 推荐方式：使用 IdentityEnv (最简单)

```typescript
import { bootstrapIdentityEnv, createHttpClient } from '@nuwa-ai/payment-kit';

// 1. 设置身份环境 (整个应用只需一次)
const env = await bootstrapIdentityEnv({
  method: 'rooch',
  vdrOptions: {
    rpcUrl: 'https://testnet.rooch.network',
    network: 'test',
  },
});

// 2. 创建支付客户端 (自动服务发现)
const client = await createHttpClient({
  baseUrl: 'https://api.llm-gateway.com',
  env,
  maxAmount: BigInt('500000000000'), // 50 cents USD
});

// 3. 开始使用！
const result = await client.get('/v1/echo?q=hello');
const response = await client.post('/v1/chat', {
  message: 'Hello, how are you?',
  model: 'gpt-3.5-turbo',
});
```

### 多服务使用

```typescript
// 一次创建多个服务的客户端
const clients = await createMultipleHttpClients(env, [
  {
    name: 'llm',
    baseUrl: 'https://api.llm-gateway.com',
    maxAmount: BigInt('500000000000'), // 50 cents
  },
  {
    name: 'storage',
    baseUrl: 'https://api.storage.com',
    maxAmount: BigInt('100000000000'), // 10 cents
  },
]);

// 使用不同的服务
await clients.llm.post('/v1/chat', { message: 'hello' });
await clients.storage.post('/v1/upload', fileData);
```

### 高级配置 (不推荐)

```typescript
import { createHttpPayerClientWithDiscovery } from '@nuwa-kit/payment-kit';

// 手动配置所有参数 (繁琐，不推荐)
const client = await createHttpPayerClientWithDiscovery({
  baseUrl: 'https://api.llm-gateway.com',
  signer: myKeyManager,
  rpcUrl: 'https://testnet.rooch.network',
  network: 'test',
  maxAmount: BigInt('500000000000'),
  debug: true,
});
```

## API 文档

### 主要工厂函数

#### `createHttpClient` (推荐)

```typescript
async function createHttpClient(
  options: CreateHttpClientOptions
): Promise<PaymentChannelHttpClient>;
```

##### CreateHttpClientOptions

| 参数           | 类型                      | 必需 | 描述                                                    |
| -------------- | ------------------------- | ---- | ------------------------------------------------------- |
| `baseUrl`      | `string`                  | ✅   | 目标服务根地址                                          |
| `env`          | `IdentityEnv`             | ✅   | 预配置的身份环境 (包含 VDR 注册表、KeyManager 和链配置) |
| `maxAmount`    | `bigint`                  | ❌   | 每次请求的最大金额 (默认: 50 cents USD)                 |
| `debug`        | `boolean`                 | ❌   | 调试模式 (默认继承自 IdentityEnv)                       |
| `onError`      | `(err: unknown) => void`  | ❌   | 自定义错误处理器                                        |
| `fetchImpl`    | `FetchLike`               | ❌   | 自定义 fetch 实现                                       |
| `mappingStore` | `HostChannelMappingStore` | ❌   | 主机到频道映射存储                                      |

#### `createMultipleHttpClients` (多服务)

```typescript
async function createMultipleHttpClients<T extends string>(
  env: IdentityEnv,
  services: Array<{ name: T; baseUrl: string; maxAmount?: bigint; debug?: boolean }>
): Promise<Record<T, PaymentChannelHttpClient>>;
```

### 高级构造函数

#### PaymentChannelHttpClient

```typescript
new PaymentChannelHttpClient(options: HttpPayerOptions)
```

##### HttpPayerOptions

| 参数             | 类型                                                 | 必需 | 描述                                                      |
| ---------------- | ---------------------------------------------------- | ---- | --------------------------------------------------------- |
| `baseUrl`        | `string`                                             | ✅   | 目标服务根地址                                            |
| `chainConfig`    | `ChainConfig`                                        | ✅   | 区块链配置（链设置）                                      |
| `signer`         | `SignerInterface`                                    | ✅   | 支付通道操作和 DID 认证的签名器                           |
| `keyId`          | `string`                                             | ❌   | 签名操作的密钥ID（可选，不指定时使用第一个可用密钥）      |
| `storageOptions` | `PaymentChannelPayerClientOptions['storageOptions']` | ❌   | 支付通道数据存储选项                                      |
| `channelId`      | `string`                                             | ❌   | 指定通道ID，为空时自动创建                                |
| `payerDid`       | `string`                                             | ❌   | 用于生成 Authorization 头的 DID（不提供时从 signer 获取） |
| `maxAmount`      | `bigint`                                             | ❌   | 每次请求接受的最大费用                                    |
| `debug`          | `boolean`                                            | ❌   | 是否打印调试日志                                          |
| `onError`        | `(err: unknown) => void`                             | ❌   | 自定义错误处理函数                                        |
| `mappingStore`   | `HostChannelMappingStore`                            | ❌   | Host 与 channelId 映射存储                                |
| `fetchImpl`      | `FetchLike`                                          | ❌   | 自定义 fetch 实现                                         |

### 主要方法

#### HTTP 动词方法

```typescript
// 发送原始 HTTP 请求
async request(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  init?: RequestInit
): Promise<Response>

// 便捷方法（自动解析 JSON）
async get<T>(path: string, init?: RequestInit): Promise<T>
async post<T>(path: string, body?: any, init?: RequestInit): Promise<T>
async put<T>(path: string, body?: any, init?: RequestInit): Promise<T>
async patch<T>(path: string, body?: any, init?: RequestInit): Promise<T>
async delete<T>(path: string, init?: RequestInit): Promise<T>
```

#### 状态管理

```typescript
// 获取当前缓存的 pending SubRAV
getPendingSubRAV(): SubRAV | null

// 清理 pending SubRAV 缓存
clearPendingSubRAV(): void

// 获取当前通道ID
getChannelId(): string | undefined
```

## 工作流程

### 1. 通道管理

- 首次使用时，自动查询 `mappingStore` 寻找已有通道
- 如果没有或通道已关闭，自动创建新通道
- 通道与 host 的映射关系持久化存储

### 2. 请求流程

1. **准备 Header**：
   - 添加 DIDAuth 认证头（如果配置了 `payerDid` 和 `keyManager`）
   - 添加支付通道数据头

2. **生成支付数据**：
   - 首次请求：创建握手 SubRAV（nonce=0, amount=0）
   - 后续请求：签名服务器提供的 unsigned SubRAV

3. **发送请求**并处理响应：
   - 提取响应中的新 unsigned SubRAV 并缓存
   - 处理 402（支付不足）和 409（SubRAV 冲突）错误

### 3. 状态机

```
INIT → OPENING → HANDSHAKE → READY
   ↑                ↑           ↓
   └────── 409 错误回退 ────────┘
```

## 存储选项

### 默认存储

- **浏览器环境**：`LocalStorageHostChannelMappingStore`
- **Node.js 环境**：`MemoryHostChannelMappingStore`

### 自定义存储

```typescript
import { LocalStorageHostChannelMappingStore } from '@nuwa-kit/payment-kit';

const customStore = new LocalStorageHostChannelMappingStore();

const client = new PaymentChannelHttpClient({
  // ... 其他配置
  mappingStore: customStore,
});
```

## 错误处理

### 支付相关错误

- **HTTP 402**：余额不足或提案无效 → 清理缓存并重试
- **HTTP 409**：SubRAV 冲突 → 重新握手

### 自定义错误处理

```typescript
const client = new PaymentChannelHttpClient({
  // ... 其他配置
  onError: error => {
    console.error('Payment error:', error);
    // 集成错误跟踪服务
    errorTracking.report(error);
  },
});
```

## 高级用法

### 自定义 Fetch

```typescript
const client = new PaymentChannelHttpClient({
  // ... 其他配置
  fetchImpl: async (input, init) => {
    // 添加自定义逻辑
    console.log('Making request to:', input);

    // 可以添加重试、超时等逻辑
    return fetch(input, init);
  },
});
```

### 监控支付状态

```typescript
// 检查待处理的 SubRAV
const pending = client.getPendingSubRAV();
if (pending) {
  console.log('Next payment will be:', {
    nonce: pending.nonce.toString(),
    amount: pending.accumulatedAmount.toString(),
  });
}

// 获取当前通道信息
const channelId = client.getChannelId();
if (channelId) {
  console.log('Using payment channel:', channelId);
}
```

### 服务发现和恢复功能

```typescript
// 手动发现服务信息
const serviceInfo = await client.discoverService();
console.log('Service DID:', serviceInfo.serviceDid);
console.log('Default asset:', serviceInfo.defaultAssetId);

// 获取资产价格
const priceInfo = await client.getAssetPrice('0x3::gas_coin::RGas');
console.log('Current price:', priceInfo.priceUSD, 'USD');

// 从服务恢复频道状态和待处理的 SubRAV
const recoveryData = await client.recoverFromService();
if (recoveryData.channel) {
  console.log('Recovered channel:', recoveryData.channel.channelId);
}
if (recoveryData.pendingSubRav) {
  console.log('Recovered pending SubRAV:', recoveryData.pendingSubRav.nonce);
}

// 手动提交已签名的 SubRAV
const signedSubRAV = /* 获取已签名的 SubRAV */;
const result = await client.commitSubRAV(signedSubRAV);
console.log('SubRAV committed:', result.success);
```

## 最佳实践

1. **使用 IdentityEnv 方式**：推荐使用 `createHttpClient` 配合 `bootstrapIdentityEnv`，最简单且功能完整
2. **一次设置，处处使用**：在应用启动时配置一次 `IdentityEnv`，然后在各处复用
3. **合理设置 `maxAmount`**：根据服务类型设置合适的金额上限，防止意外消费
4. **多服务统一管理**：使用 `createMultipleHttpClients` 统一管理多个付费服务
5. **启用调试模式**：开发时在 `bootstrapIdentityEnv` 中启用 debug，无需到处配置
6. **错误处理**：使用 try-catch 包装请求，处理网络和支付错误
7. **复用客户端实例**：避免重复创建，每个服务创建一次即可
8. **利用恢复功能**：应用重启后自动恢复频道状态，无需手动处理

## 与现有组件的关系

| 角色           | 组件                         | 说明                   |
| -------------- | ---------------------------- | ---------------------- |
| Payer 业务代码 | **PaymentChannelHttpClient** | HTTP 交互与支付头封装  |
| Payer 支付逻辑 | `PaymentChannelPayerClient`  | 链无关支付操作         |
| Payee 服务端   | `ExpressPaymentKit`          | 服务端中间件与恢复路由 |
