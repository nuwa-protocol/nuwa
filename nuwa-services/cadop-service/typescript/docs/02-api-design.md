# CADOP Service API 接口设计

## 概述

本文档定义了基于 Supabase 和 @nuwa-identity-kit 的 CADOP Service 完整 API 接口规范，包括身份提供商 (IdP)、托管商 (Custodian) 和 Web2 证明服务的所有端点。

## 基础信息

### 基础 URL
- 开发环境: `https://cadop-dev.nuwa.network`
- 生产环境: `https://cadop.nuwa.network`

### 通用响应格式

#### 成功响应
```json
{
  "success": true,
  "data": {},
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### 错误响应
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description",
    "details": {}
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 错误代码定义

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `INVALID_REQUEST` | 请求参数无效 |
| 401 | `INVALID_TOKEN` | Token 验证失败 |
| 403 | `PERMISSION_DENIED` | 权限不足 |
| 403 | `UNTRUSTED_ISSUER` | 不受信任的颁发者 |
| 403 | `AUDIENCE_MISMATCH` | 受众不匹配 |
| 403 | `SUBJECT_KEY_MISMATCH` | 主体密钥不匹配 |
| 403 | `INSUFFICIENT_SYBIL_LEVEL` | Sybil 等级不足 |
| 429 | `QUOTA_EXCEEDED` | 配额超限 |
| 500 | `INTERNAL_ERROR` | 内部服务器错误 |
| 500 | `SUPABASE_ERROR` | Supabase 服务错误 |
| 500 | `BLOCKCHAIN_ERROR` | 区块链操作错误 |

## 1. DID 发现和元数据 API

### 1.1 获取服务 DID 文档
```http
GET /.well-known/did.json
```

**响应示例:**
```json
{
  "@context": "https://www.w3.org/ns/did/v1",
  "id": "did:rooch:0x123...abc",
  "service": [
    {
      "id": "did:rooch:0x123...abc#cadop-idp",
      "type": "CadopIdPService",
      "serviceEndpoint": "https://cadop.nuwa.network",
      "metadata": {
        "name": "Nuwa Identity Provider",
        "jwks_uri": "https://cadop.nuwa.network/.well-known/jwks.json",
        "issuer_did": "did:rooch:0x123...abc"
      }
    },
    {
      "id": "did:rooch:0x123...abc#cadop-custodian",
      "type": "CadopCustodianService",
      "serviceEndpoint": "https://cadop.nuwa.network/api/custodian",
      "metadata": {
        "name": "Nuwa Custodian Service",
        "auth_methods": [1, 3, 4, 7],
        "sybilLevel": 2,
        "maxDailyMints": 1000
      }
    },
    {
      "id": "did:rooch:0x123...abc#web2proof",
      "type": "Web2ProofServiceCADOP",
      "serviceEndpoint": "https://cadop.nuwa.network/api/web2proof",
      "metadata": {
        "name": "Nuwa Web2 Proof Service",
        "accepts": ["GoogleOAuthProof", "PasskeyAssertion", "TwitterOAuthProof"],
        "supportedClaims": ["EmailVerifiedCredential", "TwitterHandleCredential", "PasskeyOwnershipCredential"]
      }
    }
  ]
}
```

## 2. Identity Provider (IdP) API

### 2.1 OIDC 发现端点
```http
GET /.well-known/openid-configuration
```

**响应示例:**
```json
{
  "issuer": "https://cadop.nuwa.network",
  "authorization_endpoint": "https://cadop.nuwa.network/auth/authorize",
  "token_endpoint": "https://cadop.nuwa.network/auth/token",
  "jwks_uri": "https://cadop.nuwa.network/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "scopes_supported": ["openid", "did"],
  "claims_supported": ["sub", "iss", "aud", "exp", "iat", "jti", "nonce", "pub_jwk", "sybil_level"],
  "code_challenge_methods_supported": ["S256"]
}
```

### 2.2 获取 JWK Set
```http
GET /.well-known/jwks.json
```

**响应示例:**
```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
      "use": "sig",
      "kid": "cadop-idp-key-1"
    }
  ]
}
```

### 2.3 授权端点
```http
GET /auth/authorize
```

**查询参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| scope | string | 是 | 必须包含 "openid did" |
| response_type | string | 是 | 必须为 "code" |
| client_id | string | 是 | 客户端 ID |
| redirect_uri | string | 是 | 回调 URI |
| state | string | 是 | Base64URL 编码的 JSON，包含 custodianDid 和 nonce |
| code_challenge | string | 是 | PKCE 代码挑战 |
| code_challenge_method | string | 是 | 通常为 "S256" |

**state 参数示例:**
```json
{
  "custodianDid": "did:rooch:0x123...abc",
  "nonce": "random-nonce-value",
  "clientData": {}
}
```

### 2.4 令牌端点
```http
POST /auth/token
```

**请求体:**
```json
{
  "grant_type": "authorization_code",
  "code": "auth_code_from_authorize",
  "redirect_uri": "https://client.example.com/callback",
  "client_id": "client_123",
  "code_verifier": "pkce_code_verifier"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "token_type": "Bearer",
    "expires_in": 300,
    "id_token": "eyJ..."
  }
}
```

**ID Token 载荷示例:**
```json
{
  "iss": "https://cadop.nuwa.network",
  "sub": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "aud": "did:rooch:0x123...abc",
  "exp": 1642248000,
  "iat": 1642244700,
  "jti": "550e8400-e29b-41d4-a716-446655440000",
  "nonce": "random-nonce-value",
  "pub_jwk": {
    "kty": "OKP",
    "crv": "Ed25519",
    "x": "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"
  },
  "sybil_level": 2
}
```

### 2.5 用户信息端点
```http
GET /auth/userinfo
Authorization: Bearer {access_token}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "sub": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
    "sybil_level": 2,
    "auth_methods": [1, 3],
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

