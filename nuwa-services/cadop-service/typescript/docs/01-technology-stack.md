# CADOP Service 技术选型方案

## 概述

CADOP (Custodian-Assisted DID Onboarding Protocol) Service 是一个基于 NIP-3 规范的 Web3 身份服务系统，提供身份提供商 (IdP)、托管商 (Custodian) 和 Web2 证明服务功能。

## 技术架构

### 整体架构
```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                        │
├─────────────────────────────────────────────────────────────┤
│                  API Gateway (Express)                     │
├─────────────────────────────────────────────────────────────┤
│    IdP Service    │  Custodian Service  │ Web2Proof Service │
├─────────────────────────────────────────────────────────────┤
│              Database Layer (Supabase)                     │
├─────────────────────────────────────────────────────────────┤
│                Blockchain Integration                       │
└─────────────────────────────────────────────────────────────┘
```

## 后端技术栈

### 核心框架
- **Node.js 18+**: 运行时环境
- **TypeScript 5.x**: 主要开发语言
- **Express.js**: Web 框架
- **Prisma**: ORM 和数据库管理
- **Jose**: JWT/JWS/JWK 处理库
- **Passport.js**: 认证中间件

### DID 和身份管理
- **@nuwa-identity-kit**: 核心 DID 库，实现 NIP-1 和 NIP-3 规范
- **did-resolver**: DID 解析器
- **@veramo/core**: 可验证凭证处理
- **@roochnetwork/rooch-sdk**: Rooch 区块链 SDK（通过 nuwa-identity-kit 集成）

### 身份认证相关
- **@simplewebauthn/server**: WebAuthn/Passkey 服务端实现
- **openid-client**: OIDC 客户端库
- **passport-google-oauth20**: Google OAuth 支持
- **passport-twitter**: Twitter OAuth 支持
- **passport-github2**: GitHub OAuth 支持

### 数据存储
- **Supabase**: 后端即服务 (BaaS) 平台
  - PostgreSQL 数据库
  - 实时订阅功能
  - 内置认证和行级安全
  - RESTful API 和 GraphQL 支持
- **@supabase/supabase-js**: Supabase JavaScript 客户端
- **@prisma/client**: 数据库客户端（适配 Supabase）

### 区块链集成
- **@noble/hashes**: 密码学哈希函数
- **@noble/secp256k1**: 椭圆曲线密码学
- **ethers.js v6**: 以太坊兼容链支持

### 验证和安全
- **joi**: 输入验证
- **helmet**: 安全头设置
- **cors**: 跨域资源共享
- **rate-limiter-flexible**: 速率限制
- **bcrypt**: 密码哈希

### 工具库
- **uuid**: UUID 生成
- **qrcode**: 二维码生成
- **nodemailer**: 邮件发送
- **twilio**: SMS 发送
- **winston**: 日志管理

## 前端技术栈

### 核心框架
- **React 18**: UI 框架
- **TypeScript**: 类型系统
- **Vite**: 构建工具
- **React Router v6**: 路由管理

### UI 组件
- **Ant Design**: UI 组件库
- **@ant-design/icons**: 图标库
- **styled-components**: CSS-in-JS
- **framer-motion**: 动画库

### 状态管理
- **Zustand**: 轻量级状态管理
- **TanStack Query**: 服务端状态管理
- **React Hook Form**: 表单管理

### 身份认证集成
- **@simplewebauthn/browser**: WebAuthn/Passkey 客户端
- **@nuwa-identity-kit**: DID 操作和 CADOP 集成
- **crypto-js**: 客户端加密

### 工具库
- **axios**: HTTP 客户端
- **dayjs**: 日期处理
- **qr-scanner**: 二维码扫描

## 开发和部署

### 开发工具
- **ESLint**: 代码检查
- **Prettier**: 代码格式化
- **Husky**: Git hooks
- **Jest**: 单元测试
- **Supertest**: API 测试
- **Playwright**: E2E 测试

### 构建和部署
- **Vercel**: 主要部署平台 (Serverless Functions)
- **Docker**: 容器化 (可选，用于自托管)
- **Docker Compose**: 本地开发环境
- **GitHub Actions**: CI/CD
- **Nginx**: 反向代理 (自托管场景)
- **Let's Encrypt**: SSL 证书 (自托管场景)

## Vercel 部署特殊要求

### 1. Serverless 架构适配

