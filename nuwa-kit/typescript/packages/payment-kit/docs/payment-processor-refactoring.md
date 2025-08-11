# Payment Processor Refactoring Plan

## 背景

当前 `HttpBillingMiddleware` 混合了 HTTP 协议特定的逻辑和通用的支付协商逻辑。为了支持未来的 MCP Billing Middleware、A2A Billing Middleware 等不同协议，需要将可复用的支付逻辑抽离到协议无关的组件中。

## 架构设计

### 三层架构

```
┌─────────────────────────────────────────────┐
│           协议适配层 (Protocol Layer)        │
│  HttpBillingMiddleware                      │
│  McpBillingMiddleware (未来)                │
│  A2aBillingMiddleware (未来)                │
├─────────────────────────────────────────────┤
│         支付协商层 (Payment Negotiation)     │
│  PaymentProcessor (新增核心组件)             │
├─────────────────────────────────────────────┤
│         支付通道层 (Payment Channel)         │
│  PaymentChannelPayeeClient                 │
│  PaymentChannelPayerClient                 │
└─────────────────────────────────────────────┘
```

## 组件职责划分

### 1. 协议适配层 (Protocol-Specific Layer)

**保留在各自 middleware 的逻辑：**

- **请求/响应解析与注入**

  - HTTP: `req.headers`、`res.setHeader()`、Express `next()`
  - MCP: Frame 解析/构建
  - A2A: 消息载体处理

- **协议特定的错误映射**

  - HTTP: 状态码 (402, 400, 500)
  - MCP: Error frames
  - A2A: 错误响应格式

- **协议元数据提取**
  - HTTP: `req.method`、`req.path`、`req.query`、`req.body`
  - MCP: Method names、Parameters
  - A2A: Service identifiers、Operation types

### 2. 支付协商层 (Payment Negotiation Layer)

**新增 `PaymentProcessor` 组件，负责：**

- **延迟支付模型协调**

  - 握手验证 (handshake verification)
  - 延迟支付确认 (deferred payment confirmation)
  - SubRAV 提案生成 (proposal generation)

- **支付状态管理**

  - 待签 SubRAV 存储与对账
  - 支付历史跟踪
  - 异常检测与安全检查

- **计费集成**
  - 成本计算协调
  - 计费上下文构建
  - 计费引擎调用

### 3. 支付通道层 (Payment Channel Layer)

**增强 `PaymentChannelPayeeClient` 和 `PaymentChannelPayerClient`：**

- **高级支付操作**
- **协议无关的编解码支持**
- **状态同步与持久化**

## 详细实现方案

### PaymentProcessor 接口设计

```typescript
export interface PaymentProcessorConfig {
  payeeClient: PaymentChannelPayeeClient;
  billingEngine: CostCalculator;
  serviceId: string;
  defaultAssetId?: string;
  pendingSubRAVStore?: PendingSubRAVStore;
  claimScheduler?: ClaimScheduler;
  debug?: boolean;
}

export interface RequestMetadata {
  // 业务操作标识
  operation: string;

  // 可选的业务参数
  model?: string;
  assetId?: string;

  // 支付通道信息 (从已签名 SubRAV 中提取)
  channelId?: string;
  vmIdFragment?: string;

  // 协议特定的额外元数据
  [key: string]: any;
}

export interface PaymentProcessingResult {
  success: boolean;
  cost: bigint;
  assetId: string;

  // 支付数据
  unsignedSubRAV?: SubRAV;
  signedSubRAV?: SignedSubRAV;

  // 操作结果
  autoClaimTriggered?: boolean;
  isHandshake?: boolean;

  // 错误信息
  error?: string;
  errorCode?: string;

  // 支付方信息
  payerKeyId?: string;
}

export class PaymentProcessor {
  constructor(config: PaymentProcessorConfig);

  /**
   * 处理支付请求的核心方法
   * @param requestMeta 协议无关的请求元数据
   * @param signedSubRAV 客户端发送的已签名 SubRAV (可选)
   * @returns 处理结果，包含成本和新的 SubRAV 提案
   */
  async processPayment(
    requestMeta: RequestMetadata,
    signedSubRAV?: SignedSubRAV
  ): Promise<PaymentProcessingResult>;

  // 辅助方法
  async verifyHandshake(signedSubRAV: SignedSubRAV): Promise<VerificationResult>;
  async confirmDeferredPayment(signedSubRAV: SignedSubRAV): Promise<VerificationResult>;
  async generateProposal(context: BillingContext, amount: bigint): Promise<SubRAV>;
}
```

### 增强 PaymentChannelPayeeClient

**新增方法：**