## 3. Custodian Service API

### 3.1 DID 铸造请求 (基于 @nuwa-identity-kit)
```http
POST /api/custodian/mint
Content-Type: application/json
```

**请求体:**
```json
{
  "userDidKey": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "publicKey": {
    "kty": "OKP",
    "crv": "Ed25519",
    "x": "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"
  },
  "idToken": "eyJ...",
  "web2Proofs": [
    {
      "type": "EmailVerifiedCredential",
      "credential": "eyJ..."
    }
  ]
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "agentDid": "did:rooch:0x456...def",
    "transactionHash": "0xabc...123",
    "didDocument": {
      "@context": "https://www.w3.org/ns/did/v1",
      "id": "did:rooch:0x456...def",
      "controller": "did:rooch:0x456...def",
      "verificationMethod": [
        {
          "id": "did:rooch:0x456...def#key-1",
          "type": "Ed25519VerificationKey2020",
          "controller": "did:rooch:0x456...def",
          "publicKeyMultibase": "z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"
        },
        {
          "id": "did:rooch:0x456...def#custodian-key",
          "type": "Ed25519VerificationKey2020",
          "controller": "did:rooch:0x123...abc",
          "publicKeyMultibase": "z6MkpTHR8VNsBxYAAWHut2Geadd9CAcVbvLisXCptQKAYBmD"
        }
      ],
      "authentication": ["did:rooch:0x456...def#key-1"],
      "capabilityDelegation": ["did:rooch:0x456...def#key-1"],
      "capabilityInvocation": ["did:rooch:0x456...def#custodian-key"]
    },
    "debug": {
      "events": ["DIDCreated", "VerificationMethodAdded"],
      "blockHeight": 12345
    }
  }
}
```

### 3.2 获取铸造状态
```http
GET /api/custodian/mint/{transactionHash}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "status": "confirmed",
    "agentDid": "did:rooch:0x456...def",
    "transactionHash": "0xabc...123",
    "blockNumber": 12345,
    "gasUsed": "21000",
    "supabaseRecord": {
      "id": "uuid-123",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:32:00Z"
    }
  }
}
```

### 3.3 获取用户 DID 历史 (Supabase 查询)
```http
GET /api/custodian/user/{userDid}/dids
```

**响应:**
```json
{
  "success": true,
  "data": {
    "dids": [
      {
        "agentDid": "did:rooch:0x456...def",
        "userDid": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
        "createdAt": "2024-01-15T10:30:00Z",
        "sybilLevel": 2,
        "status": "active",
        "transactionHash": "0xabc...123",
        "blockHeight": 12345
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 10
    }
  }
}
```

### 3.4 撤销托管服务
```http
POST /api/custodian/revoke
Content-Type: application/json
Authorization: Bearer {access_token}
```

**请求体:**
```json
{
  "agentDid": "did:rooch:0x456...def",
  "verificationMethodId": "did:rooch:0x456...def#custodian-key",
  "signature": {
    "type": "Ed25519Signature2020",
    "created": "2024-01-15T10:30:00Z",
    "verificationMethod": "did:rooch:0x456...def#key-1",
    "proofValue": "z58DAdFfa9CkPiW6dmBZzCY..."
  }
}
```

## 4. Web2 Proof Service API

### 4.1 获取支持的证明类型
```http
GET /api/web2proof/supported-claims
```

