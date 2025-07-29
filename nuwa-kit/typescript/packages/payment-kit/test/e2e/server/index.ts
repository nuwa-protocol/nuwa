import express, { Request, Response, NextFunction } from 'express';
import { createExpressBillingKit } from '../../../src/integrations/express/ExpressBillingKit';
import { HttpPaymentCodec } from '../../../src/middlewares/http/HttpPaymentCodec';
import type { 
  HttpRequestPayload, 
  HttpResponsePayload, 
  SubRAV 
} from '../../../src/core/types';
import type { PaymentChannelPayeeClient } from '../../../src/client/PaymentChannelPayeeClient';

export interface BillingServerConfig {
  payeeClient: PaymentChannelPayeeClient;
  port?: number;
  serviceId?: string;
  defaultAssetId?: string;
  debug?: boolean;
  rpcUrl?: string; // For RateProvider to query chain info
}

export async function createBillingServer(config: BillingServerConfig) {
  const {
    payeeClient,
    port = 3000,
    serviceId = 'echo-service',
    defaultAssetId = '0x3::gas_coin::RGas',
    debug = true,
    rpcUrl
  } = config;

  const app = express();
  app.use(express.json());

  // 1. 创建 ExpressBillingKit 集成计费功能
  const billing = await createExpressBillingKit({
    serviceId,
    payeeClient,
    defaultAssetId,
    defaultPricePicoUSD: '500000000', // 0.0005 USD
    didAuth: { enabled: false }, // 测试环境暂时关闭 DID 认证
    debug
  });

  // 2. 声明路由 & 计价策略
  billing.get('/v1/echo', '1000000000', (req: Request, res: Response) => {
    const paymentResult = (req as any).paymentResult;
    res.json({
      echo: req.query.q || 'hello',
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString(),
      timestamp: new Date().toISOString()
    });
  });

  billing.post('/v1/process', '10000000000', (req: Request, res: Response) => {
    const paymentResult = (req as any).paymentResult;
    res.json({
      processed: req.body,
      timestamp: Date.now(),
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString()
    });
  });

  // 测试 PerToken 策略的新路由
  billing.post('/v1/chat/completions', {
    type: 'PerToken',
    unitPricePicoUSD: '20000', // 0.00002 USD per token
    usageKey: 'usage.total_tokens'
  }, (req: Request, res: Response) => {
    const paymentResult = (req as any).paymentResult;
    
    // 模拟 LLM 响应和使用情况
    const mockUsage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150
    };
    
    // 设置使用情况到 res.locals（ExpressBillingKit 会读取这个）
    res.locals.usage = mockUsage;
    
    res.json({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-3.5-turbo',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: `Echo: ${JSON.stringify(req.body)}`
        },
        finish_reason: 'stop'
      }],
      usage: mockUsage,
      // 计费信息
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString()
    });
  });

  // 3. 挂载计费路由
  app.use(billing.router);

  // 原业务路由已迁移到 BillableRouter 中

  // 4. 挂载管理和恢复路由
  app.use('/admin', billing.adminRouter()); // 管理接口
  app.use('/payment', billing.recoveryRouter()); // 客户端恢复接口

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const server = app.listen(port);
  
  return {
    app,
    server,
    billing, // ExpressBillingKit instance
    baseURL: `http://localhost:${port}`,
    async shutdown() {
      server.close();
    }
  };
}

