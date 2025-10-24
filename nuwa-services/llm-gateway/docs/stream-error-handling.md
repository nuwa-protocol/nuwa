# Stream Error Handling Implementation

## 问题描述

在流式（streaming）模式下，当后端 provider（如 Claude API）返回错误时，错误信息无法正确传递给前端客户端。客户端只能看到连接中断，但不知道具体的错误原因。

### 问题场景

```
Client → Gateway (SSE headers sent) → Provider returns 400 error
                                     ↓
                            Client gets nothing (empty body)
```

### 实际错误日志

```json
{
  "status_code": 200,                    // 客户端看到的状态码
  "upstream_status_code": 400,          // 上游实际返回的错误
  "content-type": "text/event-stream",   // 响应类型
  "error_type": "<nil>",                 // 错误类型为空
  "response body": ""                    // 响应体为空
}
```

## 根本原因

1. **过早发送 SSE 响应头**：在 `routeHandler.ts` 中，SSE 响应头在调用 provider 之前就已经发送
2. **错误未传递**：当 `executeStreamRequest` 返回 `result.success === false` 时，错误信息没有正确写入响应流
3. **HTTP 状态码限制**：一旦 SSE 响应头发送（`res.headersSent === true`），就无法再改变 HTTP 状态码
4. **错误信息提取失败**：Claude API 使用嵌套的错误格式，`BaseLLMProvider.extractErrorInfo` 没有正确处理

