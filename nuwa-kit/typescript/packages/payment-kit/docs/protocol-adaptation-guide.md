# Protocol Adaptation Guide

## Overview

本指南介绍如何使用 `PaymentProcessor` 架构为新协议实现 billing middleware。通过这种设计，您只需要实现协议特定的适配层，所有的支付逻辑都可以复用。

## 架构原理

```
Client Request → Protocol Adapter → PaymentProcessor → Business Logic
     ↓                ↓                    ↓              ↓
Protocol Data → RequestMetadata → PaymentResult → Protocol Response
```

## 实现步骤

### 1. 定义协议数据结构

首先定义协议特定的数据结构和编解码逻辑。

#### 示例：MCP 协议

```typescript
// MCP 支付载体
export interface McpPaymentFrame {
  type: 'payment';
  id: string;
  data: {
    signedSubRAV: SignedSubRAV;
    metadata?: Record<string, any>;
  };
}

// MCP 响应载体
export interface McpPaymentResponse {
  type: 'payment_proposal';
  id: string;
  data: {
    subRAV: SubRAV;
    amountDebited: string;
    serviceTxRef: string;
  };
}
```

### 2. 实现协议编解码器

实现 `PaymentCodec` 接口，处理协议特定的编码和解码。

```typescript
export class McpPaymentCodec implements PaymentCodec {
  encode(signedSubRAV: SignedSubRAV, metadata?: any): string {
    const frame: McpPaymentFrame = {
      type: 'payment',
      id: this.generateId(),
      data: {
        signedSubRAV,
        metadata
      }
    };
    return JSON.stringify(frame);
  }
  
  decode(encoded: string): { signedSubRAV: SignedSubRAV; metadata?: any } {
    const frame: McpPaymentFrame = JSON.parse(encoded);
    
    if (frame.type !== 'payment') {
      throw new Error(`Expected payment frame, got ${frame.type}`);
    }
    
    return {
      signedSubRAV: frame.data.signedSubRAV,
      metadata: frame.data.metadata
    };
  }
  
  private generateId(): string {
    return `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 3. 实现协议适配器

创建协议特定的 middleware 或 handler，负责协议层面的请求/响应处理。

