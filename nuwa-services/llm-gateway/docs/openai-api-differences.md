# OpenAI API 实现指南

## 概述

OpenAI 提供了两个主要的对话 API，它们有不同的参数、用途和计费模式。本文档全面介绍了这两个 API 的差异、实现细节、工具定价架构和扩展性设计。

## Chat Completions API vs Response API

OpenAI 提供了两个主要的对话 API,它们有不同的参数和用途。

### 1. Chat Completions API (`/v1/chat/completions`)

#### 特点
- 传统的对话接口
- 使用 `messages` 数组作为输入
- 只支持 `function` 类型的工具调用
- 支持 `stream_options` 参数

#### 示例请求
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "stream": true,
  "stream_options": {
    "include_usage": true  // ✅ 支持此参数
  }
}
```

#### 工具调用
```json
{
  "model": "gpt-4o-mini",
  "messages": [...],
  "tools": [
    {
      "type": "function",  // 只支持 function 类型
      "function": {
        "name": "get_weather",
        "description": "Get weather info",
        "parameters": {...}
      }
    }
  ]
}
```

### 2. Response API (`/v1/responses`)

#### 特点
- 新一代 API,支持更多内置工具
- 使用 `input` 字符串作为输入 (**不是** `messages` 数组)
- 支持内置工具: `web_search`, `file_search`, `computer_use` 等
- **不支持** `stream_options` 参数
- Usage 信息自动包含在响应中
- 工具格式更简洁

#### 示例请求
```json
{
  "model": "gpt-4o",
  "input": "What is the weather in SF?",  // 使用 input 字符串
  "stream": true,  // ❌ 不要添加 stream_options!
  "tools": [
    {
      "type": "web_search"  // 简洁的工具格式
    }
  ]
}
```

#### 工具调用
```json
{
  "model": "gpt-4o",
  "input": "Search for X",  // 使用 input 字符串
  "tools": [
    {
      "type": "web_search"  // ✅ 内置工具 - 简洁格式
    },
    {
      "type": "file_search"  // ✅ 内置工具
    },
    {
      "type": "function",  // ✅ 也支持自定义函数
      "function": {
        "name": "custom_tool",
        "description": "...",
        "parameters": {...}
      }
    }
  ]
}
```

## 主要差异对比

| 特性 | Chat Completions API | Response API |
|------|---------------------|--------------|
| **Endpoint** | `/v1/chat/completions` | `/v1/responses` |
| **输入参数** | `messages` (数组) | `input` (字符串) |
| **工具格式** | `{"type":"function","function":{...}}` | `{"type":"web_search"}` (简洁) |
| **stream_options** | ✅ 支持 | ❌ 不支持 |
| **Usage 信息** | 需要 `stream_options.include_usage` | ✅ 自动包含 |
| **Function Tools** | ✅ 支持 | ✅ 支持 |
| **Built-in Tools** | ❌ 不支持 | ✅ 支持 (web_search, file_search, etc.) |
| **工具定价** | 只计算 token | Token + 工具调用费用 |

## Response API 工具定价架构

### 混合计费模式

Response API 采用**混合计费模式**，与传统的纯 token 计费不同：

1. **Token 成本**：按模型标准费率计费（input_tokens + output_tokens）
2. **工具调用成本**：按调用次数独立计费
3. **存储成本**：文件存储按 GB/天计费

### 官方工具定价表

| 工具类型 | 计费方式 | 费率 | 备注 |
|---------|---------|------|------|
| `web_search` | 按调用次数 | $10.00 / 1,000 次调用 | GPT-4o/4.1 内容 tokens 免费 |
| `file_search` | 按调用次数 | $2.50 / 1,000 次调用 | 首个 1GB 存储免费 |
| `code_interpreter` | 按会话 | $0.03 / 会话 | Jupyter 环境执行 |
| `computer_use` | 按会话 | $0.03 / 会话 | 计算机操作 |

### 成本计算示例

**场景：GPT-4o + 2次 Web Search + 1次 File Search**

```
Token 成本: (700 input * $2.50/1M) + (300 output * $10.00/1M) = $4.75
工具成本: (2 × $10/1000) + (1 × $2.50/1000) = $0.0225
总计: $4.7725
```

### 实现架构

```typescript
// 扩展的 Usage 类型定义
export interface ResponseUsage {
  input_tokens: number;        // Response API 使用 input_tokens
  output_tokens: number;       // Response API 使用 output_tokens
  total_tokens: number;
  