#### 1.1 项目结构调整 (Vercel 优化)
```
typescript/
├── api/                   # Vercel API Routes (Serverless Functions)
│   ├── auth/
│   │   ├── authorize.ts   # GET /api/auth/authorize
│   │   ├── token.ts       # POST /api/auth/token
│   │   └── userinfo.ts    # GET /api/auth/userinfo
│   ├── custodian/
│   │   ├── mint.ts        # POST /api/custodian/mint
│   │   └── [...params].ts # 动态路由处理
│   ├── web2proof/
│   │   ├── request.ts     # POST /api/web2proof/request
│   │   └── verify.ts      # POST /api/web2proof/verify
│   ├── did/
│   │   └── resolve/
│   │       └── [did].ts   # GET /api/did/resolve/[did]
│   └── .well-known/
│       ├── did.json.ts    # GET /.well-known/did.json
│       ├── openid-configuration.ts
│       └── jwks.json.ts
├── public/                # 静态文件
│   └── frontend/          # 构建后的前端资源
├── src/                   # 共享业务逻辑
│   ├── modules/
│   │   ├── idp/
│   │   ├── custodian/
│   │   ├── web2proof/
│   │   └── common/
│   ├── utils/
│   ├── types/
│   └── config/
├── vercel.json            # Vercel 配置文件
├── next.config.js         # Next.js 配置 (如果使用)
└── package.json
```

#### 1.2 Vercel 配置文件 (vercel.json)
```json
{
  "version": 2,
  "name": "cadop-service",
  "regions": ["hkg1", "sfo1", "fra1"],
  "functions": {
    "api/**/*.ts": {
      "runtime": "nodejs18.x",
      "maxDuration": 30
    }
  },
  "routes": [
    {
      "src": "/.well-known/(.*)",
      "dest": "/api/.well-known/$1"
    },
    {
      "src": "/auth/(.*)",
      "dest": "/api/auth/$1"
    },
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/public/frontend/$1"
    }
  ],
  "env": {
    "NODE_ENV": "production",
    "SUPABASE_URL": "@supabase-url",
    "SUPABASE_ANON_KEY": "@supabase-anon-key",
    "SUPABASE_SERVICE_ROLE_KEY": "@supabase-service-role-key"
  },
  "build": {
    "env": {
      "SKIP_ENV_VALIDATION": "1"
    }
  }
}
```

### 2. Serverless Functions 优化

#### 2.1 冷启动优化
```typescript
// api/custodian/mint.ts - Vercel Serverless Function
import { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { NuwaIdentityKit } from '@nuwa-identity-kit'

// 全局变量缓存，减少冷启动开销
let supabaseClient: any = null
let identityKit: any = null

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false }, // Serverless 环境不持久化会话
        global: { 
          headers: { 'x-application-name': 'cadop-vercel' }
        }
      }
    )
  }
  return supabaseClient
}

function getIdentityKit() {
  if (!identityKit) {
    identityKit = new NuwaIdentityKit({
      vdrs: [/* VDR 配置 */]
    })
  }
  return identityKit
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // 启用 CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  
  try {
    const supabase = getSupabaseClient()
    const kit = getIdentityKit()
    
    // 业务逻辑处理
    const result = await kit.createDIDViaCADOP(req.body)
    
    // 记录到 Supabase
    await supabase.from('dids').insert({
      user_id: req.body.userId,
      did_identifier: result.agentDid,
      did_document: result.didDocument,
      transaction_hash: result.transactionHash,
      status: 'pending'
    })
    
    res.json({ success: true, data: result })
  } catch (error) {
    console.error('DID creation failed:', error)
    res.status(500).json({ 
      success: false, 
      error: { code: 'INTERNAL_ERROR', message: error.message }
    })
  }
}

// 配置函数
export const config = {
  runtime: 'nodejs18.x',
  maxDuration: 30,
  regions: ['hkg1'] // 香港区域，适合亚洲用户
}
```

#### 2.2 Edge Runtime 适配 (适用于简单处理)
```typescript
// api/auth/userinfo.ts - 使用 Vercel Edge Runtime
import type { NextRequest } from 'next/server'

export const config = {
  runtime: 'edge',
  regions: ['hkg1', 'sfo1', 'fra1']
}

export default async function handler(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'No token provided' }),
      { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
  
  try {
    // 轻量级 JWT 验证（Edge Runtime 限制）
    const payload = await verifyJWT(token)
    
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          sub: payload.sub,
          sybil_level: payload.sybil_level
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
```

