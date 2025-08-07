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

  // PerToken strategy route for post-flight billing testing
  billing.post('/chat/completions', {
    pricing: {
      type: 'PerToken',
      unitPricePicoUSD: '20000000', // 20,000,000 picoUSD (0.00002 USD) per token
      usageKey: 'usage.total_tokens'
    },
    authRequired: true // paymentRequired is implied when pricing > 0
  }, (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentResult = (req as any).paymentResult;
      
      // Mock LLM response with variable usage based on request
      const { messages = [] } = req.body;
      const baseTokens = 100;
      const extraTokens = Math.min(messages.length * 20, 200); // Variable based on input
      
      const mockUsage = {
        prompt_tokens: baseTokens,
        completion_tokens: extraTokens,
        total_tokens: baseTokens + extraTokens
      };
      
          // Critical: Set usage to res.locals for post-flight billing
    // The middleware will automatically detect this is a PerToken strategy
      // and trigger post-flight billing after the response is sent
      res.locals.usage = {
        usage: mockUsage
      };
      
      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: `Chat response for: ${JSON.stringify(req.body.messages || [])}`
          },
          finish_reason: 'stop'
        }],
        usage: mockUsage,
        // Note: In post-flight billing, cost is calculated AFTER response
        // paymentResult may be null here as billing happens in the background
        billingInfo: {
          expectedCost: (mockUsage.total_tokens * 20000000).toString() + ' picoUSD',
          mode: 'post-flight',
          tokensUsed: mockUsage.total_tokens
        }
      });
    } catch (error) {
      console.error('Error in /chat/completions route:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Chat completion failed' });
      }
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
        stack: err.stack
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