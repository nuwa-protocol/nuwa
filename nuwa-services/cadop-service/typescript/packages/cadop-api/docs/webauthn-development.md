# WebAuthn 开发环境指南

## Chrome DevTools 虚拟认证器 Counter 问题

### 问题描述

在使用Chrome DevTools的WebAuthn虚拟认证器进行开发时，你可能会遇到以下错误：

```
Response counter value 0 was lower than expected 1
```

这个错误的原因是：
1. **第一次认证成功**：虚拟认证器counter从0开始，服务器将其存储为1
2. **第二次认证失败**：虚拟认证器可能重置counter为0，但服务器期望counter ≥ 1
3. **WebAuthn规范要求**：counter必须严格单调递增，以防止重放攻击

### 问题根源

Chrome DevTools的虚拟认证器在某些情况下会重置counter值，这是一个已知的开发工具限制。

## 解决方案

### 1. 立即解决方案

#### 方法A：重置虚拟认证器
1. 打开Chrome DevTools
2. 进入 **Application** → **WebAuthn** 面板
3. 删除当前的虚拟认证器
4. 重新创建一个新的虚拟认证器
5. 重新注册Passkey

#### 方法B：清除认证器凭据
1. 在WebAuthn面板中找到当前认证器
2. 在**Credentials**表格中删除所有凭据
3. 重新注册Passkey

#### 方法C：使用真实认证器
- 禁用虚拟认证器环境
- 使用TouchID、Windows Hello等真实硬件认证器

### 2. 自动解决方案（已实现）

我们的系统在开发环境中提供了自动counter重置功能：

1. **自动检测**：系统会自动检测counter错误
2. **自动重置**：在开发环境中自动重置counter
3. **自动重试**：重置后自动重新进行认证

### 3. 手动API解决方案

对于开发环境，我们提供了以下API端点：

#### 重置单个认证器counter
```http
POST /api/webauthn/dev/reset-counter
Content-Type: application/json

{
  "credentialId": "your-credential-id"
}
```

#### 重置用户所有认证器counter
```http
POST /api/webauthn/dev/reset-user-counters
Content-Type: application/json

{
  "userId": "user-id"
}
```

### 4. 前端API调用

```typescript
import { apiClient } from '@/lib/api/client';

// 重置单个认证器
await apiClient.resetAuthenticatorCounter(credentialId);

// 重置用户所有认证器
await apiClient.resetUserAuthenticatorCounters(userId);
```

## 最佳实践

### 开发环境
1. **使用虚拟认证器**：适合快速开发和测试
2. **遇到counter错误时**：
   - 首先尝试删除并重新创建虚拟认证器
   - 如果问题持续，使用我们提供的counter重置API
   - 系统会自动尝试修复（如果启用了自动修复功能）

### 生产环境
1. **使用真实认证器**：确保安全性和可靠性
2. **禁用开发工具**：生产环境不会暴露counter重置API
3. **监控counter异常**：记录和分析counter相关的错误

## 注意事项

⚠️ **安全警告**：
- Counter重置功能**仅在开发环境**中可用
- 生产环境中禁用所有counter重置功能
- 这个功能绕过了WebAuthn的安全机制，仅用于开发调试

✅ **推荐做法**：
- 在开发后期切换到真实认证器进行测试
- 定期清理开发环境的认证器数据
- 在CI/CD中使用自动化测试而不是虚拟认证器

## 故障排除

### 问题：自动重置不工作
**解决方案**：
1. 检查是否在开发环境（`NODE_ENV !== 'production'`）
2. 确认错误消息包含"counter"和"lower than expected"
3. 检查网络连接和API可用性

### 问题：真实认证器也出现counter错误
**原因**：可能是数据库状态不同步
**解决方案**：
1. 检查数据库中的counter值
2. 使用counter重置API修复
3. 重新注册认证器

### 问题：生产环境出现counter错误
**处理方法**：
1. **不要**使用counter重置功能
2. 要求用户重新注册认证器
3. 调查数据完整性问题
4. 检查认证器设备是否被重置

## 相关链接

- [WebAuthn规范](https://w3c.github.io/webauthn/)
- [Chrome DevTools WebAuthn文档](https://developer.chrome.com/docs/devtools/webauthn)
- [SimpleWebAuthn库文档](https://simplewebauthn.dev/) 