### 3. 环境变量和密钥管理

#### 3.1 Vercel 环境变量配置
```bash
# 使用 Vercel CLI 配置环境变量
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production  
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add ROOCH_NETWORK_URL production
vercel env add JWT_SECRET production
vercel env add CUSTODIAN_PRIVATE_KEY production

# 开发环境
vercel env add SUPABASE_URL development
vercel env add SUPABASE_ANON_KEY development
# ... 其他环境变量
```

#### 3.2 密钥安全存储
```typescript
// src/config/vercel.ts - Vercel 专用配置
export const vercelConfig = {
  // 从 Vercel 环境变量读取
  supabase: {
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!
  },
  
  // 区块链配置
  blockchain: {
    roochNetworkUrl: process.env.ROOCH_NETWORK_URL!,
    custodianPrivateKey: process.env.CUSTODIAN_PRIVATE_KEY!
  },
  
  // JWT 配置
  jwt: {
    secret: process.env.JWT_SECRET!,
    issuer: 'https://cadop-service.vercel.app'
  },
  
  // Vercel 特定配置
  vercel: {
    region: process.env.VERCEL_REGION || 'hkg1',
    url: process.env.VERCEL_URL || 'localhost:3000',
    env: process.env.VERCEL_ENV || 'development'
  }
}

// 验证必需的环境变量
export function validateEnvironment() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ROOCH_NETWORK_URL',
    'JWT_SECRET'
  ]
  
  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
```

### 4. 性能优化和限制

#### 4.1 Vercel 限制应对
```typescript
// 处理 Vercel Serverless 限制
interface VercelLimits {
  functionTimeout: 30; // 秒
  functionMemory: 1024; // MB
  functionPayload: 4.5; // MB
  edgeTimeout: 30; // 秒
  edgeMemory: 128; // MB
}

// 分块处理大量数据
export async function processBatchDIDs(dids: string[]) {
  const BATCH_SIZE = 10 // 避免超时
  const results = []
  
  for (let i = 0; i < dids.length; i += BATCH_SIZE) {
    const batch = dids.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(did => resolveDID(did))
    )
    results.push(...batchResults)
    
    // 避免内存溢出
    if (results.length > 1000) {
      break
    }
  }
  
  return results
}
```

#### 4.2 缓存策略优化
```typescript
// api/_middleware.ts - Vercel 中间件缓存
import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const response = NextResponse.next()
  
  // 为静态内容设置缓存头
  if (req.nextUrl.pathname.startsWith('/.well-known/')) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=3600, s-maxage=3600'
    )
  }
  
  // 为 API 响应设置缓存
  if (req.nextUrl.pathname.startsWith('/api/did/resolve/')) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=300, s-maxage=300'
    )
  }
  
  return response
}

export const config = {
  matcher: ['/.well-known/:path*', '/api/did/resolve/:path*']
}
```

### 5. 前端集成 (在 Vercel 上)

#### 5.1 前端构建配置
```typescript
// next.config.js (如果使用 Next.js)
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // 优化 Vercel 部署
  
  // API 重写到后端 Serverless Functions
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*'
      }
    ]
  },
  
  // 环境变量
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    NEXT_PUBLIC_CADOP_API_URL: process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
  },
  
  // 优化构建
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  }
}

module.exports = nextConfig
```

### 6. 部署脚本和 CI/CD

#### 6.1 Vercel 部署配置
```bash
#!/bin/bash
# scripts/deploy-vercel.sh

echo "🚀 Deploying CADOP Service to Vercel..."

# 构建前端
echo "📦 Building frontend..."
cd apps/frontend
npm run build
cd ../..

# 复制构建文件到 public 目录
cp -r apps/frontend/dist public/frontend

# 部署到 Vercel
echo "🚁 Deploying to Vercel..."
vercel --prod

echo "✅ Deployment completed!"
```

#### 6.2 GitHub Actions 集成
```yaml
# .github/workflows/vercel-deploy.yml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Build frontend
      run: |
        cd apps/frontend
        npm run build
        cd ../..
        cp -r apps/frontend/dist public/frontend
    
    - name: Deploy to Vercel
      uses: vercel/action@v1
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
        vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
        vercel-args: '--prod'
```

## 项目结构

