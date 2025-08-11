# PaymentProcessor API Reference

## Overview

`PaymentProcessor` 是协议无关的支付协商组件，负责处理延迟支付模型的核心逻辑。它将支付验证、SubRAV 生成、状态管理等功能从具体的协议实现中抽离出来，使得不同协议的 billing middleware 可以复用相同的支付逻辑。

## Core Interfaces

### PaymentProcessorConfig

```typescript
export interface PaymentProcessorConfig {
  /** Payee client for payment operations */
  payeeClient: PaymentChannelPayeeClient;

  /** Billing engine for cost calculation */
  billingEngine: CostCalculator;

  /** Service ID for billing configuration */
  serviceId: string;

  /** Default asset ID if not provided in request context */
  defaultAssetId?: string;

  /** Store for pending unsigned SubRAV proposals */
  pendingSubRAVStore?: PendingSubRAVStore;

  /** Optional claim scheduler for automated claiming */
  claimScheduler?: ClaimScheduler;

  /** Debug logging */
  debug?: boolean;
}
```

### RequestMetadata

```typescript
export interface RequestMetadata {
  /** Business operation identifier (e.g., "POST:/api/chat/completions") */
  operation: string;

  /** Optional business parameters */
  model?: string;
  assetId?: string;

  /** Payment channel information (extracted from signed SubRAV) */
  channelId?: string;
  vmIdFragment?: string;

  /** Protocol-specific additional metadata */
  [key: string]: any;
}
```

### PaymentProcessingResult

```typescript
export interface PaymentProcessingResult {
  /** Whether payment was processed successfully */
  success: boolean;

  /** Cost calculated for this request */
  cost: bigint;

  /** Asset ID used for calculation */
  assetId: string;

  /** Generated unsigned SubRAV for next request */
  unsignedSubRAV?: SubRAV;

  /** Signed SubRAV received from client */
  signedSubRAV?: SignedSubRAV;

  /** Whether auto-claim was triggered */
  autoClaimTriggered?: boolean;

  /** Whether this was a handshake request */
  isHandshake?: boolean;

  /** Error message if failed */
  error?: string;

  /** Error code for client handling */
  errorCode?: string;

  /** Payer key ID extracted from payment verification */
  payerKeyId?: string;

  /** Service transaction reference */
  serviceTxRef?: string;
}
```

## PaymentProcessor Class

### Constructor

```typescript
constructor(config: PaymentProcessorConfig)
```

### Core Methods

#### processPayment

```typescript
async processPayment(
  requestMeta: RequestMetadata,
  signedSubRAV?: SignedSubRAV
): Promise<PaymentProcessingResult>
```

处理支付请求的核心方法，实现完整的延迟支付流程：

1. 验证客户端发送的已签名 SubRAV（如果提供）
2. 计算当前请求的成本
3. 生成下一次请求的 SubRAV 提案
4. 可选地触发自动 claim

**参数：**

- `requestMeta`: 协议无关的请求元数据
- `signedSubRAV`: 客户端发送的已签名 SubRAV（可选）

**返回：**

- `PaymentProcessingResult`: 包含处理结果和新的 SubRAV 提案

**使用示例：**

```typescript
const processor = new PaymentProcessor({
  payeeClient,
  billingEngine,
  serviceId: 'llm-gateway',
  defaultAssetId: 'USDC',
});

// HTTP middleware 中的使用
const requestMeta: RequestMetadata = {
  operation: `${req.method}:${req.path}`,
  model: req.body?.model,
  assetId: req.body?.assetId,
  channelId: paymentData?.signedSubRav.subRav.channelId,
  vmIdFragment: paymentData?.signedSubRav.subRav.vmIdFragment,
};

const result = await processor.processPayment(requestMeta, paymentData?.signedSubRav);

if (!result.success) {
  return res.status(402).json({
    error: result.error,
    code: result.errorCode,
  });
}

// 将 unsignedSubRAV 添加到响应中供客户端签名
```

#### verifyHandshake

```typescript
async verifyHandshake(signedSubRAV: SignedSubRAV): Promise<VerificationResult>
```

验证握手请求（nonce=0, amount=0）。

**参数：**

- `signedSubRAV`: 握手用的已签名 SubRAV

**返回：**

- `VerificationResult`: 验证结果

#### confirmDeferredPayment

```typescript
async confirmDeferredPayment(signedSubRAV: SignedSubRAV): Promise<VerificationResult>
```

