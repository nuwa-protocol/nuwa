# CADOP Service 数据库

本目录包含 CADOP Service 的数据库模式、迁移脚本和种子数据。

## 目录结构

```
database/
├── migrations/          # 数据库迁移脚本
│   ├── 001_initial_schema.sql         # 初始数据库模式
│   └── 002_row_level_security.sql     # 行级安全策略
├── seeds/              # 测试数据种子
│   └── 001_test_data.sql              # 测试用户数据
└── README.md           # 本文档
```

## 环境配置

在使用数据库功能之前，请确保已经配置了正确的 Supabase 连接信息：

1. 复制 `env.example` 到 `.env`
2. 配置以下 Supabase 环境变量：
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

## 数据库管理命令

### 运行迁移
```bash
npm run db:migrate
```
执行所有未应用的数据库迁移。

### 添加测试数据
```bash
npm run db:seed
```
向数据库添加测试用户和示例数据。

### 检查数据库状态
```bash
npm run db:status
```
显示当前数据库表和已应用的迁移。

### 重置数据库
```bash
npm run db:reset
```
⚠️ **危险操作** - 删除所有数据并重新运行迁移。

### 快速设置
```bash
npm run db:setup
```
运行迁移并添加测试数据（等同于 `db:migrate` + `db:seed`）。

## 数据库模式

### 主要数据表

#### users - 用户账户
- `id`: 用户唯一标识 (UUID)
- `email`: 用户邮箱 (可选)
- `sybil_level`: Sybil 抗性等级 (0-100)
- `status`: 用户状态 (active/inactive/suspended)
- `profile`: 用户资料 (JSONB)

#### user_identities - 用户身份认证
- `user_id`: 关联用户 ID
- `provider`: 认证提供商 (google/github/twitter/apple/webauthn)
- `provider_id`: 提供商用户 ID
- `provider_data`: 提供商数据 (JSONB)

#### agent_dids - Agent DID 记录
- `user_id`: 关联用户 ID
- `did`: DID 标识符
- `status`: 创建状态 (pending/creating/confirmed/failed)
- `tx_hash`: 区块链交易哈希
- `block_height`: 区块高度

#### proof_requests - 证明请求
- `user_id`: 关联用户 ID
- `requester`: 请求方标识
- `proof_type`: 证明类型
- `status`: 处理状态
- `request_data`: 请求数据 (JSONB)
- `proof_data`: 证明数据 (JSONB)

#### sessions - 用户会话
- `user_id`: 关联用户 ID
- `token`: 会话令牌
- `expires_at`: 过期时间
- `user_agent`: 用户代理
- `ip_address`: IP 地址

### 行级安全 (RLS)

数据库启用了行级安全策略，确保：
- 用户只能访问自己的数据
- 服务角色可以访问所有数据
- 匿名用户只能读取公开数据

### 视图和函数

#### user_profile 视图
提供用户完整信息的聚合视图，包括身份认证和 DID 信息。

#### 清理函数
- `cleanup_expired_sessions()`: 清理过期会话
- `cleanup_expired_proof_requests()`: 标记过期的证明请求

## 开发注意事项

1. **迁移脚本**：新的迁移脚本应该使用递增的编号命名，如 `003_new_feature.sql`
2. **测试数据**：不要在生产环境中运行种子脚本
3. **备份**：在运行 `db:reset` 之前确保备份重要数据
4. **权限**：确保使用具有适当权限的 Supabase 服务角色密钥

## 故障排除

### 连接错误
- 检查 Supabase URL 和密钥是否正确
- 确认网络连接正常
- 验证 Supabase 项目状态

### 迁移失败
- 检查 SQL 语法错误
- 确认依赖关系正确
- 查看 Supabase 数据库日志

### 权限错误
- 确认使用的是服务角色密钥而非匿名密钥
- 检查 RLS 策略配置
- 验证用户权限设置 