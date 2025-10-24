# Provider 测试工具重构

## 问题分析

原有的 `providerTestUtils.ts` 试图提供统一的测试方法，但存在以下问题：

1. **强制统一导致复杂性**：不同 provider 有不同的 API 规范和参数要求
2. **参数传递冗余**：需要额外的参数传递和标准化逻辑
3. **代码重复**：每个 provider 都需要删除参数和标准化请求的代码
4. **维护困难**：修改一个 provider 的逻辑可能影响其他 provider

## 重构方案

### 1. 基础抽象层

创建 `BaseProviderTestUtils` 提供通用功能：

- 测试环境管理
- 响应验证
- 使用量和成本提取
- 通用工具方法

### 2. Provider 专门化

为每个 provider 创建专门的测试工具类：

#### OpenAI (`OpenAITestUtils`)

- `createChatCompletionRequest()` - 标准 Chat Completions 请求
- `createResponseAPIRequest()` - Response API 专门请求
- `createChatCompletionWithToolsRequest()` - 带工具的请求
- `testChatCompletion()` - Chat Completions 测试
- `testResponseAPI()` - Response API 测试
- `testStreamingChatCompletion()` - 流式测试

#### OpenRouter (`OpenRouterTestUtils`)

- `createChatCompletionRequest()` - 标准请求（使用 openai/gpt-3.5-turbo 格式）
- `createChatCompletionWithRoutingRequest()` - 带路由偏好的请求
- `testChatCompletionWithRouting()` - 路由测试
- `getCommonModels()` - 常用模型列表
- `createMultiProviderTestRequest()` - 多 provider 测试

#### LiteLLM (`LiteLLMTestUtils`)

- `createChatCompletionRequest()` - 标准请求
- `createChatCompletionWithMetadataRequest()` - 带元数据的请求
- `testChatCompletionWithMetadata()` - 元数据测试
- `testHealth()` - 健康检查测试
- `getCommonModels()` - 支持的模型列表

## 优势

### 1. 类型安全

每个 provider 有自己的配置接口：

```typescript
// OpenAI 专门配置
interface OpenAIChatCompletionConfig {
  model: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Array<{ type: 'function'; function: {...} }>;
}

// OpenRouter 专门配置
interface OpenRouterChatCompletionConfig {
  model: string; // 使用 "openai/gpt-3.5-turbo" 格式
  route?: 'fallback';
  provider?: { order?: string[]; allow_fallbacks?: boolean; };
}
```

### 2. API 规范匹配

每个工具类完全匹配对应 provider 的 API 规范：

```typescript
// OpenAI Response API - 使用正确的参数名
OpenAITestUtils.createResponseAPIRequest({
  input: "Hello world",           // 不是 messages
  max_output_tokens: 100,         // 不是 max_tokens
  tools: [{ type: 'function', name: 'get_weather', ... }] // 扁平结构
});

// OpenRouter - 使用正确的模型名格式
OpenRouterTestUtils.createChatCompletionRequest({
  model: "openai/gpt-3.5-turbo",  // provider/model 格式
  route: "fallback",              // OpenRouter 特有参数
});
```

### 3. 简化的测试代码

```typescript
// 之前：需要通用配置和复杂的参数处理
const config = ProviderTestUtils.getProviderTestConfig('openai');
const result = await ProviderTestUtils.testProviderChatCompletion(
  provider,
  apiKey,
  config
);

// 现在：直接使用专门的方法
const result = await OpenAITestUtils.testChatCompletion(provider, apiKey, {
  model: 'gpt-3.5-turbo',
});
```

### 4. 减少 Provider 复杂性

Provider 实现不再需要复杂的参数删除和标准化逻辑：

```typescript
// 之前：OpenAI provider 需要处理各种不兼容的参数
prepareRequestData(data: any, isStream: boolean) {
  // 大量的参数删除和转换逻辑
  if (prepared.stream_options && !isStream) delete prepared.stream_options;
  if (prepared.messages && isResponseAPI) delete prepared.messages;
  // ... 更多复杂逻辑
}

// 现在：测试工具直接创建正确格式的请求
OpenAITestUtils.createResponseAPIRequest() // 直接创建正确格式
OpenAITestUtils.createChatCompletionRequest() // 直接创建正确格式
```

## 迁移指南

### 更新现有测试

```typescript
// 旧方式
import { ProviderTestUtils } from '../utils/providerTestUtils.js';
const config = ProviderTestUtils.getProviderTestConfig('openai');
const result = await ProviderTestUtils.testProviderChatCompletion(
  provider,
  apiKey,
  config
);

// 新方式
import { OpenAITestUtils } from '../utils/openaiTestUtils.js';
const result = await OpenAITestUtils.testChatCompletion(provider, apiKey, {
  model: 'gpt-3.5-turbo',
});
```

### 添加新 Provider

1. 创建 `{provider}TestUtils.ts` 继承 `BaseProviderTestUtils`
2. 定义 provider 专门的配置接口
3. 实现 provider 专门的请求创建方法
4. 实现 provider 专门的测试方法

## 文件结构

```
test/utils/
├── baseTestUtils.ts          # 基础抽象层
├── openaiTestUtils.ts        # OpenAI 专门工具
├── openrouterTestUtils.ts    # OpenRouter 专门工具
├── litellmTestUtils.ts       # LiteLLM 专门工具
└── testEnv.ts               # 环境管理（保持不变）
```

这种重构方式确保了：

- 每个 provider 的测试工具完全匹配其 API 规范
- 减少了不必要的参数转换和删除逻辑
- 提高了类型安全性和代码可读性
- 简化了新 provider 的添加过程
