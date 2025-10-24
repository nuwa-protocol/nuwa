# LLM Gateway 架构文档

## 概述

LLM
Gateway 是一个统一的 LLM 服务代理，支持多个 LLM 提供商（OpenAI、OpenRouter、LiteLLM 等）。本文档描述了重构后的新架构，特别是使用量提取和成本计算系统的设计。

## 架构原则

1. **单一职责原则**：每个组件专注于特定功能
2. **开放封闭原则**：对扩展开放，对修改封闭
3. **依赖倒置原则**：依赖抽象而非具体实现
4. **向后兼容性**：保持现有 API 不变

## 核心组件

### 1. 使用量提取系统

#### 接口定义

```typescript
// src/billing/usage/interfaces/UsageExtractor.ts
interface UsageExtractor {
  extractFromResponseBody(responseBody: any): UsageInfo | null;
  extractFromStreamChunk(
    chunkText: string
  ): { usage: UsageInfo; cost?: number } | null;
}
```

#### 基础实现

```typescript
// src/billing/usage/base/BaseUsageExtractor.ts
abstract class BaseUsageExtractor implements UsageExtractor {
  // 通用的使用量提取逻辑
  // 子类可以重写特定方法来处理 provider 特有格式
}
```

#### Provider 特定实现

- **DefaultUsageExtractor**: 处理标准 OpenAI 格式（Chat Completions 和 Response
  API）
- **OpenRouterUsageExtractor**: 处理 OpenRouter 特有格式
- **LiteLLMUsageExtractor**: 处理 LiteLLM 特有格式

### 2. 流式处理系统

#### 接口定义

```typescript
// src/billing/usage/interfaces/StreamProcessor.ts
interface StreamProcessor {
  processChunk(chunk: string): void;
  getFinalCost(): PricingResult | null;
  getFinalUsage(): UsageInfo | null;
}
```

#### 基础实现

```typescript
// src/billing/usage/base/BaseStreamProcessor.ts
abstract class BaseStreamProcessor implements StreamProcessor {
  // 通用的流式处理逻辑
  // 累积使用量、计算最终成本等
}
```

### 3. 成本计算系统

```typescript
// src/billing/usage/CostCalculator.ts
class CostCalculator {
  static calculateRequestCost(
    model: string,
    providerCostUsd?: number,
    usage?: UsageInfo
  ): PricingResult | null;
  static applyMultiplier(costUsd: number): number;
  static getPricingMultiplier(): number;
}
```

### 4. Provider 接口扩展

```typescript
// src/providers/LLMProvider.ts
interface LLMProvider {
  // 现有方法...

  // 新增可选方法
  createUsageExtractor?(): UsageExtractor;
  createStreamProcessor?(model: string, initialCost?: number): StreamProcessor;
}
```

### 5. 适配器层

```typescript
// src/billing/usage/UsagePolicyAdapter.ts
class UsagePolicyAdapter {
  // 连接新旧架构的适配器
  // 保持 UsagePolicy 的向后兼容性
}
```

## 数据流

### 非流式请求处理

```
Request → Provider → Response → UsageExtractor → CostCalculator → PricingResult
```

1. 请求发送到 LLM Provider
2. Provider 返回响应
3. UsageExtractor 从响应中提取使用量
4. CostCalculator 计算成本
5. 返回最终的 PricingResult

### 流式请求处理

```
Request → Provider → Stream → StreamProcessor → Accumulated Usage → Final Cost
```

1. 请求发送到 LLM Provider（流式模式）
2. Provider 返回 SSE 流
3. StreamProcessor 处理每个流式块
4. 累积使用量和成本信息
5. 返回最终的使用量和成本

## Provider 特定处理

### OpenAI Provider

- **支持格式**: Chat Completions API, Response API
- **特殊处理**:
  - Response API 的 `input_tokens`/`output_tokens` 格式
  - 动态工具调用 token 提取
  - Stream options 注入

### OpenRouter Provider

- **支持格式**: 标准 OpenAI 格式 + OpenRouter 扩展
- **特殊处理**:
  - 从响应 body 或 `x-usage` header 提取成本
  - 流式响应中的成本信息

