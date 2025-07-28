# HTTP Billing Middleware 迁移指南

## 📝 迁移概述

本指南帮助您从旧的 `HttpBillingMiddleware` 迁移到基于 `PaymentProcessor` 的新架构。

## 📁 文件对照表

| 类型 | 旧版本 | 新版本 | 状态 |
|------|--------|--------|------|
| 实现文件 | `src/core/http-billing-middleware.ts` | `src/middlewares/http/HttpBillingMiddleware.ts` | 🔄 并行存在 |
| 类名 | `HttpBillingMiddleware` | `HttpBillingMiddleware` | ⚠️ 同名不同包 |
| 导入路径 | `../core/http-billing-middleware` | `../middlewares/http/HttpBillingMiddleware` | 🔄 需要更新 |

## 🚀 迁移步骤

### 阶段 1: 导入路径迁移 (推荐)

```typescript
// 旧版本导入
import { HttpBillingMiddleware } from '../core/http-billing-middleware';

// 新版本导入  
import { HttpBillingMiddleware } from '../middlewares/http/HttpBillingMiddleware';
```

### 阶段 2: API 兼容性检查

新版本保持了 API 兼容性，但有一些增强：

```typescript
// ✅ 兼容的用法 (新旧版本都支持)
const middleware = new HttpBillingMiddleware({
  payeeClient,
  billingEngine,
  serviceId: 'my-service',
  defaultAssetId: 'USDC',
  debug: true
});

const expressMiddleware = middleware.createExpressMiddleware();
app.use(expressMiddleware);

// ✅ 新版本额外功能
console.log(middleware.getProcessingStats()); // PaymentProcessor 统计
await middleware.clearExpiredProposals(30);   // 清理过期提案
```

### 阶段 3: 配置迁移

新版本的配置项基本相同，但有一些优化：

```typescript
// 旧版本配置
interface HttpPaymentMiddlewareConfig {
  payeeClient: PaymentChannelPayeeClient;
  billingEngine: CostCalculator;
  serviceId: string;
  defaultAssetId?: string;
  requirePayment?: boolean;  // ⚠️ 新版本中移除
  debug?: boolean;
  pendingSubRAVStore?: PendingSubRAVStore;
  claimScheduler?: ClaimScheduler;
}

// 新版本配置
interface HttpBillingMiddlewareConfig {
  payeeClient: PaymentChannelPayeeClient;
  billingEngine: CostCalculator;
  serviceId: string;
  defaultAssetId?: string;
  // requirePayment 已移除 - 新版本总是需要支付
  debug?: boolean;
  pendingSubRAVStore?: PendingSubRAVStore;
  claimScheduler?: ClaimScheduler;
}
```

## 🔄 渐进式迁移方案

### 方案 1: 别名导入 (最安全)

```typescript
// 可以同时使用两个版本进行对比测试
import { HttpBillingMiddleware as LegacyHttpBillingMiddleware } from '../core/http-billing-middleware';
import { HttpBillingMiddleware as NewHttpBillingMiddleware } from '../middlewares/http/HttpBillingMiddleware';

// 生产环境继续使用旧版本
const productionMiddleware = new LegacyHttpBillingMiddleware(config);

// 测试环境使用新版本
const testMiddleware = new NewHttpBillingMiddleware(config);
```

### 方案 2: 功能标志切换

```typescript
const USE_NEW_ARCHITECTURE = process.env.USE_NEW_PAYMENT_PROCESSOR === 'true';

const HttpBillingMiddleware = USE_NEW_ARCHITECTURE 
  ? require('../middlewares/http/HttpBillingMiddleware').HttpBillingMiddleware
  : require('../core/http-billing-middleware').HttpBillingMiddleware;

const middleware = new HttpBillingMiddleware(config);
```

### 方案 3: 工厂函数封装

```typescript
// utils/middleware-factory.ts
export function createHttpBillingMiddleware(
  config: HttpBillingMiddlewareConfig,
  useNewArchitecture = false
) {
  if (useNewArchitecture) {
    const { HttpBillingMiddleware } = require('../middlewares/http/HttpBillingMiddleware');
    return new HttpBillingMiddleware(config);
  } else {
    const { HttpBillingMiddleware } = require('../core/http-billing-middleware');
    return new HttpBillingMiddleware(config);
  }
}

// 使用
const middleware = createHttpBillingMiddleware(config, true); // 使用新架构
```

## 🧪 测试对比

建议进行以下测试来验证迁移：

```typescript
describe('HttpBillingMiddleware Migration', () => {
  let legacyMiddleware: any;
  let newMiddleware: any;
  
  beforeEach(() => {
    const config = { /* your config */ };
    legacyMiddleware = new LegacyHttpBillingMiddleware(config);
    newMiddleware = new NewHttpBillingMiddleware(config);
  });

  it('should produce same results for handshake', async () => {
    const mockReq = { /* handshake request */ };
    const mockRes = { /* mock response */ };
    
    const legacyResult = await legacyMiddleware.processPayment(mockReq, mockRes);
    const newResult = await newMiddleware.processHttpPayment(mockReq);
    
    // 比较关键字段
    expect(newResult.success).toBe(legacyResult.success);
    expect(newResult.cost).toBe(legacyResult.cost);
    expect(newResult.assetId).toBe(legacyResult.assetId);
  });

  it('should handle payment verification consistently', async () => {
    // 测试支付验证逻辑
  });
});
```

## 📊 性能对比

| 指标 | 旧版本 | 新版本 | 改进 |
|------|--------|--------|------|
| 代码行数 | 707 行 | 369 行 | ⬇️ 48% |
| 复杂度 | 混合逻辑 | 分层架构 | ✅ 更清晰 |
| 可测试性 | 单体测试 | 组件测试 | ✅ 更好 |
| 扩展性 | HTTP 特定 | 多协议支持 | ✅ 更强 |

## ⚠️ 注意事项

1. **API 变化**:
   - `requirePayment` 配置项被移除
   - 返回的结果类型从 `PaymentProcessingResult` 变为 `ProcessorPaymentResult`

2. **错误处理**:
   - 错误码映射保持一致
   - 错误消息格式可能略有不同

3. **性能影响**:
   - 新架构增加了一层抽象，但对性能影响微乎其微
   - 内存使用略有增加（PaymentProcessor 实例）

## 🎯 推荐迁移时间表

1. **第 1 周**: 在测试环境部署新版本，运行对比测试
2. **第 2 周**: 修复发现的差异和兼容性问题  
3. **第 3 周**: 在预生产环境进行性能测试
4. **第 4 周**: 生产环境灰度发布（功能标志控制）
5. **第 5-6 周**: 全量切换到新架构
6. **第 7 周**: 移除旧版本代码（可选）

## 📞 支持

如果在迁移过程中遇到问题：

1. 查看 `refactoring-summary.md` 了解架构细节
2. 参考 `refactored-usage-example.ts` 获取使用示例
3. 运行现有测试确保功能正常
4. 在测试环境先验证新功能

## 🔮 未来计划

新架构为以下功能奠定了基础：
- MCP 协议支持
- A2A 协议支持  
- WebSocket 实时支付
- 统一的支付监控和指标 