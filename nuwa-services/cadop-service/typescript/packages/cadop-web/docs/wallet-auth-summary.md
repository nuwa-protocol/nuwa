# Cadop Web 钱包认证实施总结

> 版本：v1.0  
> 日期：2025-01-19  
> 状态：待确认

## 📋 实施概览

### 目标

为 cadop-web 添加 Rooch 钱包（Bitcoin 钱包）登录支持，与现有 Passkey 认证并存。

### 核心概念理解

- **User DID**：外部账户标识
  - Passkey: `did:key:xxx`
  - Wallet: `did:rooch:{address}`
- **Agent DID**：Rooch 链上智能合约账户
  - 需要链上交易创建
  - 创建后独立于创建者

## 🏗️ 架构设计要点

### 1. 认证抽象层

- 统一的 `AuthProvider` 接口
- `PasskeyAuthProvider` 和 `WalletAuthProvider` 实现
- 扩展 `AuthContext` 支持多认证方式

### 2. 签名器层

- `SignerInterface` 统一接口
- `WebAuthnSigner`（现有）和 `RoochWalletSigner`（新增）
- 签名器工厂模式

### 3. Agent 创建差异

- **Passkey**：通过 cadop-api 服务中转
- **Wallet**：直接调用 IdentityKit.createNewDID

### 4. 存储扩展

- 版本升级 v1 -> v2
- 新增 `authMethods` 数组记录认证方式
- 支持通过钱包地址查找用户

## 📝 实施计划

### Phase 0: 预先重构（5-7天）

必须先完成的基础重构工作：

1. **存储层重构**
   - 实现 v1 到 v2 的数据迁移
   - 扩展 UserStore API
   - 添加版本迁移机制

2. **认证抽象**
   - 创建 AuthProvider 接口
   - 封装 PasskeyService
   - 重构 AuthContext

3. **服务层拆分**
   - 创建签名器工厂
   - 拆分 AgentService

### Phase 1: 基础架构（3-4天）

- 实现认证抽象层完整功能
- 重构 AuthContext 支持多认证
- 更新所有相关组件

### Phase 2: 钱包集成（4-5天）

- 集成 @roochnetwork/rooch-sdk-kit
- 实现 WalletAuthProvider
- 实现 RoochWalletSigner
- 实现 WalletAgentService

### Phase 3: UI 更新（3-4天）

- 更新登录页面支持选择认证方式
- 添加钱包连接组件
- 更新 Dashboard 和 OnboardingGuard

### Phase 4: 测试验证（3-4天）

- 单元测试新组件
- 集成测试完整流程
- 存储迁移测试
- 兼容性验证

**总工期：18-24天**

## 🔑 关键技术决策

1. **使用 IdentityKit 创建 Agent**
   - 钱包方式直接调用 `IdentityKit.createNewDID`
   - 无需通过 cadop-api 服务

2. **Rooch 钱包即 Bitcoin 钱包**
   - 使用 Bitcoin 地址作为账户
   - 支持 UniSat 等钱包

3. **Agent 权限一致性**
   - 两种方式创建的 Agent 权限无差异
   - 都是标准的智能合约账户

4. **独立性设计**
   - Agent 创建后与创建者解耦
   - 具有完全自主权

## ⚠️ 风险与缓解

### 高风险

- **数据迁移失败**
  - 缓解：实现回滚机制，保留备份

### 中风险

- **组件兼容性**
  - 缓解：充分测试，渐进式重构

### 低风险

- **性能影响**
  - 缓解：性能测试和优化

## ✅ 下一步行动

1. **确认设计方案**
   - 审查架构设计
   - 确认实施优先级

2. **开始 Phase 0 重构**
   - 创建功能分支
   - 实施存储层重构
   - 创建认证抽象

3. **持续集成**
   - 设置自动化测试
   - 确保向后兼容

## 📚 相关文档

- [详细设计方案](./wallet-auth-design.md)
- [架构图](./wallet-auth-architecture.md)
- [重构计划](./wallet-auth-refactor-plan.md)

## 🎯 成功标准

1. 用户可以使用 Bitcoin 钱包登录
2. 钱包用户可以创建和管理 Agent DID
3. 现有 Passkey 用户不受影响
4. 所有功能正常工作，无回归问题

---

**准备就绪，等待确认后开始实施。**
