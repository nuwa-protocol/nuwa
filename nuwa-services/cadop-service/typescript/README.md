# CADOP Service

CADOP (Custodian-Assisted DID Onboarding Protocol) Service 是一个基于 OpenID Connect 的身份提供商，专门为 Web3 应用提供 Agent DID 创建和管理服务。

## 功能特性

- 🔐 **OIDC 兼容**: 完全符合 OpenID Connect 1.0 规范
- 🌐 **多种认证方式**: 支持 Web2 OAuth、WebAuthn/Passkey 等
- 🤖 **Agent DID 创建**: 集成 @nuwa-identity-kit 创建和管理 Agent DID
- 🛡️ **Sybil 防护**: 基于多因素验证的 Sybil 等级计算
- 📜 **可验证凭证**: 支持 W3C 可验证凭证标准
- ⚡ **高性能**: 基于 Vercel Serverless 架构

## 技术栈

- **后端**: Node.js + TypeScript + Express
- **数据库**: Supabase (PostgreSQL)
- **认证**: Passport.js + WebAuthn
- **DID**: @nuwa-identity-kit
- **部署**: Vercel Serverless Functions

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 环境配置

1. 复制环境变量模板：
```bash
cp env.example .env
```

2. 配置必要的环境变量：
```bash
# Supabase 配置
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT 配置
JWT_SECRET=your-jwt-secret-key
JWT_ISSUER=https://your-domain.com
JWT_AUDIENCE=cadop-service

# 其他配置...
```

### 开发模式

```bash
npm run dev
```

服务将在 http://localhost:3000 启动。

### 构建和部署

```bash
# 构建
npm run build

# 生产模式启动
npm start

# 部署到 Vercel
vercel --prod
```

## API 文档

### 健康检查

- `GET /health` - 基础健康检查
- `GET /health/ready` - 就绪状态检查
- `GET /health/live` - 存活状态检查

### OIDC 端点

- `GET /auth/.well-known/openid-configuration` - OIDC 发现端点
- `GET /auth/.well-known/jwks.json` - JSON Web Key Set
- `GET /auth/authorize` - 授权端点
- `POST /auth/token` - 令牌端点
- `GET /auth/userinfo` - 用户信息端点

### Custodian API

- `POST /api/custodian/mint` - 创建 Agent DID
- `GET /api/custodian/status/:requestId` - 查询 DID 创建状态

### Proof API

- `POST /api/proof/request` - 请求 Web2 证明
- `POST /api/proof/verify` - 验证 Web2 证明

## 测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 开发指南

### 项目结构

```
src/
├── config/          # 配置文件
├── middleware/      # Express 中间件
├── routes/          # 路由处理器
├── services/        # 业务逻辑服务
├── utils/           # 工具函数
├── types/           # TypeScript 类型定义
└── test/            # 测试文件
```

### 代码规范

项目使用 ESLint 和 Prettier 进行代码格式化：

```bash
# 检查代码规范
npm run lint

# 自动修复
npm run lint:fix
```

### 类型检查

```bash
npm run type-check
```

## 部署

### Vercel 部署

1. 连接 GitHub 仓库到 Vercel
2. 配置环境变量
3. 自动部署

### 环境变量配置

在 Vercel 控制台中配置以下环境变量：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- 其他必要的配置...

## 监控和日志

- 使用 Winston 进行结构化日志记录
- 支持多种日志级别和格式
- 集成错误追踪和性能监控

## 安全考虑

- 输入验证和清理
- 速率限制
- CORS 配置
- 安全头设置
- JWT 令牌安全

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License

## 支持

如有问题，请创建 Issue 或联系开发团队。