```
typescript/
├── apps/
│   ├── backend/           # 后端应用
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── idp/           # 身份提供商模块
│   │   │   │   ├── custodian/     # 托管商模块
│   │   │   │   ├── web2proof/     # Web2证明模块
│   │   │   │   ├── auth/          # 认证模块
│   │   │   │   ├── did/           # DID管理模块
│   │   │   │   └── common/        # 通用模块
│   │   │   ├── config/            # 配置
│   │   │   ├── utils/             # 工具函数
│   │   │   └── types/             # 类型定义
│   │   ├── prisma/                # 数据库模型
│   │   ├── supabase/              # Supabase 配置和迁移
│   │   ├── tests/                 # 测试文件
│   │   └── docker/                # Docker 配置
│   └── frontend/          # 前端应用
│       ├── src/
│       │   ├── components/        # UI 组件
│       │   ├── pages/             # 页面组件
│       │   ├── hooks/             # 自定义 hooks
│       │   ├── services/          # API 服务
│       │   ├── stores/            # 状态管理
│       │   ├── types/             # 类型定义
│       │   └── utils/             # 工具函数
│       ├── public/                # 静态资源
│       └── tests/                 # 测试文件
├── packages/
│   ├── shared/            # 共享类型和工具
│   └── sdk/               # 客户端 SDK
├── docs/                  # 文档
├── scripts/               # 脚本文件
└── docker-compose.yml     # 开发环境配置
```

## 环境配置

### 开发环境
- Node.js 18+
- Supabase CLI
- Docker & Docker Compose

### 生产环境
- Kubernetes 或 Docker Swarm
- 负载均衡器 (Nginx/HAProxy)
- 监控系统 (Prometheus + Grafana)
- 日志聚合 (ELK Stack)

## Supabase 集成

### 数据库功能
- **PostgreSQL**: 关系型数据库，支持 JSON 字段
- **实时订阅**: WebSocket 实时数据更新
- **行级安全 (RLS)**: 细粒度的数据访问控制
- **全文搜索**: 内置全文搜索功能

### 认证功能
- **内置认证**: 支持多种认证方式
- **JWT 管理**: 自动 Token 管理和刷新
- **用户管理**: 完整的用户生命周期管理

### API 功能
- **RESTful API**: 自动生成的 REST 端点
- **GraphQL**: 可选的 GraphQL 接口
- **边缘函数**: Serverless 函数支持

### 配置示例
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})
```

## @nuwa-identity-kit 集成

### 核心功能
- **DID 创建和管理**: 支持多种 DID 方法
- **CADOP 协议**: 完整的托管商辅助 DID 创建流程
- **密钥管理**: 安全的密钥生成和管理
- **VDR 抽象**: 统一的可验证数据注册接口

### 使用示例
```typescript
import { NuwaIdentityKit, RoochVDR } from '@nuwa-identity-kit'

// 初始化身份工具包
const identityKit = new NuwaIdentityKit({
  vdrs: [
    new RoochVDR({
      networkUrl: process.env.ROOCH_NETWORK_URL,
      privateKey: process.env.CUSTODIAN_PRIVATE_KEY
    })
  ]
})

// CADOP DID 创建
async function createDIDViaCADOP(userDidKey: string, publicKey: JsonWebKey) {
  const result = await identityKit.createDIDViaCADOP({
    userDidKey,
    custodianServicePublicKey: await getCustodianPublicKey(),
    custodianServiceVMType: 'Ed25519VerificationKey2020'
  })
  
  return result
}
```

## 安全考虑

### 密钥管理
- 使用 Supabase Vault 管理敏感密钥
- JWT 签名密钥轮换机制
- DID 控制密钥的安全存储

### 网络安全
- HTTPS/TLS 1.3 强制使用
- 严格的 CORS 策略
- API 速率限制
- DDoS 防护

### 数据保护
- 利用 Supabase RLS 进行数据隔离
- 敏感数据加密存储
- 符合 GDPR/CCPA 要求
- 数据备份和恢复策略
- 审计日志记录

## 性能优化

### 缓存策略
- Supabase 内置查询缓存
- CDN 加速静态资源
- 数据库查询优化
- 连接池管理

### 扩展性
- 微服务架构支持
- Supabase 自动扩展
- 异步任务处理
- 消息队列支持

## 监控和运维

### 应用监控
- Supabase 内置监控面板
- APM (Application Performance Monitoring)
- 错误追踪和报警
- 业务指标监控
- SLA 监控

### 日志管理
- 结构化日志
- Supabase 日志聚合
- 日志分析和搜索
- 合规性日志保留 