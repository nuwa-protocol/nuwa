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

```typescript
import { PaymentChannelHttpClient } from '@nuwa-kit/payment-kit';

const httpPayer = new PaymentChannelHttpClient({
  baseUrl: 'https://api.llm-gateway.com',
  chainConfig: { 
    chain: 'rooch', 
    rpcUrl: 'http://localhost:6767', 
    network: 'local' 
  },
  signer: myKeyManager,
  keyId: `${myDid}#key1`,
  payerDid: myDid, // Optional: will be derived from signer if not provided
  maxAmount: BigInt('50000000000'), // 0.5 USD
  debug: true,
});

// 简单的 GET 请求
const result = await httpPayer.get('/v1/echo?q=hello');

// POST 请求
const response = await httpPayer.post('/v1/chat', {
  message: 'Hello, how are you?',
  model: 'gpt-3.5-turbo'
});
```

## API 文档

### 构造函数

```typescript
new PaymentChannelHttpClient(options: HttpPayerOptions)
```

#### HttpPayerOptions

| 参数 | 类型 | 必需 | 描述 |
|-----|------|------|------|
| `baseUrl` | `string` | ✅ | 目标服务根地址 |
| `chainConfig` | `ChainConfig` | ✅ | 区块链配置（链设置） |
| `signer` | `SignerInterface` | ✅ | 支付通道操作和 DID 认证的签名器 |
| `keyId` | `string` | ❌ | 签名操作的密钥ID（可选，不指定时使用第一个可用密钥） |
| `storageOptions` | `PaymentChannelPayerClientOptions['storageOptions']` | ❌ | 支付通道数据存储选项 |
| `channelId` | `string` | ❌ | 指定通道ID，为空时自动创建 |
| `payerDid` | `string` | ❌ | 用于生成 Authorization 头的 DID（不提供时从 signer 获取） |
| `maxAmount` | `bigint` | ❌ | 每次请求接受的最大费用 |
| `debug` | `boolean` | ❌ | 是否打印调试日志 |
| `onError` | `(err: unknown) => void` | ❌ | 自定义错误处理函数 |
| `mappingStore` | `HostChannelMappingStore` | ❌ | Host 与 channelId 映射存储 |
| `fetchImpl` | `FetchLike` | ❌ | 自定义 fetch 实现 |

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
  mappingStore: customStore
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
  onError: (error) => {
    console.error('Payment error:', error);
    // 集成错误跟踪服务
    errorTracking.report(error);
  }
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
  }
});
```

### 监控支付状态

```typescript
// 检查待处理的 SubRAV
const pending = client.getPendingSubRAV();
if (pending) {
  console.log('Next payment will be:', {
    nonce: pending.nonce.toString(),
    amount: pending.accumulatedAmount.toString()
  });
}

// 获取当前通道信息
const channelId = client.getChannelId();
if (channelId) {
  console.log('Using payment channel:', channelId);
}
```

## 最佳实践

1. **配置合理的 `maxAmount`**：防止意外的高额支付
2. **启用 debug 模式**：开发时便于排查问题
3. **处理网络错误**：使用 try-catch 包装请求
4. **复用客户端实例**：避免重复创建通道
5. **监控支付状态**：定期检查 pending SubRAV

## 与现有组件的关系

| 角色 | 组件 | 说明 |
|------|------|------|
| Payer 业务代码 | **PaymentChannelHttpClient** | HTTP 交互与支付头封装 |
| Payer 支付逻辑 | `PaymentChannelPayerClient` | 链无关支付操作 |
| Payee 服务端 | `ExpressPaymentKit` | 服务端中间件与恢复路由 |