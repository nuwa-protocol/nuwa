# 通用路由转换设计

## 🎯 设计原则

基于用户建议，采用更通用和安全的路由转换逻辑：

```
/:provider/$path → provider_url/$path
```

## 🛠️ 核心特性

### 1. **通用路径透传**
- 客户端路径直接映射到上游服务路径
- 不需要为每个 provider 编写特殊的转换逻辑
- 新增 provider 时只需配置基础 URL 和允许路径

### 2. **安全路径验证**
- 每个 provider 配置 `allowedPaths` 白名单
- 支持精确匹配和通配符模式（`*`）
- 防止用户调用未授权的接口

### 3. **灵活的 Provider 配置**
```typescript
interface ProviderConfig {
  name: string;
  instance: LLMProvider;
  requiresApiKey: boolean;
  supportsNativeUsdCost: boolean;
  apiKey?: string;
  baseUrl: string; // Provider 基础 URL
  allowedPaths: string[]; // 允许的路径模式
}
```

## 🌐 路由示例

### OpenRouter
```
客户端: /openrouter/api/v1/chat/completions
上游: https://openrouter.ai/api/v1/chat/completions

允许路径:
- /api/v1/chat/completions
- /api/v1/models
- /api/v1/*
```

### OpenAI
```
客户端: /openai/v1/chat/completions  
上游: https://api.openai.com/v1/chat/completions

允许路径:
- /v1/chat/completions
- /v1/models
- /v1/*
```

### LiteLLM
```
客户端: /litellm/chat/completions
上游: https://litellm.example.com/chat/completions

允许路径:
- /chat/completions
- /models
- /*
```

## 🔒 安全机制

### 路径验证函数
```typescript
function isPathAllowed(path: string, allowedPaths: string[]): boolean {
  return allowedPaths.some(allowedPath => {
    if (allowedPath.endsWith('*')) {
      const prefix = allowedPath.slice(0, -1);
      return path.startsWith(prefix);
    } else {
      return path === allowedPath;
    }
  });
}
```

### 验证示例
```typescript
// OpenRouter 配置
allowedPaths: ['/api/v1/chat/completions', '/api/v1/*']

// 验证结果
isPathAllowed('/api/v1/chat/completions', allowedPaths) // ✅ true
isPathAllowed('/api/v1/models', allowedPaths)         // ✅ true  
isPathAllowed('/admin/users', allowedPaths)           // ❌ false
```

## 📝 实现细节

### 路径转换逻辑
```typescript
function getUpstreamPath(req: Request, providerName: string): string {
  const fullPath = req.path;
  const providerConfig = providerRegistry.get(providerName);
  
  // 提取路径
  let extractedPath: string;
  
  if (fullPath.startsWith('/debug/')) {
    // 调试路由: /debug/:provider/$path → $path
    const match = fullPath.match(/^\/debug\/[^\/]+(\/.*)$/);
    extractedPath = match[1];
  } else if (fullPath.startsWith(`/${providerName}/`)) {
    // 正常路由: /:provider/$path → $path  
    extractedPath = fullPath.substring(`/${providerName}`.length);
  } else {
    // 遗留路由保持不变
    return fullPath;
  }
  
  // 安全验证
  if (!isPathAllowed(extractedPath, providerConfig.allowedPaths)) {
    throw new Error(`Path not allowed: ${extractedPath}`);
  }
  
  return extractedPath;
}
```

### URL 构建
```typescript
// 在各个 Provider 服务中
const fullUrl = `${this.baseURL}${apiPath}`;

// 示例结果
// OpenRouter: https://openrouter.ai + /api/v1/chat/completions
// OpenAI: https://api.openai.com + /v1/chat/completions
// LiteLLM: https://litellm.example.com + /chat/completions
```

## ✅ 优势总结

1. **通用性**: 一套逻辑适用所有 provider
2. **安全性**: 白名单机制防止未授权访问
3. **透明性**: 路径直接对应，易于理解和调试
4. **可扩展性**: 新增 provider 只需配置，无需代码修改
5. **灵活性**: 支持不同 provider 的不同 API 结构

## 🔄 向后兼容

- 遗留路由 `/api/v1/*` 保持不变
- 调试路由 `/debug/:provider/*` 支持测试
- 现有客户端无需立即迁移

这个设计完美解决了之前路径重复的问题，同时提供了更好的通用性和安全性！