### LiteLLM Provider

- **支持格式**: 标准 OpenAI 格式
- **特殊处理**:
  - 从 `x-litellm-response-cost` header 提取成本

## 配置和扩展

### 添加新的 Provider

1. 实现 `LLMProvider` 接口
2. 可选：创建自定义 `UsageExtractor` 和 `StreamProcessor`
3. 在 provider 中实现 `createUsageExtractor()` 和 `createStreamProcessor()` 方法

```typescript
class MyCustomProvider implements LLMProvider {
  // 实现必需方法...

  createUsageExtractor(): UsageExtractor {
    return new MyCustomUsageExtractor();
  }

  createStreamProcessor(model: string, initialCost?: number): StreamProcessor {
    return new MyCustomStreamProcessor(model, initialCost);
  }
}
```

### 自定义使用量提取

```typescript
class MyCustomUsageExtractor extends BaseUsageExtractor {
  extractFromResponseBody(responseBody: any): UsageInfo | null {
    // 实现自定义提取逻辑
    return this.extractCustomFormat(responseBody);
  }
}
```

## 性能特征

### 基准测试结果

- **使用量提取**: 0.0017ms 平均耗时
- **Provider 成本计算**: 0.0024ms 平均耗时
- **Gateway 成本计算**: 0.0064ms 平均耗时
- **Stream Processor 创建**: 0.0022ms 平均耗时
- **内存使用**: 100次操作仅增长 0.24MB

### 性能优化

1. **缓存机制**: Pricing multiplier 缓存
2. **对象复用**: 避免重复创建相同的 extractor/processor
3. **惰性初始化**: 只在需要时创建 provider 特定组件

## 错误处理

### 错误隔离

- Provider 特定错误不会影响其他 provider
- 使用量提取失败时有优雅降级
- 成本计算失败时返回 null 而不是抛出异常

### 日志记录

- 保持现有日志格式
- 增加新的调试信息
- Provider 特定的错误上下文

## 测试策略

### 单元测试

- 每个 UsageExtractor 和 StreamProcessor 的独立测试
- CostCalculator 的全面测试覆盖
- Provider 接口实现的测试

### 集成测试

- 端到端的使用量提取和成本计算
- 多 provider 场景测试
- 流式和非流式请求的完整流程

### 性能测试

- 核心操作的基准测试
- 内存使用监控
- 并发场景测试

## 向后兼容性

### 保持不变的接口

- `UsagePolicy` 的所有静态方法
- 外部 RPC API
- 现有的测试用例

### 适配器模式

通过 `UsagePolicyAdapter` 确保：

- 现有代码无需修改
- 测试用例继续通过
- 渐进式迁移到新架构

## 未来扩展

### 计划中的改进

1. **更多 Provider 支持**: Anthropic, Google, Azure OpenAI
2. **高级缓存**: Provider 响应缓存
3. **监控增强**: 更详细的性能指标
4. **配置热更新**: 运行时配置更新

### 扩展点

1. **自定义 Extractor**: 支持新的响应格式
2. **自定义 Processor**: 支持新的流式协议
3. **自定义 Calculator**: 支持新的定价模型
4. **插件系统**: 支持第三方扩展

## 最佳实践

### Provider 实现

1. 继承 `BaseUsageExtractor` 而不是从头实现
2. 重用 `CostCalculator` 的标准方法
3. 提供详细的错误信息和日志

### 性能优化

1. 避免在热路径中创建大量对象
2. 使用缓存减少重复计算
3. 合理使用异步处理

### 错误处理

1. 优雅降级而不是失败
2. 提供有意义的错误消息
3. 记录足够的上下文信息

## 总结

重构后的架构实现了以下目标：

✅ **可维护性**: 每个 provider 的逻辑独立封装  
✅ **可扩展性**: 新增 provider 成本大幅降低  
✅ **错误隔离**: Provider 特定错误不影响其他 provider  
✅ **性能保证**: 保持甚至提升了原有性能  
✅ **向后兼容**: 现有 API 和测试完全不受影响

这个新架构为 LLM Gateway 的未来发展奠定了坚实的基础。