```typescript
export class PaymentChannelPayeeClient {
  // 现有方法保持不变...

  /**
   * 验证握手请求 (nonce=0, amount=0)
   */
  async verifyHandshake(signedSubRAV: SignedSubRAV): Promise<VerificationResult>;

  /**
   * 确认已签名的提案
   * 集成 pending store 验证 + 签名验证 + 状态更新
   */
  async confirmSignedProposal(
    signedSubRAV: SignedSubRAV,
    pendingStore: PendingSubRAVStore
  ): Promise<VerificationResult>;

  /**
   * 生成支付提案的高级方法
   * 自动处理 payerKeyId 拼装
   */
  async generateProposal(params: {
    channelId: string;
    vmIdFragment: string;
    amount: bigint;
    description?: string;
  }): Promise<SubRAV>;
}
```

### 增强 PaymentChannelPayerClient

**新增方法：**

```typescript
export interface PaymentCodec {
  encode(signedSubRAV: SignedSubRAV, metadata?: any): string;
  decode(encoded: string): { signedSubRAV: SignedSubRAV; metadata?: any };
}

export class PaymentChannelPayerClient {
  // 现有方法保持不变...

  /**
   * 协议无关的签名和编码
   */
  async signAndEncode(
    subRAV: SubRAV,
    codec: PaymentCodec,
    options?: SignSubRAVOptions
  ): Promise<string>;

  /**
   * 解码并验证服务端响应
   */
  async decodeAndValidate(
    encoded: string,
    codec: PaymentCodec
  ): Promise<{ subRAV: SubRAV; metadata?: any }>;
}
```

## 重构步骤

### 阶段 1: 创建 PaymentProcessor

1. **创建 `PaymentProcessor` 类**

   - 从 `HttpBillingMiddleware` 提取通用逻辑
   - 实现协议无关的支付处理流程

2. **提取工具类**
   - `PaymentUtils`: `generateTxRef()`、`subRAVsMatch()` 等
   - `BillingContextBuilder`: 构建计费上下文的通用逻辑

### 阶段 2: 增强 PayeeClient

1. **添加高级验证方法**

   - `verifyHandshake()`
   - `confirmSignedProposal()`
   - `generateProposal()`

2. **集成 PendingSubRAVStore**
   - 将 pending store 操作封装到 PayeeClient 内部
   - 提供统一的状态管理接口

### 阶段 3: 增强 PayerClient

1. **添加编解码支持**

   - `signAndEncode()`
   - `decodeAndValidate()`

2. **创建协议编解码器**
   - `HttpPaymentCodec`
   - `McpPaymentCodec` (为未来准备)
   - `A2aPaymentCodec` (为未来准备)

### 阶段 4: 重构 HttpBillingMiddleware

1. **简化 HttpBillingMiddleware**

   - 保留 HTTP 特定逻辑
   - 委托支付处理给 `PaymentProcessor`

2. **验证功能完整性**
   - 确保所有现有功能正常工作
   - 添加集成测试

### 阶段 5: 为未来协议做准备

1. **创建 MCP/A2A 示例**
   - 展示如何使用 `PaymentProcessor` 实现新协议
   - 验证架构的可扩展性

## 文件组织

```
nuwa-kit/typescript/packages/payment-kit/src/
├── core/
│   ├── PaymentProcessor.ts          # 新增：支付协商核心逻辑
│   ├── PaymentUtils.ts              # 新增：通用工具函数
│   ├── BillingContextBuilder.ts     # 新增：计费上下文构建器
│   ├── PendingSubRAVStore.ts        # 现有：保持不变
│   └── ...
├── client/
│   ├── PaymentChannelPayeeClient.ts # 增强：添加高级方法
│   ├── PaymentChannelPayerClient.ts # 增强：添加编解码支持
│   └── ...
├── middlewares/
│   ├── http/
│   │   ├── HttpBillingMiddleware.ts  # 重构：简化为协议适配器
│   │   └── HttpPaymentCodec.ts       # 新增：HTTP 编解码器
│   ├── mcp/                          # 未来：MCP 支持
│   │   ├── McpBillingMiddleware.ts
│   │   └── McpPaymentCodec.ts
│   └── a2a/                          # 未来：A2A 支持
│       ├── A2aBillingMiddleware.ts
│       └── A2aPaymentCodec.ts
└── codecs/
    ├── PaymentCodec.ts               # 新增：编解码器接口
    └── ...
```

## 迁移兼容性

为了保持向后兼容，重构过程中：

1. **保持现有 API 不变**

   - `HttpBillingMiddleware` 的公共接口保持不变
   - 内部实现逐步迁移到 `PaymentProcessor`

2. **渐进式迁移**

   - 先创建新组件，再逐步迁移现有功能
   - 保持现有测试通过

3. **文档更新**
   - 更新使用示例
   - 提供迁移指南

## 预期收益

1. **代码复用**: 支付逻辑在不同协议间复用，减少重复开发
2. **架构清晰**: 职责分离明确，便于维护和测试
3. **扩展性强**: 新增协议支持只需实现协议适配层
4. **可测试性**: 核心逻辑独立，便于单元测试
5. **向后兼容**: 现有代码无需修改即可继续工作
