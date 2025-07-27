import express, { Request, Response } from 'express';
import { HttpBillingMiddleware } from '../../core/http-billing-middleware';
import { HttpHeaderCodec } from '../../core/http-header';
import type { 
  HttpRequestPayload, 
  HttpResponsePayload, 
  SubRAV 
} from '../../core/types';
import type { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface BillingServerConfig {
  payeeClient: PaymentChannelPayeeClient;
  port?: number;
  serviceId?: string;
  defaultAssetId?: string;
  autoClaimThreshold?: bigint;
  autoClaimNonceThreshold?: number;
  debug?: boolean;
}

export async function createBillingServer(config: BillingServerConfig) {
  const {
    payeeClient,
    port = 3000,
    serviceId = 'echo-service',
    defaultAssetId = '0x3::gas_coin::RGas',
    autoClaimThreshold = BigInt('100000000'), // 1 RGas
    autoClaimNonceThreshold = 10,
    debug = true
  } = config;

  const app = express();
  app.use(express.json());

  // 1. 设置计费配置
  const configDir = path.join(__dirname, 'billing-config');
  await fs.mkdir(configDir, { recursive: true });
  
  // 创建计费配置文件
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
      price: "1000000"  # 0.001 RGas per echo
  - id: expensive-operation
    when:
      path: "/v1/process"
      method: "POST"
    strategy:
      type: PerRequest
      price: "10000000"  # 0.01 RGas per process
  - id: default-pricing
    default: true
    strategy:
      type: PerRequest
      price: "500000"  # 0.0005 RGas default
`;

  await fs.writeFile(
    path.join(configDir, `${serviceId}.yaml`),
    billingConfigContent,
    'utf-8'
  );

  // 2. 创建简单的计费引擎（用于测试）
  const simpleBillingEngine = {
    async calcCost(context: any): Promise<bigint> {
      const { operation, meta } = context;
      
      // 根据路径和方法计算费用
      if (operation === 'get:/v1/echo') {
        return BigInt('1000000'); // 0.001 RGas
      } else if (operation === 'post:/v1/process') {
        return BigInt('10000000'); // 0.01 RGas
      }
      
      return BigInt('500000'); // 默认 0.0005 RGas
    }
  };

  // 3. 创建支付中间件
  const paymentMiddleware = new HttpBillingMiddleware({
    payeeClient,
    billingEngine: simpleBillingEngine,
    serviceId,
    defaultAssetId,
    requirePayment: true,
    autoClaimThreshold,
    autoClaimNonceThreshold,
    debug
  });

  // 4. 应用支付中间件到所有路由
  app.use(paymentMiddleware.createExpressMiddleware());

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
  app.get('/admin/claims', (req: Request, res: Response) => {
    const claimsStats = paymentMiddleware.getPendingClaimsStats();
    const subRAVsStats = paymentMiddleware.getPendingSubRAVsStats();
    res.json({ 
      pendingClaims: claimsStats,
      pendingSubRAVs: subRAVsStats,
      timestamp: new Date().toISOString()
    });
  });

  app.post('/admin/claim/:channelId', async (req: Request, res: Response) => {
    try {
      const success = await paymentMiddleware.manualClaim(req.params.channelId);
      res.json({ success, channelId: req.params.channelId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/admin/subrav/:channelId/:nonce', (req: Request, res: Response) => {
    const { channelId, nonce } = req.params;
    const subRAV = paymentMiddleware.findPendingSubRAV(channelId, BigInt(nonce));
    if (subRAV) {
      res.json(subRAV);
    } else {
      res.status(404).json({ error: 'SubRAV not found' });
    }
  });

  app.delete('/admin/cleanup', (req: Request, res: Response) => {
    const maxAge = parseInt(req.query.maxAge as string) || 30;
    const clearedCount = paymentMiddleware.clearExpiredPendingSubRAVs(maxAge);
    res.json({ clearedCount, maxAgeMinutes: maxAge });
  });

  app.get('/admin/security', (req: Request, res: Response) => {
    const suspiciousActivity = paymentMiddleware.getSuspiciousActivityStats();
    res.json({
      suspiciousActivity,
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

  return {
    async callEcho(query: string) {
      let headers: Record<string, string> = {};
      
      // 1. 如果有上一次的 SubRAV，签名并放入请求头
      if (pendingSubRAV) {
        const signedRav = await payerClient.signSubRAV(pendingSubRAV);
        
        const requestPayload: HttpRequestPayload = {
          channelId,
          signedSubRav: signedRav,
          maxAmount: BigInt('50000000'), // 最大接受 0.05 RGas
          clientTxRef: `client_${Date.now()}`
        };

        headers['X-Payment-Channel-Data'] = HttpHeaderCodec.buildRequestHeader(requestPayload);
      }
      
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
          const responsePayload: HttpResponsePayload = HttpHeaderCodec.parseResponseHeader(paymentHeader);
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
      
      // 如果有上一次的 SubRAV，签名并放入请求头
      if (pendingSubRAV) {
        const signedRav = await payerClient.signSubRAV(pendingSubRAV);
        
        const requestPayload: HttpRequestPayload = {
          channelId,
          signedSubRav: signedRav,
          maxAmount: BigInt('50000000'), // 最大接受 0.05 RGas
          clientTxRef: `client_${Date.now()}`
        };

        headers['X-Payment-Channel-Data'] = HttpHeaderCodec.buildRequestHeader(requestPayload);
      }
      
      const response = await fetch(`${baseURL}/v1/process`, {
        method: 'POST',
        headers,
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
          const responsePayload: HttpResponsePayload = HttpHeaderCodec.parseResponseHeader(paymentHeader);
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
    },

    // 获取管理信息
    async getAdminClaims() {
      const response = await fetch(`${baseURL}/admin/claims`);
      return await response.json();
    },

    async triggerClaim(channelId: string) {
      const response = await fetch(`${baseURL}/admin/claim/${channelId}`, {
        method: 'POST'
      });
      return await response.json();
    }
  };
} 