确认延迟支付（验证之前生成的 SubRAV 提案）。

**参数：**

- `signedSubRAV`: 客户端签名返回的 SubRAV

**返回：**

- `VerificationResult`: 验证结果

#### generateProposal

```typescript
async generateProposal(
  context: BillingContext,
  amount: bigint
): Promise<SubRAV>
```

生成新的 SubRAV 提案供客户端签名。

**参数：**

- `context`: 计费上下文
- `amount`: 支付金额

**返回：**

- `SubRAV`: 未签名的 SubRAV 提案

### Utility Methods

#### clearExpiredProposals

```typescript
async clearExpiredProposals(maxAgeMinutes: number = 30): Promise<number>
```

清理过期的 SubRAV 提案。

#### getProcessingStats

```typescript
getProcessingStats(): PaymentProcessingStats
```

获取支付处理统计信息。

#### findPendingProposal

```typescript
async findPendingProposal(
  channelId: string,
  nonce: bigint
): Promise<SubRAV | null>
```

查找待处理的 SubRAV 提案。

## Enhanced PaymentChannelPayeeClient

### New Methods

#### verifyHandshake

```typescript
async verifyHandshake(signedSubRAV: SignedSubRAV): Promise<VerificationResult>
```

专门用于验证握手请求的方法。

#### confirmSignedProposal

```typescript
async confirmSignedProposal(
  signedSubRAV: SignedSubRAV,
  pendingStore: PendingSubRAVStore
): Promise<VerificationResult>
```

确认已签名的提案，集成 pending store 验证。

#### generateProposal

```typescript
async generateProposal(params: {
  channelId: string;
  vmIdFragment: string;
  amount: bigint;
  description?: string;
}): Promise<SubRAV>
```

生成支付提案的高级方法。

## Enhanced PaymentChannelPayerClient

### PaymentCodec Interface

```typescript
export interface PaymentCodec {
  encode(signedSubRAV: SignedSubRAV, metadata?: any): string;
  decode(encoded: string): { signedSubRAV: SignedSubRAV; metadata?: any };
}
```

### New Methods

#### signAndEncode

```typescript
async signAndEncode(
  subRAV: SubRAV,
  codec: PaymentCodec,
  options?: SignSubRAVOptions
): Promise<string>
```

协议无关的签名和编码方法。

**使用示例：**

```typescript
// HTTP 客户端
const httpCodec = new HttpPaymentCodec();
const encodedPayment = await payerClient.signAndEncode(receivedSubRAV, httpCodec);

// 添加到下一个请求的 header
req.headers['X-Payment-Channel-Data'] = encodedPayment;
```

#### decodeAndValidate

```typescript
async decodeAndValidate(
  encoded: string,
  codec: PaymentCodec
): Promise<{ subRAV: SubRAV; metadata?: any }>
```

解码并验证服务端响应。

## Utility Classes

### PaymentUtils

```typescript
export class PaymentUtils {
  static generateTxRef(): string;
  static subRAVsMatch(subRAV1: SubRAV, subRAV2: SubRAV): boolean;
  static isHandshake(subRAV: SubRAV): boolean;
  static extractErrorCode(error: string): string;
}
```

### BillingContextBuilder

```typescript
export class BillingContextBuilder {
  static build(
    serviceId: string,
    requestMeta: RequestMetadata,
    defaultAssetId?: string
  ): BillingContext;

  static fromHttpRequest(
    serviceId: string,
    req: Request,
    paymentData?: HttpRequestPayload
  ): BillingContext;
}
```

## Protocol Codec Examples

### HttpPaymentCodec

```typescript
export class HttpPaymentCodec implements PaymentCodec {
  encode(signedSubRAV: SignedSubRAV, metadata?: any): string {
    const payload: HttpRequestPayload = {
      signedSubRav: signedSubRAV,
      ...metadata,
    };
    return HttpHeaderCodec.buildRequestHeader(payload);
  }

  decode(encoded: string): { signedSubRAV: SignedSubRAV; metadata?: any } {
    const payload = HttpHeaderCodec.parseRequestHeader(encoded);
    return {
      signedSubRAV: payload.signedSubRav,
      metadata: {
        /* additional fields */
      },
    };
  }
}
```

### McpPaymentCodec (Future)