### Claude API 错误格式

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "system: text content blocks must be non-empty"
  },
  "request_id": "req_011CURe5b5KfYRq37fv8qqhM"
}
```

之前的代码只从 `data.error` 中提取 `type` 和 `code`，导致：
- `errorType`: `'error'` (外层的 type)
- `errorCode`: `undefined` (外层没有 code)

正确应该从 `data.error.error` 中提取：
- `errorType`: `'invalid_request_error'`
- `errorCode`: (如果有的话)
- `errorMessage`: `'system: text content blocks must be non-empty'`

## 解决方案

### 1. 修复字符串 JSON 解析

**文件**: `src/providers/BaseLLMProvider.ts` (normalizeErrorData 方法)

**问题**: 有些 provider（如通过某些代理）返回的错误数据是 JSON 字符串而不是对象

```typescript
protected async normalizeErrorData(data: any): Promise<any> {
  // ... Buffer 和 Stream 处理 ...
  
  // Handle String (try to parse as JSON)
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data; // Return as-is if not valid JSON
    }
  }
  
  // Already normalized (Object)
  return data;
}
```

### 2. 修复 Claude 错误格式解析

**文件**: `src/providers/BaseLLMProvider.ts`

```typescript
// Extract error information from normalized data
if (data && typeof data === 'object' && !Buffer.isBuffer(data)) {
  // Support multiple error formats:
  // 1. Claude format: { type: "error", error: { type, message }, request_id }
  // 2. OpenAI format: { error: { message, code, type } }
  // 3. Direct format: { message, code, type }
  
  let errorObj = data.error || data;
  let errorMessage = errorObj.message || `Error response with status ${statusCode}`;
  let errorCode = errorObj.code;
  let errorType = errorObj.type;
  
  // Handle Claude's nested error structure
  if (data.type === 'error' && data.error && typeof data.error === 'object') {
    // Claude format: { type: "error", error: { type, message }, request_id }
    errorMessage = data.error.message || errorMessage;
    errorType = data.error.type || errorType;
    errorCode = data.error.code || errorCode;
    
    // Also extract request_id from Claude response
    if (data.request_id && !requestId) {
      details.requestId = data.request_id;
    }
  }
  
  message = errorMessage;
  
  details = {
    code: errorCode,
    type: errorType,
    param: errorObj.param,
    statusText,
    requestId: details.requestId || requestId,
    headers: this.extractRelevantHeaders(headers),
    rawError: data
  };
}
```

### 2. 增强日志输出

**文件**: `src/providers/BaseLLMProvider.ts`

```typescript
// Handle error response
if ('error' in response) {
  console.error(`[${this.constructor.name}] Stream request returned error:`, {
    error: response.error,
    status: response.status,
    details: response.details,
    errorCode: response.details?.code,
    errorType: response.details?.type,
    requestId: response.details?.requestId
  });
  
  return {
    success: false,
    statusCode: response.status || 500,
    totalBytes: 0,
    error: response.error,
    details: response.details,
    upstreamRequestId: response.details?.requestId,
    errorCode: response.details?.code,
    errorType: response.details?.type
  };
}
```

### 2. 改进错误传递

**文件**: `src/core/routeHandler.ts`

在 `handleStreamRequest` 方法中，当检测到流式请求失败时：

```typescript
if (!result.success) {
  // 记录详细的错误信息
  console.error(`[RouteHandler] Stream request failed:`, {
    error: result.error,
    errorCode: result.errorCode,
    errorType: result.errorType,
    statusCode: result.statusCode,
    upstreamRequestId: result.upstreamRequestId,
    responseWritableEnded: res.writableEnded,
    responseHeadersSent: res.headersSent
  });
  
  // 通过 SSE format 发送错误事件给客户端
  if (!res.writableEnded) {
    try {
      const errorEvent = {
        type: 'error',
        error: {
          message: result.error || 'Stream request failed',
          type: result.errorType || 'gateway_error',
          code: result.errorCode || 'unknown_error',
        }
      };
      const errorData = `event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`;
      
      // ⚠️ 关键：使用 res.end(data) 而不是 res.write() + res.end()
      // PaymentKit 包装了 res.end()，分开调用会导致数据丢失
      res.end(errorData);
    } catch (writeError) {
      console.error('[RouteHandler] Failed to send error event:', writeError);
      if (!res.writableEnded) {
        res.end();
      }
    }
  } else {
    console.warn('[RouteHandler] Response already ended, cannot send error event');
  }
  return;
}
```

**重要说明：为什么使用 `res.write()` + `res.end()` 而不是 `res.end(data)`？**

PaymentKit 中间件包装了 `res.end()` 方法来处理计费和 RAV 持久化。其封装逻辑如下：

```typescript
// PaymentKit 的 res.end() 包装 (ExpressPaymentKit.ts)
const originalEnd = res.end.bind(res);
res.end = (...args) => {
  // 1. 执行计费结算
  const settled = processor.settle(billingContext, units);
  
  // 2. 写入 payment frame (SSE格式)
  res.write(`data: {"nuwa_payment_header": "..."}\n\n`);
  
  // 3. 调用原始的 end()
  return originalEnd(...args);
};
```

**问题分析**：

当我们调用 `res.end(errorData)` 时：
1. PaymentKit 拦截调用
2. 先执行 `res.write(paymentFrame)` - payment header 被写入
3. 然后执行 `originalEnd(errorData)` - 错误数据被写入

**结果**：payment frame 会出现在错误数据之前。

**解决方案**：

使用 `res.write(errorData)` + `res.end()` 的方式：
1. 我们先调用 `res.write(errorData)` - 错误数据被写入
2. 然后调用 `res.end()`
3. PaymentKit 拦截 `end()`，执行 `res.write(paymentFrame)` - payment frame 被写入
4. 最后执行 `originalEnd()`

**结果**：错误数据出现在 payment frame 之前，顺序正确。

这个问题通过集成测试得到了验证（见 `test/integration/stream-error-output.test.ts`）：
- ✅ 没有 PaymentKit：`res.end(data)` 正常工作
- ❌ 有 PaymentKit + `res.end(data)`：payment frame 在错误数据前面
- ✅ 有 PaymentKit + `res.write()` + `res.end()`：顺序正确
```

## 调试步骤

### 1. 重启 Gateway

```bash
cd nuwa-services/llm-gateway
pnpm run dev  # 或 pnpm start
```

### 2. 重新测试错误场景

发送一个会导致错误的请求（例如空的 content）：

```bash
curl -X POST http://localhost:8080/claude/v1/messages \
  -H "Authorization: DIDAuthV1 ..." \
  -H "X-Payment-Channel-Data: ..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-haiku-20241022",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": ""}],
    "stream": true
  }'
```

### 3. 查看日志输出

现在应该能看到详细的日志：

