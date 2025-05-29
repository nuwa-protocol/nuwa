# WebAuthn/Passkey 实现文档

## 概述

本文档描述了 CADOP Service 中 WebAuthn/Passkey 支持的实现，提供现代的无密码认证体验。

## 已实现的功能

### 1. 数据库架构 ✅

#### 新增表结构

**authenticators 表**
- 存储 WebAuthn 凭证信息
- 包含凭证ID、公钥、计数器等核心数据
- 支持设备友好名称和传输方式

**webauthn_challenges 表**
- 临时存储注册/认证挑战
- 自动过期机制
- 防重放攻击保护

#### 数据库迁移文件
- `003_webauthn_support.sql` - 完整的 WebAuthn 表结构
- 包含索引优化和清理函数

### 2. TypeScript 类型定义 ✅

**核心类型** (`src/types/webauthn.ts`)
- `Authenticator` - 数据库认证器记录
- `WebAuthnChallenge` - 挑战数据结构
- `WebAuthnRegistrationResult` - 注册结果
- `WebAuthnAuthenticationResult` - 认证结果
- `WebAuthnConfig` - 服务配置
- `WebAuthnError` - 错误处理

### 3. WebAuthn 服务 ✅

**核心服务** (`src/services/webauthnService.ts`)
- 基于 `@simplewebauthn/server` 实现
- 支持注册和认证流程
- 集成 Supabase 数据存储
- 完整的错误处理和日志记录

**主要功能**
- `generateRegistrationOptions()` - 生成注册选项
- `verifyRegistrationResponse()` - 验证注册响应
- `generateAuthenticationOptions()` - 生成认证选项
- `verifyAuthenticationResponse()` - 验证认证响应
- `getUserDevices()` - 获取用户设备列表
- `removeDevice()` - 删除设备
- `cleanupExpiredChallenges()` - 清理过期挑战

### 4. API 端点 ✅

**RESTful API** (`src/routes/webauthn.ts`)

#### 注册端点
- `POST /api/webauthn/registration/options` - 获取注册选项
- `POST /api/webauthn/registration/verify` - 验证注册

#### 认证端点
- `POST /api/webauthn/authentication/options` - 获取认证选项
- `POST /api/webauthn/authentication/verify` - 验证认证

#### 设备管理
- `GET /api/webauthn/devices` - 获取用户设备
- `DELETE /api/webauthn/devices/:deviceId` - 删除设备

#### 维护端点
- `POST /api/webauthn/cleanup` - 清理过期挑战

### 5. 前端测试页面 ✅

**测试界面** (`src/pages/webauthn-test.tsx`)
- 完整的 React 组件
- 支持设备注册和认证测试
- 设备管理界面
- Base64URL 编码/解码工具
- 浏览器兼容性检测

## 技术特性

### 安全特性
- **防重放攻击**: 挑战一次性使用
- **时间限制**: 挑战自动过期（5分钟）
- **设备绑定**: 凭证与特定设备关联
- **计数器验证**: 防止凭证克隆
- **源验证**: 严格的 RP ID 和 Origin 验证

### 用户体验
- **设备友好名称**: 用户可为设备命名
- **多设备支持**: 用户可注册多个认证器
- **传输方式检测**: 自动识别 USB、NFC、蓝牙等
- **平台认证器**: 支持 Touch ID、Face ID、Windows Hello
- **跨平台认证器**: 支持 YubiKey 等硬件密钥

### 集成特性
- **Sybil 防护**: WebAuthn 认证贡献 25 分 Sybil 等级
- **auth_methods 集成**: 自动更新用户认证方法记录
- **实时状态**: 记录设备最后使用时间
- **会话管理**: 与 Supabase Auth 集成

## 配置要求

### 环境变量
```bash
# WebAuthn 配置
WEBAUTHN_RP_NAME=CADOP Service
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3001
WEBAUTHN_EXPECTED_ORIGIN=http://localhost:3001
WEBAUTHN_EXPECTED_RP_ID=localhost
WEBAUTHN_CHALLENGE_TIMEOUT=300000
```

### 依赖包
```json
{
  "@simplewebauthn/server": "^8.3.6",
  "@simplewebauthn/types": "^8.3.6",
  "@simplewebauthn/browser": "^8.3.6"
}
```

## 使用流程

### 注册流程
1. 用户请求注册选项
2. 服务器生成挑战和选项
3. 浏览器调用 WebAuthn API
4. 用户完成生物识别/PIN验证
5. 服务器验证响应并存储凭证

### 认证流程
1. 用户请求认证选项
2. 服务器生成挑战（可指定允许的凭证）
3. 浏览器调用 WebAuthn API
4. 用户完成验证
5. 服务器验证响应并创建会话

## 部署注意事项

### HTTPS 要求
- 生产环境必须使用 HTTPS
- 本地开发可使用 localhost

### 域名配置
- RP ID 必须与域名匹配
- 不支持 IP 地址（除 localhost）

### 浏览器支持
- Chrome 67+
- Firefox 60+
- Safari 14+
- Edge 18+

## 测试方法

### 手动测试
1. 启动服务: `npm run dev`
2. 访问测试页面: `http://localhost:3001/webauthn-test`
3. 使用支持 WebAuthn 的设备进行测试

### API 测试
```bash
# 获取注册选项
curl -X POST http://localhost:3001/api/webauthn/registration/options \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"friendly_name": "Test Device"}'

# 获取认证选项
curl -X POST http://localhost:3001/api/webauthn/authentication/options \
  -H "Content-Type: application/json" \
  -d '{"user_identifier": "user@example.com"}'
```

## 故障排除

### 常见问题
1. **挑战过期**: 检查系统时间同步
2. **域名不匹配**: 确认 RP ID 配置
3. **HTTPS 错误**: 生产环境必须使用 HTTPS
4. **设备不支持**: 检查浏览器和设备兼容性

### 日志监控
- 所有 WebAuthn 操作都有详细日志
- 错误信息包含具体的失败原因
- 支持结构化日志查询

## 后续优化

### 短期改进
- [ ] 添加设备类型图标
- [ ] 实现批量设备管理
- [ ] 添加认证统计

### 长期规划
- [ ] 支持条件式 UI (Conditional UI)
- [ ] 集成企业策略管理
- [ ] 添加设备风险评估

## 相关文档

- [WebAuthn 规范](https://www.w3.org/TR/webauthn-2/)
- [SimpleWebAuthn 文档](https://simplewebauthn.dev/)
- [CADOP 架构设计](./04-architecture-design.md)
- [API 接口文档](./02-api-design.md) 