```typescript
export class McpPaymentCodec implements PaymentCodec {
  encode(signedSubRAV: SignedSubRAV, metadata?: any): string {
    // MCP-specific encoding
    return JSON.stringify({
      type: 'payment',
      data: signedSubRAV,
      metadata,
    });
  }

  decode(encoded: string): { signedSubRAV: SignedSubRAV; metadata?: any } {
    // MCP-specific decoding
    const parsed = JSON.parse(encoded);
    return {
      signedSubRAV: parsed.data,
      metadata: parsed.metadata,
    };
  }
}
```

## Usage Patterns

### HTTP Middleware Pattern

```typescript
const processor = new PaymentProcessor(config);

app.use(async (req, res, next) => {
  // 1. Extract payment data from headers
  const paymentData = extractPaymentData(req.headers);

  // 2. Build request metadata
  const requestMeta = BillingContextBuilder.fromHttpRequest(serviceId, req, paymentData);

  // 3. Process payment
  const result = await processor.processPayment(requestMeta, paymentData?.signedSubRav);

  // 4. Handle result
  if (!result.success) {
    return res.status(402).json({ error: result.error });
  }

  // 5. Add proposal to response
  if (result.unsignedSubRAV) {
    const responsePayload = {
      subRav: result.unsignedSubRAV,
      amountDebited: result.cost,
      serviceTxRef: result.serviceTxRef,
    };
    const headerValue = HttpHeaderCodec.buildResponseHeader(responsePayload);
    res.setHeader('X-Payment-Channel-Data', headerValue);
  }

  // 6. Continue to business logic
  req.paymentResult = result;
  next();
});
```

### Client SDK Pattern

```typescript
const payerClient = new PaymentChannelPayerClient(options);
const httpCodec = new HttpPaymentCodec();

// In client request interceptor
if (lastResponseSubRAV) {
  const paymentHeader = await payerClient.signAndEncode(lastResponseSubRAV, httpCodec);
  request.headers['X-Payment-Channel-Data'] = paymentHeader;
}

// In client response interceptor
const responseHeader = response.headers['X-Payment-Channel-Data'];
if (responseHeader) {
  const { subRAV } = await payerClient.decodeAndValidate(responseHeader, httpCodec);
  // Store for next request
  lastResponseSubRAV = subRAV;
}
```

## Error Handling

### Error Codes

```typescript
export enum PaymentErrorCode {
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  INVALID_PAYMENT = 'INVALID_PAYMENT',
  UNKNOWN_SUBRAV = 'UNKNOWN_SUBRAV',
  TAMPERED_SUBRAV = 'TAMPERED_SUBRAV',
  PAYMENT_ERROR = 'PAYMENT_ERROR',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  CHANNEL_CLOSED = 'CHANNEL_CLOSED',
  EPOCH_MISMATCH = 'EPOCH_MISMATCH',
}
```

### Error Handling Pattern

```typescript
const result = await processor.processPayment(requestMeta, signedSubRAV);

if (!result.success) {
  switch (result.errorCode) {
    case PaymentErrorCode.UNKNOWN_SUBRAV:
      return protocolAdapter.badRequest(result.error);
    case PaymentErrorCode.TAMPERED_SUBRAV:
      return protocolAdapter.badRequest(result.error);
    case PaymentErrorCode.PAYMENT_REQUIRED:
      return protocolAdapter.paymentRequired(result.error);
    default:
      return protocolAdapter.internalError(result.error);
  }
}
```

## Testing

### Unit Test Example

```typescript
describe('PaymentProcessor', () => {
  let processor: PaymentProcessor;
  let mockPayeeClient: jest.Mocked<PaymentChannelPayeeClient>;
  let mockBillingEngine: jest.Mocked<CostCalculator>;

  beforeEach(() => {
    processor = new PaymentProcessor({
      payeeClient: mockPayeeClient,
      billingEngine: mockBillingEngine,
      serviceId: 'test-service',
    });
  });

  it('should handle handshake request', async () => {
    const handshakeSubRAV = createHandshakeSubRAV();
    mockPayeeClient.verifyHandshake.mockResolvedValue({ isValid: true });
    mockBillingEngine.calcCost.mockResolvedValue(BigInt(100));

    const result = await processor.processPayment({ operation: 'POST:/test' }, handshakeSubRAV);

    expect(result.success).toBe(true);
    expect(result.isHandshake).toBe(true);
    expect(result.cost).toBe(BigInt(100));
  });
});
```
