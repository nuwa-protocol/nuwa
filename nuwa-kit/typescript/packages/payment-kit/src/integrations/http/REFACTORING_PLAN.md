# PaymentChannelHttpClient 重构计划

## 概述

本文档描述了 `PaymentChannelHttpClient` 的重构计划和迁移策略。重构的主要目标是提高代码的可维护性、可测试性和模块化程度。

## 重构目标

1. **模块化架构** - 将单一的大类拆分为多个职责单一的模块
2. **更好的测试性** - 每个模块可以独立测试
3. **改进的错误处理** - 统一的错误处理机制
4. **更清晰的状态管理** - 集中式状态管理
5. **解决异步问题** - 修复 unhandled promise rejection 等问题

## 新架构

### 核心模块

1. **PaymentState** (`core/PaymentState.ts`)

   - 集中管理所有客户端状态
   - 处理通道信息、待处理支付、SubRAV 缓存等
   - 提供状态持久化和恢复功能

2. **PaymentProtocol** (`core/PaymentProtocol.ts`)

   - 处理支付协议逻辑
   - 编码/解码请求和响应头
   - 处理 SubRAV 签名和验证

3. **RequestManager** (`core/RequestManager.ts`)

   - 管理请求跟踪和超时
   - 处理支付承诺的解析和拒绝
   - 提供请求生命周期管理

4. **ChannelManager** (`core/ChannelManager.ts`)
   - 管理支付通道的生命周期
   - 处理服务发现和恢复
   - 管理通道映射存储

### 文件结构

```
src/integrations/http/
├── core/
│   ├── PaymentState.ts
│   ├── PaymentProtocol.ts
│   ├── RequestManager.ts
│   ├── ChannelManager.ts
│   ├── index.ts
│   └── __tests__/
│       ├── PaymentState.test.ts
│       ├── PaymentProtocol.test.ts
│       └── RequestManager.test.ts
├── PaymentChannelHttpClient.ts (原始版本)
├── PaymentChannelHttpClient.refactored.ts (重构版本)
└── REFACTORING_PLAN.md (本文档)
```

## 迁移策略

### 第一阶段：并行运行（当前）

- ✅ 创建重构版本 `PaymentChannelHttpClient.refactored.ts`
- ✅ 保持原始版本不变
- ✅ 为新模块编写单元测试
- ✅ 创建兼容性测试

### 第二阶段：逐步迁移

1. 在 `factory.ts` 中添加特性标志来选择使用哪个版本
2. 在测试环境中使用重构版本
3. 监控性能和稳定性
4. 逐步在生产环境中启用

### 第三阶段：完全迁移

1. 将所有引用切换到重构版本
2. 更新 `index.ts` 导出
3. 标记原始版本为废弃
4. 最终删除原始版本

## API 兼容性

重构版本保持了与原始版本相同的公共 API：

```typescript
// 主要方法
- initialize()
- request(method, path, init?)
- requestWithPayment(method, path, init?)
- requestAndWaitForPayment(method, path, init?)

// 便捷方法
- get(path, options?)
- post(path, options?)
- put(path, options?)
- delete(path, options?)
- patch(path, options?)

// 管理方法
- getHubClient()
- getPayerClient()
- discoverService()
- recoverFromService()
- commit(subRav?)
- health()
- getPendingSubRAV()
- logoutCleanup()
- getPersistedState()
```

## 主要改进

### 1. 解决的问题

- ✅ 修复了 unhandled promise rejection
- ✅ 改进了 RequestScheduler 的清理机制
- ✅ 更好的错误处理和传播
- ✅ 改进了异步操作的管理

### 2. 代码质量改进

- 更清晰的职责分离
- 更好的类型安全
- 减少了代码重复
- 改进了日志记录

### 3. 可测试性改进

- 模块可以独立测试
- 更容易模拟依赖
- 更好的测试覆盖率

## 测试策略

1. **单元测试** - 每个核心模块都有独立的单元测试
2. **集成测试** - 测试模块之间的交互
3. **兼容性测试** - 确保重构版本与原始版本行为一致
4. **E2E 测试** - 使用现有的 E2E 测试验证功能

## 风险和缓解措施

### 风险

1. API 不兼容导致破坏性更改
2. 性能退化
3. 未发现的边缘情况

### 缓解措施

1. 保持严格的 API 兼容性
2. 进行性能基准测试
3. 逐步迁移，充分测试
4. 保留原始版本作为回退选项

## 下一步

1. [ ] 完成 ChannelManager 的单元测试
2. [ ] 运行完整的 E2E 测试套件
3. [ ] 添加性能基准测试
4. [ ] 实现特性标志系统
5. [ ] 在测试环境中部署重构版本
6. [ ] 收集反馈和监控指标
7. [ ] 制定生产环境迁移计划

## 结论

这次重构提供了一个更加模块化、可维护和可测试的架构。通过渐进式迁移策略，我们可以最小化风险，同时获得重构带来的好处。