**响应:**
```json
{
  "success": true,
  "data": {
    "claims": [
      {
        "type": "EmailVerifiedCredential",
        "description": "邮箱验证凭证",
        "authMethods": [1, 3, 4],
        "sybilLevel": 1,
        "schema": "https://schemas.nuwa.network/EmailVerifiedCredential"
      },
      {
        "type": "TwitterHandleCredential",
        "description": "Twitter 账号凭证",
        "authMethods": [2],
        "sybilLevel": 2,
        "schema": "https://schemas.nuwa.network/TwitterHandleCredential"
      },
      {
        "type": "PasskeyOwnershipCredential",
        "description": "Passkey 所有权凭证",
        "authMethods": [7],
        "sybilLevel": 3,
        "schema": "https://schemas.nuwa.network/PasskeyOwnershipCredential"
      }
    ]
  }
}
```

### 4.2 发起证明请求
```http
POST /api/web2proof/request
Content-Type: application/json
```

**请求体:**
```json
{
  "userDid": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "claimType": "EmailVerifiedCredential",
  "authMethod": 1,
  "callbackUrl": "https://client.example.com/proof-callback"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "proofRequestId": "req_123abc",
    "authUrl": "https://accounts.google.com/oauth/authorize?...",
    "expiresAt": "2024-01-15T11:00:00Z",
    "supabaseRecord": {
      "id": "uuid-456",
      "status": "pending"
    }
  }
}
```

### 4.3 获取证明状态 (实时订阅支持)
```http
GET /api/web2proof/request/{proofRequestId}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "credential": "eyJ...",
    "claimData": {
      "email": "user@example.com",
      "verified": true,
      "verifiedAt": "2024-01-15T10:45:00Z"
    },
    "supabaseUpdatedAt": "2024-01-15T10:45:30Z"
  }
}
```

### 4.4 实时订阅证明状态 (Supabase Realtime)
```javascript
// WebSocket 连接示例
const supabase = createClient(supabaseUrl, supabaseKey)

const subscription = supabase
  .channel('proof-requests')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'proof_requests',
    filter: `id=eq.${proofRequestId}`
  }, (payload) => {
    console.log('Proof status updated:', payload.new)
  })
  .subscribe()
```

### 4.5 验证可验证凭证
```http
POST /api/web2proof/verify
Content-Type: application/json
```

**请求体:**
```json
{
  "credential": "eyJ...",
  "challenge": "random-challenge"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "issuer": "did:rooch:0x123...abc",
    "subject": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
    "claimType": "EmailVerifiedCredential",
    "issuedAt": "2024-01-15T10:45:00Z",
    "expiresAt": "2024-01-16T10:45:00Z",
    "verificationMethod": "did:rooch:0x123...abc#web2proof-key"
  }
}
```

## 5. DID 管理 API (基于 @nuwa-identity-kit)

### 5.1 解析 DID
```http
GET /api/did/resolve/{did}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "didDocument": {
      "@context": "https://www.w3.org/ns/did/v1",
      "id": "did:rooch:0x456...def",
      "controller": "did:rooch:0x456...def",
      "verificationMethod": [...],
      "authentication": [...],
      "capabilityDelegation": [...],
      "capabilityInvocation": [...],
      "service": [...]
    },
    "metadata": {
      "versionId": "1",
      "created": "2024-01-15T10:30:00Z",
      "updated": "2024-01-15T10:30:00Z"
    }
  }
}
```

### 5.2 更新 DID 文档
```http
PUT /api/did/{did}
Content-Type: application/json
Authorization: Bearer {access_token}
```

**请求体:**
```json
{
  "operation": "addVerificationMethod",
  "params": {
    "verificationMethod": {
      "id": "did:rooch:0x456...def#key-2",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:rooch:0x456...def",
      "publicKeyMultibase": "z6Mk..."
    },
    "relationships": ["authentication"]
  },
  "signature": {
    "type": "Ed25519Signature2020",
    "created": "2024-01-15T10:30:00Z",
    "verificationMethod": "did:rooch:0x456...def#key-1",
    "proofValue": "z58DAdFfa9CkPiW6dmBZzCY..."
  }
}
```

## 6. 认证和授权 API

### 6.1 注册客户端应用 (Supabase 存储)
```http
POST /api/auth/clients
Content-Type: application/json
```

**请求体:**
```json
{
  "name": "My DApp",
  "redirectUris": ["https://mydapp.example.com/callback"],
  "description": "A sample DApp using CADOP",
  "website": "https://mydapp.example.com"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "clientId": "client_123abc",
    "clientSecret": "secret_456def",
    "name": "My DApp",
    "redirectUris": ["https://mydapp.example.com/callback"],
    "createdAt": "2024-01-15T10:30:00Z",
    "supabaseId": "uuid-789"
  }
}
```