```
[ClaudeProvider] Stream request returned error: {
  error: 'system: text content blocks must be non-empty',
  status: 400,
  details: { code: 'invalid_request_error', type: '...', ... }
}

[RouteHandler] Stream request failed: {
  error: '...',
  errorCode: 'invalid_request_error',
  errorType: 'invalid_request_error',
  statusCode: 400,
  responseWritableEnded: false,
  responseHeadersSent: true
}

[RouteHandler] Sending error event to client: event: error
data: {"type":"error","error":{"message":"...","type":"...","code":"..."}}
```

```typescript
if (!result.success) {
  // ... 记录错误信息到 meta ...
  
  // 通过 SSE format 发送错误事件给客户端
  if (!res.writableEnded) {
    try {
      const errorEvent = {
        type: 'error',
        error: {
          message: result.error || 'Stream request failed',
          type: result.errorType || 'gateway_error',
          code: result.errorCode || 'unknown_error',
        }
      };
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    } catch (writeError) {
      console.error('Failed to write error event:', writeError);
    }
  }
  
  // 结束响应
  if (!res.writableEnded) {
    res.end();
  }
  return;
}
```

### SSE 错误格式

Gateway 现在使用标准的 SSE（Server-Sent Events）格式发送错误：

```
event: error
data: {"type":"error","error":{"message":"system: text content blocks must be non-empty","type":"invalid_request_error","code":"invalid_request_error"}}

```

## 前端集成

### 使用 EventSource API

```javascript
const eventSource = new EventSource('/claude/v1/messages');

// 监听错误事件
eventSource.addEventListener('error', (event) => {
  const errorData = JSON.parse(event.data);
  console.error('Stream error:', errorData.error);
  // 显示错误给用户
  showErrorToUser(errorData.error.message);
});

// 监听数据事件
eventSource.addEventListener('message', (event) => {
  // 处理正常的流式数据
  const data = JSON.parse(event.data);
  handleStreamData(data);
});
```

### 使用 fetch API (手动处理 SSE)

```javascript
const response = await fetch('/claude/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // ... 其他必要的认证头
  },
  body: JSON.stringify({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello' }],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('event: error')) {
      // 下一行是错误数据
      const nextLine = lines[lines.indexOf(line) + 1];
      if (nextLine.startsWith('data: ')) {
        const errorData = JSON.parse(nextLine.substring(6));
        console.error('Stream error:', errorData.error);
        // 处理错误
        handleError(errorData.error);
        return;
      }
    } else if (line.startsWith('data: ')) {
      // 处理正常数据
      const data = JSON.parse(line.substring(6));
      handleStreamData(data);
    }
  }
}
```

## 测试

### 测试场景 1: 验证 Claude API 错误

```bash
# 发送一个会导致错误的请求（system message 为空）
curl -X POST http://localhost:8080/claude/v1/messages \
  -H "Authorization: DIDAuthV1 ..." \
  -H "X-Payment-Channel-Data: ..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-haiku-20241022",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": ""}],
    "stream": true
  }'

# 预期输出:
# event: error
# data: {"type":"error","error":{"message":"...","type":"invalid_request_error","code":"..."}}
```

### 测试场景 2: 验证其他 Provider 错误

```bash
# OpenAI API key 无效
curl -X POST http://localhost:8080/openai/v1/chat/completions \
  -H "Authorization: DIDAuthV1 ..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'

# 预期输出:
# event: error
# data: {"type":"error","error":{"message":"...","type":"authentication_error","code":"invalid_api_key"}}
```

## 好处

1. **✅ 前端可以感知错误**：客户端现在能够接收到详细的错误信息
2. **✅ 标准化错误格式**：使用标准的 SSE `event: error` 格式
3. **✅ 兼容现有流程**：不影响正常的流式数据传输
4. **✅ 完整的错误上下文**：包含 `message`、`type` 和 `code` 字段
5. **✅ 日志记录完整**：错误信息同时记录到 access log 中

## 相关文件

- `src/core/routeHandler.ts` - 主要修改
- `docs/access-log.md` - 文档更新（流式错误处理部分）
- `src/providers/BaseLLMProvider.ts` - Provider 错误处理基础实现
- `src/providers/claude.ts` - Claude provider 实现

## 未来改进

1. **错误重试机制**：对于某些可重试的错误，Gateway 可以自动重试
2. **错误统计**：收集和分析流式错误的统计数据
3. **告警系统**：当错误率超过阈值时触发告警
4. **前端 SDK**：提供封装好的客户端库，简化错误处理