// 客户端调用示例（延迟支付模式）
export function createTestClient(payerClient: any, baseURL: string, channelId: string) {
  let pendingSubRAV: SubRAV | null = null; // 缓存上一次的 SubRAV
  let isFirstRequest = true; // 标记是否为首次请求

  return {
    async callEcho(query: string) {
      let headers: Record<string, string> = {};
      
      // 1. 总是生成签名的 SubRAV
      let signedSubRAV: any;
      
      if (pendingSubRAV) {
        // 使用服务器提案的 SubRAV
        signedSubRAV = await payerClient.signSubRAV(pendingSubRAV);
      } else if (isFirstRequest) {
        // 首次请求：生成握手 SubRAV (nonce=0, amount=0)
        const channelInfo = await payerClient.getChannelInfo(channelId);
        const keyIds = await payerClient.signer.listKeyIds();
        const vmIdFragment = keyIds[0].split('#')[1]; // 提取 fragment 部分
        
        const handshakeSubRAV: SubRAV = {
          version: 1,
          chainId: BigInt(4), // 根据网络配置
          channelId,
          channelEpoch: channelInfo.epoch,
          vmIdFragment,
          accumulatedAmount: 0n,
          nonce: 0n
        };
        
        signedSubRAV = await payerClient.signSubRAV(handshakeSubRAV);
        isFirstRequest = false;
      } else {
        throw new Error('No pending SubRAV available for non-first request');
      }

      const requestPayload: HttpRequestPayload = {
        signedSubRav: signedSubRAV,
        maxAmount: BigInt('50000000'), // 最大接受 0.05 RGas
        clientTxRef: `client_${Date.now()}`
      };

      headers['X-Payment-Channel-Data'] = HttpPaymentCodec.buildRequestHeader(requestPayload);
      
      // 2. 发送请求
      const url = `${baseURL}/v1/echo?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Request failed: ${response.status} - ${errorData.error || response.statusText}`);
      }

      // 3. 处理响应，提取下一次的 SubRAV 提案
      const paymentHeader = response.headers.get('X-Payment-Channel-Data');
      if (paymentHeader) {
        try {
          const responsePayload: HttpResponsePayload = HttpPaymentCodec.parseResponseHeader(paymentHeader);
          // 缓存未签名的 SubRAV 用于下次请求
          pendingSubRAV = responsePayload.subRav;
        } catch (error) {
          console.warn('Failed to parse payment header:', error);
        }
      }

      return await response.json();
    },

    async callProcess(data: any) {
      let headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // 生成签名的 SubRAV
      let signedSubRAV: any;
      
      if (pendingSubRAV) {
        // 使用服务器提案的 SubRAV
        signedSubRAV = await payerClient.signSubRAV(pendingSubRAV);
      } else if (isFirstRequest) {
        // 首次请求：生成握手 SubRAV (nonce=0, amount=0)
        const channelInfo = await payerClient.getChannelInfo(channelId);
        const keyIds = await payerClient.signer.listKeyIds();
        const vmIdFragment = keyIds[0].split('#')[1]; // 提取 fragment 部分
        
        const handshakeSubRAV: SubRAV = {
          version: 1,
          chainId: BigInt(4), // 根据网络配置
          channelId,
          channelEpoch: channelInfo.epoch,
          vmIdFragment,
          accumulatedAmount: 0n,
          nonce: 0n
        };
        
        signedSubRAV = await payerClient.signSubRAV(handshakeSubRAV);
        isFirstRequest = false;
      } else {
        throw new Error('No pending SubRAV available for non-first request');
      }

      const requestPayload: HttpRequestPayload = {
        signedSubRav: signedSubRAV,
        maxAmount: BigInt('50000000'), // 最大接受 0.05 RGas
        clientTxRef: `client_${Date.now()}`
      };

      headers['X-Payment-Channel-Data'] = HttpPaymentCodec.buildRequestHeader(requestPayload);
      
      const response = await fetch(`${baseURL}/v1/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Request failed: ${response.status} - ${errorData.error || response.statusText}`);
      }

      // 处理响应，提取下一次的 SubRAV 提案
      const paymentHeader = response.headers.get('X-Payment-Channel-Data');
      if (paymentHeader) {
        try {
          const responsePayload: HttpResponsePayload = HttpPaymentCodec.parseResponseHeader(paymentHeader);
          pendingSubRAV = responsePayload.subRav;
        } catch (error) {
          console.warn('Failed to parse payment header:', error);
        }
      }

      return await response.json();
    },

    // 获取当前待支付的 SubRAV
    getPendingSubRAV() {
      return pendingSubRAV;
    },

    // 清除待支付的 SubRAV（用于测试）
    clearPendingSubRAV() {
      pendingSubRAV = null;
      isFirstRequest = true; // 重置为首次请求状态
    },

    // 获取管理信息
    async getAdminClaims() {
      const response = await fetch(`${baseURL}/admin/claims`);
      const text = await response.text();
      
      if (!response.ok) {
        console.error(`❌ Admin claims request failed: ${response.status} ${response.statusText}`);
        console.error(`Response: ${text.substring(0, 200)}...`);
        throw new Error(`Admin claims request failed: ${response.status} - ${text.substring(0, 100)}`);
      }
      
      try {
        return JSON.parse(text);
      } catch (error) {
        console.error(`❌ Failed to parse admin claims response as JSON: ${text.substring(0, 200)}...`);
        throw new Error(`Expected JSON but got: ${text.substring(0, 100)}`);
      }
    },

    async triggerClaim(channelId: string) {
      const response = await fetch(`${baseURL}/admin/claim/${channelId}`, {
        method: 'POST'
      });
      return await response.json();
    },

    async callChatCompletions(messages: any[]) {
      let headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // 生成签名的 SubRAV
      let signedSubRAV: any;
      
      if (pendingSubRAV) {
        // 使用服务器提案的 SubRAV
        signedSubRAV = await payerClient.signSubRAV(pendingSubRAV);
      } else if (isFirstRequest) {
        // 首次请求：生成握手 SubRAV (nonce=0, amount=0)
        const channelInfo = await payerClient.getChannelInfo(channelId);
        const keyIds = await payerClient.signer.listKeyIds();
        const vmIdFragment = keyIds[0].split('#')[1]; // 提取 fragment 部分
        
        const handshakeSubRAV: SubRAV = {
          version: 1,
          chainId: BigInt(4), // 根据网络配置
          channelId,
          channelEpoch: channelInfo.epoch,
          vmIdFragment,
          accumulatedAmount: 0n,
          nonce: 0n
        };
        
        signedSubRAV = await payerClient.signSubRAV(handshakeSubRAV);
        isFirstRequest = false;
      } else {
        throw new Error('No pending SubRAV available for non-first request');
      }

      const requestPayload: HttpRequestPayload = {
        signedSubRav: signedSubRAV,
        maxAmount: BigInt('50000000'), // 最大接受 0.05 RGas
        clientTxRef: `client_${Date.now()}`
      };

      headers['X-Payment-Channel-Data'] = HttpPaymentCodec.buildRequestHeader(requestPayload);
      
      const response = await fetch(`${baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages,
          max_tokens: 100
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Request failed: ${response.status} - ${errorData.error || response.statusText}`);
      }

      // 处理响应，提取下一次的 SubRAV 提案
      const paymentHeader = response.headers.get('X-Payment-Channel-Data');
      if (paymentHeader) {
        try {
          const responsePayload: HttpResponsePayload = HttpPaymentCodec.parseResponseHeader(paymentHeader);
          pendingSubRAV = responsePayload.subRav;
        } catch (error) {
          console.warn('Failed to parse payment header:', error);
        }
      }

      return await response.json();
    }
  };
}