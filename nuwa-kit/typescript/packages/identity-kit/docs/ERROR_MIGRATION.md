# IdentityKit 错误处理统一迁移指南

## 概述

IdentityKit 现在采用统一的 `IdentityKitError` 错误处理系统，替代了之前分散的错误处理方式。这个改进提供了更好的错误分类、详细的错误信息和用户友好的建议。

## 新的错误架构

### IdentityKitError 类

```typescript
export class IdentityKitError extends Error {
  public readonly code: IdentityKitErrorCode;
  public readonly category: string;
  public readonly details?: unknown;
  public readonly cause?: Error;
  
  // 获取用户友好的错误信息（包含建议）
  getUserMessage(): string;
  
  // 转换为 JSON 格式
  toJSON(): object;
}
```

### 错误代码分类

```typescript
export enum IdentityKitErrorCode {
  // 配置和初始化
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  ENVIRONMENT_NOT_SUPPORTED = 'ENVIRONMENT_NOT_SUPPORTED',
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  
  // DID 操作
  DID_NOT_FOUND = 'DID_NOT_FOUND',
  DID_INVALID_FORMAT = 'DID_INVALID_FORMAT',
  DID_METHOD_NOT_SUPPORTED = 'DID_METHOD_NOT_SUPPORTED',
  DID_CREATION_FAILED = 'DID_CREATION_FAILED',
  DID_RESOLUTION_FAILED = 'DID_RESOLUTION_FAILED',
  
  // VDR 操作
  VDR_NOT_AVAILABLE = 'VDR_NOT_AVAILABLE',
  VDR_OPERATION_FAILED = 'VDR_OPERATION_FAILED',
  VDR_NETWORK_ERROR = 'VDR_NETWORK_ERROR',
  
  // 密钥管理
  KEY_NOT_FOUND = 'KEY_NOT_FOUND',
  KEY_GENERATION_FAILED = 'KEY_GENERATION_FAILED',
  KEY_STORAGE_ERROR = 'KEY_STORAGE_ERROR',
  
  // 认证（兼容旧的 AuthErrorCode）
  AUTH_INVALID_HEADER = 'AUTH_INVALID_HEADER',
  AUTH_SIGNATURE_VERIFICATION_FAILED = 'AUTH_SIGNATURE_VERIFICATION_FAILED',
  // ... 其他认证错误
  
  // Web 特定
  WEB_BROWSER_NOT_SUPPORTED = 'WEB_BROWSER_NOT_SUPPORTED',
  WEB_STORAGE_NOT_AVAILABLE = 'WEB_STORAGE_NOT_AVAILABLE',
  WEB_DEEPLINK_FAILED = 'WEB_DEEPLINK_FAILED',
  
  // React 特定
  REACT_NOT_AVAILABLE = 'REACT_NOT_AVAILABLE',
  REACT_HOOK_MISUSE = 'REACT_HOOK_MISUSE',
}
```

## 迁移指南

### 1. 从直接抛出 Error 到 IdentityKitError

**之前**：
```typescript
// 旧方式：直接抛出 Error
if (!vdr) {
  throw new Error(`No VDR available for DID method '${method}'`);
}

if (!didDocument) {
  throw new Error(`Failed to resolve DID ${did}`);
}
```

**现在**：
```typescript
// 新方式：使用 IdentityKitError
import { createVDRError, createDIDError, IdentityKitErrorCode } from './errors';

if (!vdr) {
  throw createVDRError(
    IdentityKitErrorCode.VDR_NOT_AVAILABLE,
    `No VDR available for DID method '${method}'`,
    { method, did }
  );
}

if (!didDocument) {
  throw createDIDError(
    IdentityKitErrorCode.DID_RESOLUTION_FAILED,
    `Failed to resolve DID: ${did}`,
    { did, method }
  );
}
```

### 2. 从 AuthErrorCode 到 IdentityKitErrorCode

**之前**：
```typescript
// 旧方式：使用 AuthErrorCode
import { AuthErrorCode } from './auth/v1';

// 错误处理
if (error.code === AuthErrorCode.INVALID_HEADER) {
  // 处理无效头部错误
}
```

**现在**：
```typescript
// 新方式：使用统一的 IdentityKitErrorCode
import { IdentityKitErrorCode, isIdentityKitError } from './errors';

// 错误处理
if (isIdentityKitError(error) && error.code === IdentityKitErrorCode.AUTH_INVALID_HEADER) {
  // 处理无效头部错误
  console.log(error.getUserMessage()); // 获取用户友好的错误信息
}
```

### 3. Web 环境错误处理

**之前**：
```typescript
// 旧方式：IdentityKitWeb
if (typeof window === 'undefined') {
  throw new Error('IdentityKitWeb is only available in browser environments');
}
```

**现在**：
```typescript
// 新方式：使用 Web 特定错误
import { createWebError, IdentityKitErrorCode } from './errors';

if (typeof window === 'undefined') {
  throw createWebError(
    IdentityKitErrorCode.WEB_BROWSER_NOT_SUPPORTED,
    'IdentityKitWeb is only available in browser environments'
  );
}
```

### 4. React Hook 错误处理

**之前**：
```typescript
// 旧方式：useIdentityKit
if (typeof useState === 'undefined') {
  throw new Error('useIdentityKit requires React to be available');
}
```