  // 详细的 token 信息（OpenAI 新增字段）
  input_tokens_details?: {
    cached_tokens?: number;    // 缓存的 tokens 数量
  };
  output_tokens_details?: {
    reasoning_tokens?: number; // 推理过程使用的 tokens
  };
  
  // 工具内容 tokens（计入 input_tokens）
  web_search_tokens?: number;
  file_search_tokens?: number;
  tool_call_tokens?: number;
  computer_use_tokens?: number;
  
  // 工具调用次数（独立计费）
  tool_calls_count?: {
    web_search?: number;
    file_search?: number;
    code_interpreter?: number;
    computer_use?: number;
  };
  
  // 成本信息（如果提供商支持）
  cost?: number;
  cost_breakdown?: {
    model_cost?: number;
    tool_call_cost?: number;
    storage_cost?: number;
  };
}
```

## 我们的实现

### 动态扩展性架构

为了支持 OpenAI 未来可能添加的新工具类型，我们实现了动态检测和处理机制：

#### 1. 动态工具检测

```typescript
// 不再硬编码工具类型，而是基于模式检测
private hasResponseAPITools(tools: any[]): boolean {
  return tools.some(tool => {
    if (!tool || typeof tool !== 'object' || !tool.type) {
      return false;
    }
    // 任何非 function 类型的工具都表示 Response API
    return tool.type !== 'function';
  });
}
```

#### 2. 动态 Usage Token 提取

```typescript
// 动态提取所有 *_tokens 字段，而不硬编码
private static extractResponseAPIUsage(usage: any): UsageInfo {
  let toolTokens = 0;
  const keys = Object.keys(usage);
  
  for (const key of keys) {
    // 匹配所有以 '_tokens' 结尾且非标准字段的键
    if (key.endsWith('_tokens') && 
        key !== 'input_tokens' && 
        key !== 'output_tokens' && 
        key !== 'total_tokens') {
      const tokenValue = usage[key];
      if (typeof tokenValue === 'number' && tokenValue > 0) {
        toolTokens += tokenValue;
      }
    }
  }
  
  return {
    promptTokens: (usage.input_tokens || 0) + toolTokens,
    completionTokens: usage.output_tokens || 0,
    totalTokens: usage.total_tokens || 0
  };
}
```

#### 3. 零维护成本的新工具支持

当 OpenAI 添加新工具（如 `future_ai_tool`）时：
- ✅ **自动检测**：识别为 Response API 工具
- ✅ **自动计费**：工具内容 tokens 自动包含在成本计算中
- ✅ **向后兼容**：不影响现有功能
- ✅ **可观测性**：自动记录新工具类型的警告日志

### 自动检测 API 类型

```typescript
private isResponseAPIRequest(data: any): boolean {
  return !!(
    data.input ||  // Response API 使用 input 字符串
    data.store ||  // Response API 特有参数
    (data.tools && this.hasResponseAPITools(data.tools))  // 检测内置工具
  );
}

