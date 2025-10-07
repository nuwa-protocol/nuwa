# Universal MCP Client

Universal MCP Client 是一个智能的 MCP 客户端，能够自动检测服务器类型并适配不同的调用方式。它完全兼容现有的 `PaymentChannelMcpClient` API，同时支持标准的 MCP 服务器。

## 特性

- 🔍 **自动检测**: 通过 `/.well-known/nuwa-payment/info` 端点自动检测服务器类型
- 🔄 **无缝切换**: 根据服务器能力自动选择合适的客户端实现
- 📦 **完全兼容**: 与现有 `PaymentChannelMcpClient` API 100% 兼容
- 🚀 **零迁移成本**: 现有代码无需修改即可使用
- 🛡️ **类型安全**: 完整的 TypeScript 类型支持

## 快速开始

### 基本用法（推荐）

```typescript
import { bootstrapIdentityEnv, createMcpClient } from '@nuwa-ai/payment-kit';

// 1. 设置身份环境（每个应用一次）
const env = await bootstrapIdentityEnv({
  method: 'rooch',
  vdrOptions: { rpcUrl: 'https://testnet.rooch.network', network: 'test' },
});

// 2. 创建通用 MCP 客户端（自动检测）
const client = await createMcpClient({
  baseUrl: 'http://localhost:8080/mcp',
  env,
  maxAmount: BigInt('500000000000'), // 50 cents USD
});

// 3. 使用！API 与 PaymentChannelMcpClient 完全相同
const result = await client.call('some_tool', { param: 'value' });

// 4. 检查检测到的服务器类型
console.log('Server type:', client.getServerType()); // 'payment' | 'standard'
console.log('Supports payment:', client.supportsPayment());
```

### 强制指定模式

```typescript
// 强制使用支付模式（跳过检测）
const paymentClient = await createMcpClient({
  baseUrl: 'http://payment-server:8080/mcp',
  env,
  forceMode: 'payment',
});

// 强制使用标准模式（跳过检测）
const standardClient = await createMcpClient({
  baseUrl: 'http://standard-server:8080/mcp',
  env,
  forceMode: 'standard',
});
```

## API 参考

### 创建客户端

#### `createMcpClient(options)`

创建通用 MCP 客户端，自动检测服务器类型。

**参数:**

- `baseUrl: string` - MCP 服务器端点
- `env: IdentityEnv` - 预配置的身份环境
- `maxAmount?: bigint` - 每次请求的最大金额（默认：50 cents USD）
- `forceMode?: 'auto' | 'payment' | 'standard'` - 强制指定模式（默认：'auto'）
- `detectionTimeout?: number` - 检测超时时间（默认：5000ms）
- `enableFallback?: boolean` - 启用降级机制（默认：true）

**返回:** `Promise<UniversalMcpClient>`

### 核心方法

所有方法与 `PaymentChannelMcpClient` 完全兼容：

#### 工具调用

```typescript
// 调用工具（支持支付）
const result = await client.call('tool_name', { param: 'value' });

// 调用工具（返回原始内容）
const { content } = await client.callTool('tool_name', { param: 'value' });

// 获取 AI SDK 兼容的工具集
const tools = await client.tools();
```

#### 资源和提示

```typescript
// 列出工具
const tools = await client.listTools();

// 列出提示
const prompts = await client.listPrompts();

// 加载提示
const prompt = await client.loadPrompt('prompt_name', { arg: 'value' });

// 列出资源
const resources = await client.listResources();

// 读取资源
const resource = await client.readResource('resource://example');
```

### 新增方法

#### 服务器信息

```typescript
// 获取服务器类型
const type = client.getServerType(); // 'payment' | 'standard' | 'unknown'

// 获取增强的服务器能力
const capabilities = client.getCapabilities();

// 获取标准 MCP 能力（不包含 Nuwa 扩展）
const standardCaps = client.getStandardCapabilities();

// 检查支持的功能
const supportsPayment = client.supportsPayment();
const supportsAuth = client.supportsAuth();
const hasBuiltinTools = client.hasBuiltinTools();
```

#### 高级操作

```typescript
// 获取检测结果（包含时间戳）
const detection = client.getDetectionResult();

// 强制重新检测
const newDetection = await client.redetect();

// 清理资源
await client.close();
```

## 服务器检测机制

### 检测流程

1. **Well-known 端点检测**: 尝试访问 `/.well-known/nuwa-payment/info`
2. **MCP 能力获取**: 连接 MCP 服务器获取标准能力信息
3. **结果合并**: 结合两种信息确定服务器类型和能力

### 支付协议检测

如果 `/.well-known/nuwa-payment/info` 端点返回有效的支付信息：

```json
{
  "serviceId": "my-service",
  "serviceDid": "did:example:123",
  "defaultAssetId": "0x3::gas_coin::RGas",
  "supportedFeatures": ["payment", "auth"],
  "basePath": "/payment-channel"
}
```

则服务器被识别为支付协议服务器。

### 能力信息结构

```typescript
interface EnhancedServerCapabilities {
  // 标准 MCP 能力
  tools?: { listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };

  // Nuwa 扩展
  nuwa?: {
    payment?: {
      supported: boolean;
      serviceId?: string;
      serviceDid?: string;
      defaultAssetId?: string;
    };
    auth?: {
      supported: boolean;
      methods?: string[];
    };
    builtinTools?: {
      supported: boolean;
      tools?: string[];
    };
  };
}
```

## 向后兼容性

### 现有代码迁移

现有使用 `PaymentChannelMcpClient` 的代码无需修改：

```typescript
// 旧代码 - 仍然有效
import { createMcpClient } from '@nuwa-ai/payment-kit';

const client = await createMcpClient({ baseUrl, env });
const result = await client.call('tool', {});
```

### 类型兼容性

```typescript
// 类型别名提供向后兼容
import type { PaymentChannelMcpClientType } from '@nuwa-ai/payment-kit';

// 等同于 UniversalMcpClient
const client: PaymentChannelMcpClientType = await createMcpClient(options);
```

## 错误处理

```typescript
try {
  const result = await client.call('tool_name', params);
} catch (error) {
  if (error.code === 'PAYMENT_REQUIRED') {
    // 处理支付错误
  } else if (error.code === 'TOOL_NOT_FOUND') {
    // 处理工具未找到错误
  }
}
```

## 最佳实践

1. **使用自动检测**: 除非有特殊需求，建议使用默认的自动检测模式
2. **缓存客户端实例**: 客户端初始化有一定开销，建议复用实例
3. **适当的超时设置**: 根据网络环境调整 `detectionTimeout`
4. **错误处理**: 始终包含适当的错误处理逻辑
5. **资源清理**: 应用退出时调用 `client.close()` 清理资源

## 故障排除

### 检测失败

如果自动检测失败，客户端会默认使用标准 MCP 模式。可以通过日志查看详细信息：

```typescript
const client = await createMcpClient({
  baseUrl,
  env,
  debug: true, // 启用调试日志
});
```

### 强制模式

如果自动检测不准确，可以强制指定模式：

```typescript
const client = await createMcpClient({
  baseUrl,
  env,
  forceMode: 'payment', // 或 'standard'
});
```
