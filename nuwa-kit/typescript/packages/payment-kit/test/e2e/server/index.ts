import express, { Request, Response, NextFunction } from 'express';
import { createExpressPaymentKitFromEnv } from '../../../src/integrations/express/fromIdentityEnv';
import { HttpPaymentCodec } from '../../../src/middlewares/http/HttpPaymentCodec';
import type { 
  HttpRequestPayload, 
  HttpResponsePayload, 
  SubRAV 
} from '../../../src/core/types';
import type { IdentityEnv } from '@nuwa-ai/identity-kit';
import { DIDAuth } from '@nuwa-ai/identity-kit';

/**
 * Simplified billing server configuration using IdentityEnv
 * 
 * This interface has been streamlined to only accept IdentityEnv,
 * eliminating the need for multiple configuration approaches.
 * Each CreateSelfDidResult now includes its own IdentityEnv,
 * making multi-party testing scenarios clean and conflict-free.
 */
export interface BillingServerConfig {
  // Use IdentityEnv for simplified configuration
  env: IdentityEnv;
  
  // Common configuration
  port?: number;
  serviceId?: string;
  defaultAssetId?: string;
  debug?: boolean;
  // Admin DIDs that can access admin endpoints
  adminDid?: string | string[];
}

export async function createBillingServer(config: BillingServerConfig) {
  const {
    env,
    port = 3000,
    serviceId = 'echo-service',
    defaultAssetId = '0x3::gas_coin::RGas',
    debug = true,
    adminDid
  } = config;

  const app = express();
  app.use(express.json());

  // 1. Create ExpressPaymentKit integration for billing functionality
  const billing = await createExpressPaymentKitFromEnv(env, {
    serviceId,
    defaultAssetId,
    defaultPricePicoUSD: '500000000', // 0.0005 USD
    adminDid,
    debug
  });

  // 2. Declare routes & pricing strategies
  billing.get('/echo', '1000000000', (req: Request, res: Response) => { // 0.001 USD = 1,000,000,000 picoUSD
    const paymentResult = (req as any).paymentResult;
    res.json({
      echo: req.query.q || 'hello',
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString(),
      timestamp: new Date().toISOString()
    });
  });

  billing.post('/process', '10000000000', (req: Request, res: Response) => { // 0.01 USD = 10,000,000,000 picoUSD
    const paymentResult = (req as any).paymentResult;
    res.json({
      processed: req.body,
      timestamp: Date.now(),
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString()
    });
  });

  // Test new route with PerToken strategy
  billing.post('/chat/completions', {
    type: 'PerToken',
    unitPricePicoUSD: '20000', // 0.00002 USD per token
    usageKey: 'usage.total_tokens'
  }, (req: Request, res: Response) => {
    const paymentResult = (req as any).paymentResult;
    
    // Mock LLM response and usage
    const mockUsage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150
    };
    
    // Set usage to res.locals (ExpressPaymentKit will read this)
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
      // Billing information
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString()
    });
  });

  // Original business routes have been migrated to BillableRouter

  // 4. Mount admin and recovery routes
  app.use('/payment-channel/admin', billing.adminRouter()); // Admin interface
  app.use('/payment-channel', billing.recoveryRouter()); // Client recovery interface


  // 5. Mount billing routes
  app.use('/api', billing.router);

  const server = app.listen(port);
  
  return {
    app,
    server,
    billing, // ExpressPaymentKit instance
    baseURL: `http://localhost:${port}`,
    async shutdown() {
      server.close();
    }
  };
}