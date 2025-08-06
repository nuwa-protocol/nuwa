import express, { Request, Response, NextFunction } from 'express';
import { createExpressPaymentKitFromEnv } from '../../../src/transport/express/fromIdentityEnv';
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
  billing.get('/echo', { pricing: '1000000000' }, (req: Request, res: Response, next: NextFunction) => { // 0.001 USD = 1,000,000,000 picoUSD
    try {
      const paymentResult = (req as any).paymentResult;
      res.json({
        echo: req.query.q || 'hello',
        cost: paymentResult?.cost?.toString(),
        nonce: paymentResult?.subRav?.nonce?.toString(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Only handle specific error cases, let middleware errors propagate
      if (error instanceof Error && error.message.includes('Cannot set headers after they are sent')) {
        console.log('Response already sent by middleware, skipping route handler');
        return;
      }
      console.error('Error in /echo route:', error);
      next(error);
    }
  });

  billing.post('/process', { pricing: '10000000000' }, (req: Request, res: Response, next: NextFunction) => { // 0.01 USD = 10,000,000,000 picoUSD
    try {
      const paymentResult = (req as any).paymentResult;
      res.json({
        processed: req.body,
        timestamp: Date.now(),
        cost: paymentResult?.cost?.toString(),
        nonce: paymentResult?.subRav?.nonce?.toString()
      });
    } catch (error) {
      // Only handle specific error cases, let middleware errors propagate
      if (error instanceof Error && error.message.includes('Cannot set headers after they are sent')) {
        console.log('Response already sent by middleware, skipping route handler');
        return;
      }
      console.error('Error in /process route:', error);
      next(error);
    }
  });

  // Test new route with PerToken strategy
  billing.post('/chat/completions', {
    pricing: {
      type: 'PerToken',
      unitPricePicoUSD: '20000', // 0.00002 USD per token
      usageKey: 'usage.total_tokens'
    }
  }, (req: Request, res: Response, next: NextFunction) => {
    try {
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
    } catch (error) {
      // Only handle specific error cases, let middleware errors propagate
      if (error instanceof Error && error.message.includes('Cannot set headers after they are sent')) {
        console.log('Response already sent by middleware, skipping route handler');
        return;
      }
      console.error('Error in /chat/completions route:', error);
      next(error);
    }
  });

  // Original business routes have been migrated to BillableRouter

  // 4. Mount billing routes with all integrated endpoints (discovery, admin, recovery, business routes)
  app.use(billing.router);

  // Add error handling middleware to catch and log 500 errors (must be after all routes)
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('=== SERVER ERROR ===');
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Request URL:', req.url);
    console.error('Request method:', req.method);
    console.error('Request headers:', req.headers);
    console.error('Request body:', req.body);
    console.error('==================');
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        stack: debug ? err.stack : undefined
      });
    }
  });

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