```typescript
export interface McpBillingMiddlewareConfig {
  paymentProcessor: PaymentProcessor;
  debug?: boolean;
}

export class McpBillingMiddleware {
  private processor: PaymentProcessor;
  private codec: McpPaymentCodec;

  constructor(config: McpBillingMiddlewareConfig) {
    this.processor = config.paymentProcessor;
    this.codec = new McpPaymentCodec();
  }

  /**
   * 处理 MCP 请求
   */
  async handleRequest(request: McpRequest): Promise<McpResponse> {
    try {
      // 1. 提取支付数据
      const paymentData = this.extractPaymentData(request);
      
      // 2. 构建请求元数据
      const requestMeta = this.buildRequestMetadata(request, paymentData);
      
      // 3. 处理支付
      const result = await this.processor.processPayment(
        requestMeta,
        paymentData?.signedSubRAV
      );
      
      // 4. 处理失败情况
      if (!result.success) {
        return this.buildErrorResponse(request.id, result);
      }
      
      // 5. 执行业务逻辑
      const businessResponse = await this.executeBusiness(request);
      
      // 6. 添加支付提案到响应
      if (result.unsignedSubRAV) {
        this.addPaymentProposal(businessResponse, result);
      }
      
      return businessResponse;
      
    } catch (error) {
      return this.buildErrorResponse(
        request.id, 
        { 
          success: false, 
          error: `MCP billing error: ${error}`,
          errorCode: 'MCP_BILLING_ERROR'
        }
      );
    }
  }

  /**
   * 从 MCP 请求中提取支付数据
   */
  private extractPaymentData(request: McpRequest): { signedSubRAV: SignedSubRAV } | null {
    // MCP 中支付数据可能在 params 或专门的 payment frame 中
    const paymentFrame = request.params?.payment;
    if (!paymentFrame) {
      return null;
    }

    try {
      const decoded = this.codec.decode(JSON.stringify(paymentFrame));
      return { signedSubRAV: decoded.signedSubRAV };
    } catch (error) {
      throw new Error(`Invalid MCP payment data: ${error}`);
    }
  }

  /**
   * 构建协议无关的请求元数据
   */
  private buildRequestMetadata(
    request: McpRequest, 
    paymentData?: { signedSubRAV: SignedSubRAV }
  ): RequestMetadata {
    return {
      operation: `mcp:${request.method}`,
      
      // 从 MCP 参数中提取业务信息
      model: request.params?.model,
      assetId: request.params?.assetId,
      
      // 从支付数据中提取通道信息
      channelId: paymentData?.signedSubRAV.subRav.channelId,
      vmIdFragment: paymentData?.signedSubRAV.subRav.vmIdFragment,
      
      // MCP 特定信息
      mcpMethod: request.method,
      mcpParams: request.params,
      mcpId: request.id
    };
  }

  /**
   * 执行业务逻辑
   */
  private async executeBusiness(request: McpRequest): Promise<McpResponse> {
    // 根据 MCP 方法调用相应的业务处理器
    switch (request.method) {
      case 'llm/generate':
        return this.handleLlmGenerate(request);
      case 'tools/call':
        return this.handleToolCall(request);
      default:
        throw new Error(`Unsupported MCP method: ${request.method}`);
    }
  }

  /**
   * 添加支付提案到响应
   */
  private addPaymentProposal(
    response: McpResponse, 
    paymentResult: PaymentProcessingResult
  ): void {
    if (!paymentResult.unsignedSubRAV) return;

    const proposalFrame: McpPaymentResponse = {
      type: 'payment_proposal',
      id: this.generateId(),
      data: {
        subRAV: paymentResult.unsignedSubRAV,
        amountDebited: paymentResult.cost.toString(),
        serviceTxRef: paymentResult.serviceTxRef || ''
      }
    };

    // 将支付提案添加到响应中
    if (!response.meta) response.meta = {};
    response.meta.paymentProposal = proposalFrame;
  }

  /**
   * 构建错误响应
   */
  private buildErrorResponse(
    requestId: string, 
    result: { error?: string; errorCode?: string }
  ): McpResponse {
    return {
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code: this.mapErrorCode(result.errorCode),
        message: result.error || 'Payment required',
        data: {
          errorCode: result.errorCode,
          type: 'payment_error'
        }
      }
    };
  }

  /**
   * 映射错误码到 MCP 错误码
   */
  private mapErrorCode(errorCode?: string): number {
    switch (errorCode) {
      case 'PAYMENT_REQUIRED': return -32600; // Invalid Request
      case 'INVALID_PAYMENT': return -32602; // Invalid params
      case 'UNKNOWN_SUBRAV': return -32602;
      case 'TAMPERED_SUBRAV': return -32602;
      default: return -32603; // Internal error
    }
  }
}
```

### 4. 创建协议工厂函数

提供便捷的工厂函数来创建协议特定的 middleware。

```typescript
export interface CreateMcpBillingOptions {
  payeeClient: PaymentChannelPayeeClient;
  billingEngine: CostCalculator;
  serviceId: string;
  defaultAssetId?: string;
  debug?: boolean;
}

export function createMcpBillingMiddleware(
  options: CreateMcpBillingOptions
): McpBillingMiddleware {
  const processor = new PaymentProcessor({
    payeeClient: options.payeeClient,
    billingEngine: options.billingEngine,
    serviceId: options.serviceId,
    defaultAssetId: options.defaultAssetId,
    debug: options.debug
  });

  return new McpBillingMiddleware({
    paymentProcessor: processor,
    debug: options.debug
  });
}
```

### 5. 客户端支持

为新协议创建客户端支持代码。

