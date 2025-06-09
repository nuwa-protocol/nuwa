# WebAuthn 服务重构方案

## 1. 现状分析

### 1.1 当前接口

**后端 API 接口 (webauthn.ts)**:
```
GET /.well-known/webauthn          # WebAuthn 配置信息
POST /authentication/options       # 获取认证选项
POST /verify                      # 验证响应
GET /devices                      # 获取用户设备列表
DELETE /devices/:deviceId         # 删除设备
POST /cleanup                     # 清理过期挑战
POST /register/begin             # 开始注册（冗余）
POST /authenticate/begin         # 开始认证（冗余）
```

**前端服务 (passkey-service.ts)**:
```typescript
class PasskeyService {
  isSupported(): Promise<boolean>
  check1PasswordInterference(): Promise<{detected: boolean, ...}>
  authenticate(): Promise<WebAuthnAuthenticationResult>
}
```

### 1.2 存在的问题

1. **接口冗余**
   - `/register/begin` 和 `/authenticate/begin` 与 `/authentication/options` 功能重复
   - 这些接口都是用来获取认证选项，应该统一为一个接口

2. **命名不一致**
   - 后端使用 `webauthn` 作为路由前缀，前端使用 `passkey` 作为类名
   - 应该统一使用一种命名方式，建议使用 `WebAuthn` 作为标准名称

3. **接口语义不清晰**
   - `/verify` 接口同时处理注册和认证，但从名称上看不出来
   - `authenticate()` 方法实际上也处理注册流程，命名可能造成误解

4. **缺少标准的错误处理**
   - 错误返回格式不统一
   - 缺少标准的错误码定义

## 2. 标准规范

### 2.1 W3C WebAuthn Level 3 规范
- 参考：https://w3c.github.io/webauthn/
- 定义了标准的 API 命名和数据结构

### 2.2 标准操作流程
1. Registration (注册)
   - 获取注册选项
   - 验证注册响应
2. Authentication (认证)
   - 获取认证选项
   - 验证认证响应

## 3. 优化方案

### 3.1 共享类型定义

所有的共享类型定义将放在 `@cadop-shared` 包中，包括：

1. **数据结构定义** (`@cadop-shared/src/types/webauthn.ts`)
```typescript
// 统一认证选项
export interface AuthenticationOptions {
  publicKey: PublicKeyCredentialRequestOptions
  user?: {
    did?: string
    name?: string
    displayName?: string
  }
}

// 统一认证结果
export interface AuthenticationResult {
  success: boolean
  credential?: PublicKeyCredential
  session?: SessionInfo
  error?: WebAuthnError
  isNewUser?: boolean  // 标识是否是新用户注册
}

// 会话信息
export interface SessionInfo {
  session_token: string
  expires_at: string
  user: {
    id: string
    email?: string
    display_name?: string
  }
}

// 标准错误
export class WebAuthnError extends Error {
  constructor(
    message: string,
    public code: WebAuthnErrorCode,
    public details?: any
  ) {
    super(message)
  }
}

// 错误码定义
export enum WebAuthnErrorCode {
  // 基础错误
  NOT_SUPPORTED = 'NOT_SUPPORTED',
  INVALID_STATE = 'INVALID_STATE',
  
  // 注册相关
  REGISTRATION_FAILED = 'REGISTRATION_FAILED',
  DUPLICATE_REGISTRATION = 'DUPLICATE_REGISTRATION',
  
  // 认证相关
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  INVALID_CREDENTIAL = 'INVALID_CREDENTIAL',
  
  // 挑战相关
  INVALID_CHALLENGE = 'INVALID_CHALLENGE',
  CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED',
  
  // 用户相关
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_CANCELLED = 'USER_CANCELLED',
  
  // 系统错误
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR'
}
```

2. **API Schema 定义** (`@cadop-shared/src/schemas/webauthn.ts`)
```typescript
import { z } from 'zod'

// 认证选项请求 Schema
export const authenticationOptionsSchema = z.object({
  user_did: z.string().optional(),
  name: z.string().optional(),
  display_name: z.string().optional()
})

// 验证响应 Schema
export const verifySchema = z.object({
  response: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string().optional(),
      userHandle: z.string().optional(),
      attestationObject: z.string().optional(),
      transports: z.array(z.string()).optional()
    })
  })
})

// 凭证管理 Schema
export const credentialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().optional()
})
```

3. **导出文件** (`@cadop-shared/src/index.ts`)
```typescript
// 导出所有类型定义
export * from './types/webauthn'
// 导出所有 Schema 定义
export * from './schemas/webauthn'
```

### 3.2 接口重构

#### 后端 API
```typescript
// 基础配置
GET /webauthn/.well-known/webauthn  # WebAuthn 配置信息

// 统一认证流程
POST /webauthn/options             # 获取认证选项（自动处理注册/认证）
POST /webauthn/verify             # 验证响应（自动处理注册/认证）

// 凭证管理
GET /webauthn/credentials         # 获取凭证列表
DELETE /webauthn/credentials/:id  # 删除凭证

// 系统维护
POST /webauthn/cleanup           # 清理过期挑战（可选）
```

#### 前端服务
```typescript
class WebAuthnService {
  // 基础功能
  isSupported(): Promise<boolean>
  
  // 统一认证流程
  authenticate(options?: AuthenticationOptions): Promise<AuthenticationResult>
  
  // 凭证管理
  getCredentials(): Promise<PublicKeyCredentialDescriptor[]>
  removeCredential(id: string): Promise<boolean>
}
```

## 4. 实现建议

### 4.1 包组织结构

```
@cadop-shared/
├── src/
│   ├── types/
│   │   └── webauthn.ts    # 类型定义
│   ├── schemas/
│   │   └── webauthn.ts    # Schema 定义
│   └── index.ts           # 导出文件
├── package.json
└── tsconfig.json

@cadop-api/
├── src/
│   ├── routes/
│   │   └── webauthn.ts    # API 路由实现
│   └── services/
│       └── webauthnService.ts  # 服务实现
└── package.json

@cadop-web/
├── src/
│   └── lib/
│       └── webauthn/
│           └── webauthnService.ts  # 前端实现
└── package.json
```

### 4.2 模块化设计

```typescript
// 核心接口
interface WebAuthnProvider {
  createCredential(options: RegistrationOptions): Promise<RegistrationResult>
  getCredential(options: AuthenticationOptions): Promise<AuthenticationResult>
}

// 浏览器实现
class BrowserWebAuthnProvider implements WebAuthnProvider {
  // 实现浏览器特定的 WebAuthn 操作
}

// 服务端实现
class ServerWebAuthnProvider implements WebAuthnProvider {
  // 实现服务端特定的 WebAuthn 操作
}
```

### 4.3 文档规范

1. OpenAPI/Swagger 文档
   - 详细的 API 接口说明
   - 请求/响应示例
   - 错误码说明

2. 类型文档
   - 使用 TypeDoc 生成类型文档
   - 包含所有公开接口的说明

3. 使用示例
   - 基本使用流程
   - 常见场景示例
   - 错误处理示例

## 5. 迁移计划

### 5.1 第一阶段：接口调整
1. 创建新的接口端点
2. 废弃旧接口（可以只标注废弃，不删除）

### 5.2 第二阶段：类型重构
1. 创建类型定义包
2. 更新现有代码以使用新类型
3. 添加类型测试

### 5.3 第三阶段：错误处理
1. 实现新的错误处理机制
2. 更新错误返回格式
3. 添加错误处理文档

### 5.4 第四阶段：文档和测试
1. 添加集成测试
2. 清理旧代码
3. 生成 API 文档