**现在**：
```typescript
// 新方式：使用 React 特定错误
import { createReactError, IdentityKitErrorCode } from './errors';

if (typeof useState === 'undefined') {
  throw createReactError(
    IdentityKitErrorCode.REACT_NOT_AVAILABLE,
    'useIdentityKit requires React to be available'
  );
}
```

## 向后兼容性

### AuthErrorCode 兼容性

为了保持向后兼容性，我们提供了 `AuthErrorCodeMapping`：

```typescript
import { AuthErrorCodeMapping } from './errors';

// 旧的 AuthErrorCode 仍然可以使用
const oldCode = 'INVALID_HEADER';
const newCode = AuthErrorCodeMapping[oldCode]; // IdentityKitErrorCode.AUTH_INVALID_HEADER
```

### 错误检测兼容性

NuwaKit 的错误处理系统会自动检测新的 `IdentityKitError`：

```typescript
// 在 NuwaKit 中
try {
  await nuwa.identity.connect();
} catch (error) {
  // NuwaKit 会自动识别 IdentityKitError
  const summary = createErrorSummary(error);
  console.log(`Error from ${summary.package}: ${summary.code}`);
}
```

## 最佳实践

### 1. 使用工厂函数创建错误

```typescript
// ✅ 推荐：使用工厂函数
import { createDIDError, IdentityKitErrorCode } from './errors';

throw createDIDError(
  IdentityKitErrorCode.DID_NOT_FOUND,
  'DID not found in registry',
  { did, registry: 'rooch' }
);

// ❌ 不推荐：直接构造
throw new IdentityKitError(
  IdentityKitErrorCode.DID_NOT_FOUND,
  'DID not found in registry'
);
```

### 2. 提供详细的错误上下文

```typescript
// ✅ 好的错误上下文
throw createVDRError(
  IdentityKitErrorCode.VDR_NETWORK_ERROR,
  'Failed to connect to VDR endpoint',
  { 
    endpoint: 'https://test-seed.rooch.network',
    method: 'rooch',
    timeout: 30000,
    retryCount: 3
  }
);

// ❌ 缺少上下文
throw createVDRError(
  IdentityKitErrorCode.VDR_NETWORK_ERROR,
  'Network error'
);
```

### 3. 使用类型守卫进行错误处理

```typescript
import { isIdentityKitError, IdentityKitErrorCode } from './errors';

try {
  // 一些 IdentityKit 操作
} catch (error) {
  if (isIdentityKitError(error)) {
    // 处理 IdentityKit 特定错误
    console.error('IdentityKit Error:', error.getUserMessage());
    
    // 根据错误类型进行特定处理
    switch (error.code) {
      case IdentityKitErrorCode.WEB_STORAGE_NOT_AVAILABLE:
        // 建议用户启用存储或使用内存模式
        break;
      case IdentityKitErrorCode.VDR_NETWORK_ERROR:
        // 建议检查网络连接
        break;
    }
  } else {
    // 处理其他类型的错误
    console.error('Unknown error:', error);
  }
}
```

### 4. 包装未知错误

```typescript
import { wrapUnknownError, IdentityKitErrorCode } from './errors';

try {
  // 调用可能抛出任何类型错误的外部库
  await externalLibraryCall();
} catch (error) {
  // 包装为 IdentityKitError
  throw wrapUnknownError(
    error,
    'External library operation failed',
    IdentityKitErrorCode.INTERNAL_ERROR
  );
}
```

## 错误信息和建议

新的错误系统会根据错误类型自动提供有用的建议：

```typescript
try {
  await identityKit.someOperation();
} catch (error) {
  if (isIdentityKitError(error)) {
    console.log(error.getUserMessage());
    // 输出示例：
    // "Web storage is not available in current browser
    // 
    // Suggestions:
    // • Enable localStorage or IndexedDB in your browser
    // • Check if you're in private/incognito mode
    // • Consider using memory storage as fallback"
  }
}
```

## 与 NuwaKit 的集成

NuwaKit 会自动识别和处理 `IdentityKitError`：

```typescript
// NuwaKit 会自动包装 IdentityKitError
try {
  const nuwa = await NuwaKit.initialize();
  await nuwa.identity.connect();
} catch (error) {
  // error 是 NuwaKitRuntimeError，包装了原始的 IdentityKitError
  const summary = createErrorSummary(error);
  console.log(`Error from ${summary.package}: ${summary.code}`);
  
  // 可以获取原始的 IdentityKitError
  const originalError = getOriginalPackageError(error);
  if (originalError && isIdentityKitError(originalError)) {
    console.log('Original IdentityKit error:', originalError.code);
  }
}
```

## 总结

这次错误处理统一带来的好处：

1. **一致性**：所有 IdentityKit 错误都使用相同的格式和结构
2. **详细信息**：错误包含更多上下文和调试信息
3. **用户友好**：自动提供基于错误类型的建议
4. **向后兼容**：旧的 AuthErrorCode 仍然可以使用
5. **更好的调试**：错误链和详细的堆栈跟踪
6. **NuwaKit 集成**：与统一 SDK 的错误处理系统无缝集成

迁移到新的错误系统是渐进式的，现有代码可以继续工作，但建议逐步采用新的错误处理方式以获得更好的开发体验。