```typescript
export class McpPaymentClient {
  private payerClient: PaymentChannelPayerClient;
  private codec: McpPaymentCodec;
  private lastProposal?: SubRAV;

  constructor(payerClient: PaymentChannelPayerClient) {
    this.payerClient = payerClient;
    this.codec = new McpPaymentCodec();
  }

  /**
   * 准备带支付的 MCP 请求
   */
  async prepareRequest(request: McpRequest): Promise<McpRequest> {
    if (!this.lastProposal) {
      // 首次请求或握手
      return request;
    }

    // 签名上次的提案并添加到请求
    const paymentData = await this.payerClient.signAndEncode(
      this.lastProposal,
      this.codec
    );

    return {
      ...request,
      params: {
        ...request.params,
        payment: JSON.parse(paymentData)
      }
    };
  }

  /**
   * 处理 MCP 响应中的支付提案
   */
  async handleResponse(response: McpResponse): Promise<void> {
    const paymentProposal = response.meta?.paymentProposal;
    if (paymentProposal && paymentProposal.type === 'payment_proposal') {
      this.lastProposal = paymentProposal.data.subRAV;
    }
  }

  /**
   * 执行握手
   */
  async handshake(channelId: string): Promise<McpRequest> {
    // 创建握手 SubRAV (nonce=0, amount=0)
    const handshakeSubRAV = await this.payerClient.createHandshake(channelId);
    const paymentData = await this.payerClient.signAndEncode(
      handshakeSubRAV,
      this.codec
    );

    return {
      jsonrpc: '2.0',
      id: 'handshake_' + Date.now(),
      method: 'payment/handshake',
      params: {
        payment: JSON.parse(paymentData)
      }
    };
  }
}
```

## 完整示例：A2A 协议

### A2A 消息格式

```typescript
export interface A2aMessage {
  id: string;
  type: 'request' | 'response';
  service: string;
  method: string;
  payload: any;
  payment?: {
    signedSubRAV: SignedSubRAV;
    metadata?: any;
  };
}

export interface A2aPaymentProposal {
  subRAV: SubRAV;
  cost: string;
  txRef: string;
}
```

### A2A 编解码器

```typescript
export class A2aPaymentCodec implements PaymentCodec {
  encode(signedSubRAV: SignedSubRAV, metadata?: any): string {
    return JSON.stringify({
      signedSubRAV,
      metadata
    });
  }
  
  decode(encoded: string): { signedSubRAV: SignedSubRAV; metadata?: any } {
    const parsed = JSON.parse(encoded);
    return {
      signedSubRAV: parsed.signedSubRAV,
      metadata: parsed.metadata
    };
  }
}
```

### A2A Middleware

```typescript
export class A2aBillingMiddleware {
  private processor: PaymentProcessor;
  private codec: A2aPaymentCodec;

  constructor(config: { paymentProcessor: PaymentProcessor }) {
    this.processor = config.paymentProcessor;
    this.codec = new A2aPaymentCodec();
  }

  async handleMessage(message: A2aMessage): Promise<A2aMessage> {
    if (message.type !== 'request') {
      return message; // 只处理请求
    }

    // 提取支付数据
    const paymentData = message.payment;
    
    // 构建请求元数据
    const requestMeta: RequestMetadata = {
      operation: `a2a:${message.service}:${message.method}`,
      service: message.service,
      method: message.method,
      channelId: paymentData?.signedSubRAV.subRav.channelId,
      vmIdFragment: paymentData?.signedSubRAV.subRav.vmIdFragment,
      a2aMessageId: message.id
    };

    // 处理支付
    const result = await this.processor.processPayment(
      requestMeta,
      paymentData?.signedSubRAV
    );

    if (!result.success) {
      return {
        id: message.id,
        type: 'response',
        service: message.service,
        method: message.method,
        payload: {
          error: result.error,
          code: result.errorCode
        }
      };
    }

    // 执行业务逻辑
    const businessResult = await this.executeA2aMethod(message);

    // 添加支付提案
    if (result.unsignedSubRAV) {
      businessResult.payment = {
        subRAV: result.unsignedSubRAV,
        cost: result.cost.toString(),
        txRef: result.serviceTxRef || ''
      };
    }

    return businessResult;
  }

  private async executeA2aMethod(message: A2aMessage): Promise<A2aMessage> {
    // A2A 业务逻辑处理
    return {
      id: message.id,
      type: 'response',
      service: message.service,
      method: message.method,
      payload: { success: true }
    };
  }
}
```

## 测试策略

