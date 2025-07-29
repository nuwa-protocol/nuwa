import express, { Request, Response, NextFunction } from 'express';
import { HttpBillingMiddleware } from '../../../src/middlewares/http/HttpBillingMiddleware';
import { HttpPaymentCodec } from '../../../src/middlewares/http/HttpPaymentCodec';
import type { 
  HttpRequestPayload, 
  HttpResponsePayload, 
  SubRAV 
} from '../../../src/core/types';
import type { PaymentChannelPayeeClient } from '../../../src/client/PaymentChannelPayeeClient';
import { UsdBillingEngine, FileConfigLoader } from '../../../src/billing';
import { ContractRateProvider } from '../../../src/billing/rate';
import * as fs from 'fs/promises';
import * as path from 'path';

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

  // 1. 设置计费配置
  const configDir = path.join(__dirname, 'billing-config');
  await fs.mkdir(configDir, { recursive: true });
  
  // 创建计费配置文件 (USD pricing in picoUSD units)
  const billingConfigContent = `
version: 1
serviceId: ${serviceId}
rules:
  - id: echo-pricing
    when:
      path: "/v1/echo"
      method: "GET"
    strategy:
      type: PerRequest
      price: "1000000000"  # 0.001 USD (1,000,000,000 picoUSD) per echo
  - id: expensive-operation
    when:
      path: "/v1/process"
      method: "POST"
    strategy:
      type: PerRequest
      price: "10000000000"  # 0.01 USD (10,000,000,000 picoUSD) per process
  - id: default-pricing
    default: true
    strategy:
      type: PerRequest
      price: "500000000"  # 0.0005 USD (500,000,000 picoUSD) default
`;

  await fs.writeFile(
    path.join(configDir, `${serviceId}.yaml`),
    billingConfigContent,
    'utf-8'
  );

  // 2. 创建 USD 计费引擎（USD 定价，Token 结算）
  const configLoader = new FileConfigLoader(configDir);
  
  // Get contract instance from payeeClient for price queries
  const contract = (payeeClient as any).contract; // Access the underlying contract
  if (!contract) {
    throw new Error('PayeeClient contract is required for ContractRateProvider');
  }
  
  const rateProvider = new ContractRateProvider(
    contract,
    30_000 // 30 seconds cache for on-chain data
  );
  
  const usdBillingEngine = new UsdBillingEngine(
    configLoader,
    rateProvider,
    {
      [defaultAssetId]: { decimals: 8 }, // RGas has 8 decimals
      'ethereum': { decimals: 18 },
      'usd-coin': { decimals: 6 },
      'bitcoin': { decimals: 8 }
    }
  );

  // 3. 创建支付中间件
  const paymentMiddleware = new HttpBillingMiddleware({
    payeeClient,
    billingEngine: usdBillingEngine,
    serviceId,
    defaultAssetId,
    debug
  });

  // 4. 应用支付中间件到所有路由，但跳过管理和健康检查路由
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    // Skip payment middleware for admin and health routes
    if (req.path.startsWith('/admin') || req.path === '/health') {
      return next();
    }
    
    try {
      await (paymentMiddleware.createExpressMiddleware() as any)(req, res, next);
    } catch (error) {
      console.error('🚨 Payment middleware error:', error);
      res.status(500).json({ error: 'Payment processing failed', details: error instanceof Error ? error.message : String(error) });
    }
  });

  // 5. 业务路由（支付验证后才会执行）
  app.get('/v1/echo', (req: Request, res: Response) => {
    const paymentResult = (req as any).paymentResult;
    res.json({ 
      echo: req.query.q || 'hello',
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString(),
      timestamp: new Date().toISOString()
    });
  });

  app.post('/v1/process', (req: Request, res: Response) => {
    const paymentResult = (req as any).paymentResult;
    res.json({ 
      processed: req.body,
      timestamp: Date.now(),
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString()
    });
  });

  // 6. 管理接口
  app.get('/admin/claims', async (req: Request, res: Response) => {
    try {
      const claimsStatus = paymentMiddleware.getClaimStatus();
      const processingStats = paymentMiddleware.getProcessingStats();
      
      res.json({ 
        claimsStatus,
        processingStats,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/admin/claim/:channelId', async (req: Request, res: Response) => {
    try {
      const success = await paymentMiddleware.manualClaim(req.params.channelId);
      res.json({ success, channelId: req.params.channelId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/admin/subrav/:channelId/:nonce', async (req: Request, res: Response) => {
    try {
      const { channelId, nonce } = req.params;
      const subRAV = await paymentMiddleware.findPendingProposal(channelId, BigInt(nonce));
      if (subRAV) {
        res.json(subRAV);
      } else {
        res.status(404).json({ error: 'SubRAV not found' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/admin/cleanup', async (req: Request, res: Response) => {
    try {
      const maxAge = parseInt(req.query.maxAge as string) || 30;
      const clearedCount = await paymentMiddleware.clearExpiredProposals(maxAge);
      res.json({ clearedCount, maxAgeMinutes: maxAge });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/admin/security', (req: Request, res: Response) => {
    // Security metrics are no longer tracked in the new architecture
    res.json({
      message: 'Security metrics not available in refactored architecture',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const server = app.listen(port);
  
  return {
    app,
    server,
    middleware: paymentMiddleware,
    baseURL: `http://localhost:${port}`,
    async shutdown() {
      server.close();
      await fs.rm(configDir, { recursive: true, force: true });
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
    }
  };
}