### 6.2 管理用户会话 (Supabase Auth)
```http
GET /api/auth/session
Authorization: Bearer {access_token}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "userId": "user_123",
    "userDid": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
    "sessionId": "sess_abc123",
    "createdAt": "2024-01-15T10:30:00Z",
    "expiresAt": "2024-01-15T18:30:00Z",
    "authMethods": [1, 3],
    "supabaseSession": {
      "access_token": "sb-access-token",
      "refresh_token": "sb-refresh-token",
      "expires_at": 1642262400
    }
  }
}
```

## 7. 实时通知 API (Supabase Realtime)

### 7.1 订阅 DID 状态更新
```javascript
const supabase = createClient(supabaseUrl, supabaseKey)

// 订阅用户的 DID 状态变化
const didSubscription = supabase
  .channel('user-dids')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'dids',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    console.log('DID status changed:', payload)
  })
  .subscribe()
```

### 7.2 订阅区块链交易状态
```javascript
// 订阅交易状态变化
const txSubscription = supabase
  .channel('transactions')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'transactions',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    if (payload.new.status === 'confirmed') {
      console.log('Transaction confirmed:', payload.new)
    }
  })
  .subscribe()
```

## 8. 管理 API

### 8.1 获取服务统计 (Supabase 聚合查询)
```http
GET /api/admin/stats
Authorization: Bearer {admin_token}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 1234,
    "totalDids": 987,
    "dailyMints": 45,
    "sybilLevelDistribution": {
      "0": 100,
      "1": 300,
      "2": 500,
      "3": 87
    },
    "authMethodUsage": {
      "1": 600,
      "3": 300,
      "4": 87
    },
    "blockchainStats": {
      "totalTransactions": 987,
      "pendingTransactions": 5,
      "failedTransactions": 12
    },
    "supabaseMetrics": {
      "apiCalls": 12345,
      "realtimeConnections": 23,
      "storageUsed": "145.6MB"
    }
  }
}
```

## 9. SDK 使用示例

### 9.1 TypeScript SDK (集成 @nuwa-identity-kit)
```typescript
import { CadopClient } from '@nuwa/cadop-sdk'
import { NuwaIdentityKit, RoochVDR } from '@nuwa-identity-kit'

const client = new CadopClient({
  baseUrl: 'https://cadop.nuwa.network',
  clientId: 'your_client_id',
  supabaseConfig: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY
  }
})

// 初始化身份工具包
const identityKit = new NuwaIdentityKit({
  vdrs: [
    new RoochVDR({
      networkUrl: process.env.ROOCH_NETWORK_URL
    })
  ]
})

// 发起 DID 创建流程
const result = await client.createDid({
  userDid: 'did:key:z6Mk...',
  publicKey: publicKeyJwk,
  sybilLevel: 2
})

console.log('New Agent DID:', result.agentDid)
```

### 9.2 实时状态监听
```typescript
// 监听 DID 创建状态
client.subscribeToDidStatus(transactionHash, (status) => {
  console.log('DID creation status:', status)
  
  if (status.status === 'confirmed') {
    console.log('DID created successfully:', status.agentDid)
  }
})
```

## 10. 性能和限制

### 10.1 Supabase 限制
- **免费版**: 500MB 数据库空间，50k 月活用户
- **专业版**: 8GB 数据库空间，100k 月活用户
- **实时连接**: 最多 200 个并发连接

### 10.2 速率限制

| 端点分组 | 限制 | 窗口期 | 基于 |
|----------|------|--------|------|
| 认证端点 | 10 次/分钟 | 每 IP | API Gateway |
| DID 铸造 | 5 次/小时 | 每用户 | Supabase RLS |
| 证明请求 | 20 次/小时 | 每用户 | Supabase + 内存 |
| 查询端点 | 100 次/分钟 | 每用户 | Supabase 自带 |

### 10.3 限制响应头
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248000
X-Supabase-RateLimit: true
```

## 11. 错误处理和重试

### 11.1 区块链操作重试
```typescript
interface RetryConfig {
  maxRetries: 3
  backoffMultiplier: 2
  initialDelay: 1000
}

// 自动重试失败的区块链交易
async function createDIDWithRetry(request: CadopOnboardingRequest) {
  return await retryOperation(() => 
    identityKit.createDIDViaCADOP(request),
    retryConfig
  )
}
```

### 11.2 Supabase 连接恢复
```typescript
// 自动重连 Realtime 订阅
supabase.channel('user-updates')
  .on('system', {}, (payload) => {
    if (payload.event === 'DISCONNECT') {
      console.log('Disconnected from Supabase Realtime')
      // 自动重连逻辑
    }
  })
  .subscribe()
```

这个更新后的 API 设计文档完全集成了 Supabase 和 @nuwa-identity-kit，提供了完整的实时功能、更好的错误处理，以及针对新技术栈的优化设计。 