### 单元测试

```typescript
describe('McpBillingMiddleware', () => {
  let middleware: McpBillingMiddleware;
  let mockProcessor: jest.Mocked<PaymentProcessor>;

  beforeEach(() => {
    mockProcessor = createMockPaymentProcessor();
    middleware = new McpBillingMiddleware({
      paymentProcessor: mockProcessor
    });
  });

  it('should handle MCP request with payment', async () => {
    const request: McpRequest = {
      jsonrpc: '2.0',
      id: 'test-1',
      method: 'llm/generate',
      params: {
        model: 'gpt-4',
        payment: { /* payment frame */ }
      }
    };

    mockProcessor.processPayment.mockResolvedValue({
      success: true,
      cost: BigInt(100),
      assetId: 'USDC'
    });

    const response = await middleware.handleRequest(request);
    
    expect(response.error).toBeUndefined();
    expect(mockProcessor.processPayment).toHaveBeenCalled();
  });
});
```

### 集成测试

```typescript
describe('MCP Billing Integration', () => {
  it('should complete full payment flow', async () => {
    // 1. Setup
    const middleware = createMcpBillingMiddleware(config);
    const client = new McpPaymentClient(payerClient);

    // 2. Handshake
    const handshakeRequest = await client.handshake(channelId);
    const handshakeResponse = await middleware.handleRequest(handshakeRequest);
    await client.handleResponse(handshakeResponse);

    // 3. First paid request
    const request = await client.prepareRequest({
      jsonrpc: '2.0',
      id: 'test-1',
      method: 'llm/generate',
      params: { model: 'gpt-4' }
    });

    const response = await middleware.handleRequest(request);
    await client.handleResponse(response);

    // 4. Verify payment was processed
    expect(response.error).toBeUndefined();
    expect(response.meta?.paymentProposal).toBeDefined();
  });
});
```

## 最佳实践

### 1. 错误处理

```typescript
// 协议特定的错误映射
private mapToProtocolError(result: PaymentProcessingResult): ProtocolError {
  switch (result.errorCode) {
    case 'PAYMENT_REQUIRED':
      return new ProtocolPaymentRequiredError(result.error);
    case 'INVALID_PAYMENT':
      return new ProtocolInvalidParamsError(result.error);
    default:
      return new ProtocolInternalError(result.error);
  }
}
```

### 2. 性能优化

```typescript
// 缓存 PaymentProcessor 实例
private static processorCache = new Map<string, PaymentProcessor>();

static getProcessor(serviceId: string): PaymentProcessor {
  if (!this.processorCache.has(serviceId)) {
    this.processorCache.set(serviceId, createProcessor(serviceId));
  }
  return this.processorCache.get(serviceId)!;
}
```

### 3. 可观察性

```typescript
// 添加协议特定的监控
private async handleWithMetrics(request: ProtocolRequest): Promise<ProtocolResponse> {
  const startTime = Date.now();
  
  try {
    const result = await this.processor.processPayment(/* ... */);
    
    // 记录成功指标
    this.metrics.recordPaymentSuccess(request.method, Date.now() - startTime);
    
    return result;
  } catch (error) {
    // 记录失败指标
    this.metrics.recordPaymentFailure(request.method, error.message);
    throw error;
  }
}
```

### 4. 配置管理

```typescript
export interface ProtocolBillingConfig {
  serviceId: string;
  payeeClient: PaymentChannelPayeeClient;
  billingEngine: CostCalculator;
  
  // 协议特定配置
  protocolOptions: {
    timeout?: number;
    maxRetries?: number;
    customErrorMapping?: Record<string, number>;
  };
}
```

## 总结

通过遵循这个指南，您可以：

1. **快速实现新协议支持** - 只需要实现协议适配层
2. **复用支付逻辑** - 所有支付验证、状态管理等逻辑都可复用
3. **保持一致性** - 所有协议的支付行为保持一致
4. **便于测试** - 协议层和支付层可以独立测试
5. **易于维护** - 支付逻辑的修改自动应用到所有协议

这种架构设计使得添加新协议变得非常简单，同时保持了代码的可维护性和一致性。