private hasResponseAPITools(tools: any[]): boolean {
  return tools.some(tool => 
    tool.type && tool.type !== 'function'  // 非 function 类型表示 Response API
  );
}
```

### 参数准备

#### Chat Completions API
```typescript
private prepareChatCompletionData(data: any, isStream: boolean): any {
  if (isStream) {
    return {
      ...data,
      stream_options: {
        include_usage: true,  // ✅ 添加 stream_options
        ...(data.stream_options || {})
      }
    };
  }
  return data;
}
```

#### Response API
```typescript
private prepareResponseAPIData(data: any, isStream: boolean): any {
  const prepared = { ...data };
  
  // ❌ Response API 不支持 stream_options
  if (prepared.stream_options) {
    console.warn('⚠️  stream_options is not supported in Response API, removing it');
    delete prepared.stream_options;
  }
  
  // 规范化工具配置
  if (prepared.tools) {
    prepared.tools = this.normalizeResponseAPITools(prepared.tools);
  }
  
  return prepared;
}
```

## 常见错误

### 错误 1: 在 Response API 中使用 stream_options

**错误请求**:
```json
{
  "model": "gpt-4o",
  "input": "test",
  "stream": true,
  "stream_options": {  // ❌ Response API 不支持
    "include_usage": true
  }
}
```

**错误响应**:
```json
{
  "error": {
    "message": "Unknown parameter: 'stream_options.include_usage'.",
    "type": "invalid_request_error",
    "param": "stream_options.include_usage",
    "code": "unknown_parameter"
  }
}
```

**修复**: 移除 `stream_options` 参数

```json
{
  "model": "gpt-4o",
  "input": "test",
  "stream": true  // ✅ 正确
}
```

### 错误 2: 在 Chat Completions API 中使用内置工具

**错误请求**:
```json
{
  "model": "gpt-4o-mini",
  "messages": [...],
  "tools": [
    {
      "type": "web_search",  // ❌ Chat Completions API 不支持
      "web_search": {
        "enabled": true
      }
    }
  ]
}
```

**修复**: 使用 Response API 或改用 function 工具

### 错误 3: Response API 缺少 input

**错误请求**:
```json
{
  "model": "gpt-4o",
  "tools": [...]  // ❌ 缺少 input
}
```

**错误响应**:
```json
{
  "error": {
    "message": "You must provide an input",
    "type": "invalid_request_error",
    "param": "input",
    "code": "invalid_request_error"
  }
}
```

**修复**: 添加 `input` 或 `messages` 参数

```json
{
  "model": "gpt-4o",
  "input": "Your query here",  // ✅ 正确
  "tools": [...]
}
```

## 使用建议

### 何时使用 Chat Completions API
- ✅ 只需要基本的对话功能
- ✅ 使用自定义 function 工具
- ✅ 需要精确控制 usage 统计
- ✅ 已有的集成代码

### 何时使用 Response API
- ✅ 需要使用内置工具 (web_search, file_search, etc.)
- ✅ 需要更高级的 AI 功能
- ✅ 需要 computer_use 或 code_interpreter
- ✅ 新项目或新功能

## Usage 信息获取

### Chat Completions API (流式)

需要在请求中添加 `stream_options`:
```json
{
  "stream": true,
  "stream_options": {
    "include_usage": true
  }
}
```

响应流的最后一个 chunk 包含 usage:
```
data: {"choices":[...],"usage":null}
data: {"choices":[...],"usage":null}
data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}
data: [DONE]
```

### Response API (流式)

Usage 自动包含,无需额外参数:
```json
{
  "stream": true  // 就这么简单
}
```

响应流自动包含 usage 信息:
```
event: response.completed
data: {"type":"response.completed","response":{"usage":{"input_tokens":17008,"input_tokens_details":{"cached_tokens":0},"output_tokens":741,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":17749}}}
```

## 测试命令

### Chat Completions API
```bash
curl -X POST http://localhost:3000/openai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: DIDAuthV1 ..." \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true,
    "stream_options": {"include_usage": true}
  }'
```

### Response API
```bash
curl -X POST http://localhost:3000/openai/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: DIDAuthV1 ..." \
  -d '{
    "model": "gpt-4o",
    "input": "What is the weather in SF?",
    "stream": true,
    "tools": [
      {"type": "web_search", "web_search": {"enabled": true}}
    ]
  }'
```

## 参考资料

- [OpenAI Chat Completions API 文档](https://platform.openai.com/docs/api-reference/chat)
- [OpenAI Response API 文档](https://platform.openai.com/docs/api-reference/responses)
- [OpenAI 工具定价](https://openai.com/api/pricing/)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)

## 架构优势总结

### 1. 准确的成本计算
- ✅ 分离 token 成本和工具调用成本
- ✅ 符合 OpenAI 官方定价模式
- ✅ 支持特殊优惠政策（如 GPT-4o 免费 tokens）

### 2. 动态扩展性
- ✅ 自动支持新的工具类型，无需代码修改
- ✅ 基于模式匹配，而非硬编码工具名称
- ✅ 灵活的工具配置验证

### 3. 完整的向后兼容
- ✅ Chat Completions API 逻辑完全不变
- ✅ 现有计费流程保持稳定
- ✅ 平滑的迁移路径

### 4. 透明的成本分解
- ✅ 详细的成本分解信息
- ✅ 便于调试和优化
- ✅ 支持精细化的计费管理

### 5. 零维护成本
- ✅ 新工具自动支持
- ✅ 可观测性：自动检测和报告新工具
- ✅ 统一计费逻辑适用于所有工具类型

## 总结

- ✅ **Chat Completions API**: 使用 `stream_options.include_usage` 获取 usage
- ✅ **Response API**: 不使用 `stream_options`,usage 自动包含
- ✅ 我们的代码现在会自动检测 API 类型并正确处理参数
- ✅ 如果错误地添加了 `stream_options` 到 Response API,会自动移除并警告

## 实现注意事项

### Response API 流式 Usage 解析

Response API 的流式响应中，usage 信息的格式与 Chat Completions API 不同：

```
event: response.completed
data: {"type":"response.completed","sequence_number":77,"response":{"usage":{"input_tokens":307,"output_tokens":72,"total_tokens":379}}}
```

关键差异：
1. **事件标识**: 需要先检测 `event: response.completed`
2. **嵌套结构**: usage 位于 `data.response.usage`
3. **字段名称**: 使用 `input_tokens`/`output_tokens` 而非 `prompt_tokens`/`completion_tokens`

### 真实的 Response API 响应格式

基于实际的 OpenAI Response API 响应，usage 字段的完整格式如下：

#### 非流式响应
```json
{
  "id": "resp_0088114fb2a85e7f0068f03277492081969b8a6eb303eba34c",
  "object": "response",
  "status": "completed",
  "model": "gpt-4o-2024-08-06",
  "output": [...],
  "usage": {
    "input_tokens": 17142,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 638,
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "total_tokens": 17780
  }
}
```

#### 流式响应
```
event: response.completed
data: {"type":"response.completed","sequence_number":66,"response":{"usage":{"input_tokens":17008,"input_tokens_details":{"cached_tokens":0},"output_tokens":741,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":17749}}}
```

**关键字段说明：**
- `input_tokens`: 输入 tokens 数量（等同于 Chat Completions API 的 `prompt_tokens`）
- `output_tokens`: 输出 tokens 数量（等同于 Chat Completions API 的 `completion_tokens`）
- `input_tokens_details.cached_tokens`: 使用缓存的 tokens 数量
- `output_tokens_details.reasoning_tokens`: 推理过程中使用的 tokens 数量

### 工具定价

Response API 支持内置工具（web_search, file_search, code_interpreter），这些工具调用可能产生额外费用。工具定价信息存储在 `src/config/toolPricing.ts` 中。

### 调试

如果遇到计费问题，可以检查以下日志：
- 📊 Usage 提取和解析日志
- 💰 成本计算日志  
- 💵 计费流程日志

详细的调试信息会在 `usagePolicy.ts` 中输出。

