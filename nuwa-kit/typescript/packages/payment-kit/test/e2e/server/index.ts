import express, { Request, Response, NextFunction } from 'express';
import onHeaders from 'on-headers';
import { createExpressPaymentKitFromEnv } from '../../../src/transport/express/fromIdentityEnv';
import { HttpPaymentCodec } from '../../../src/middlewares/http/HttpPaymentCodec';
import type { HttpRequestPayload, HttpResponsePayload, SubRAV } from '../../../src/core/types';
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
    adminDid,
  } = config;

  const app = express();
  app.use(express.json());

  // Interceptor: for /echo-mutate, strip clientTxRef from payment header to simulate header loss
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/echo-mutate') {
      onHeaders(res, function () {
        try {
          const headerName = HttpPaymentCodec.getHeaderName();
          const val = res.getHeader(headerName);
          if (typeof val === 'string' && val.startsWith('{')) {
            const payload = JSON.parse(val);
            delete payload.clientTxRef;
            res.setHeader(headerName, JSON.stringify(payload));
          }
        } catch {}
      });
    }
    next();
  });

  // 1. Create ExpressPaymentKit integration for billing functionality
  const billing = await createExpressPaymentKitFromEnv(env, {
    serviceId,
    defaultAssetId,
    defaultPricePicoUSD: '500000000', // 0.0005 USD
    adminDid,
    debug,
    // Reduce hub balance cache TTLs in tests to avoid stale negative cache after deposit
    hubBalance: {
      ttlMs: 10,
      negativeTtlMs: 10,
      staleWhileRevalidateMs: 500,
      maxEntries: 1000,
    },
    // Ensure reactive claim is explicitly enabled and faster for tests
    claim: {
      maxConcurrentClaims: 10,
      policy: {
        minClaimAmount: 1000000n, // 0.1 RGas
      },
      maxRetries: 2,
      retryDelayMs: 1000,
      requireHubBalance: true,
    }
  });

  // 2. Declare routes & pricing strategies
  billing.get(
    '/echo',
    { pricing: '1000000000' },
    (req: Request, res: Response, next: NextFunction) => {
      // 0.001 USD = 1,000,000,000 picoUSD
      try {
        // Business logic should not depend on payment information
        // Payment info is automatically handled by middleware and sent via headers
        res.json({
          echo: req.query.q || 'hello',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        // Only handle specific error cases, let middleware errors propagate
        if (
          error instanceof Error &&
          error.message.includes('Cannot set headers after they are sent')
        ) {
          console.log('Response already sent by middleware, skipping route handler');
          return;
        }
        console.error('Error in /echo route:', error);
        next(error);
      }
    }
  );

  // High-cost endpoint to accelerate balance depletion in tests
  billing.get(
    '/expensive',
    { pricing: '5000000000' }, // 5,000,000,000 picoUSD (~50,000,000 base units assuming 100 picoUSD/unit)
    (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json({
          ok: true,
          type: 'expensive',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error in /expensive route:', error);
        next(error);
      }
    }
  );

  // Same as /echo but with clientTxRef stripped from payment header by interceptor above
  billing.get(
    '/echo-mutate',
    { pricing: '1000000000' },
    (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json({
          echo: req.query.q || 'hello',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Cannot set headers after they are sent')
        ) {
          console.log('Response already sent by middleware, skipping route handler');
          return;
        }
        console.error('Error in /echo-mutate route:', error);
        next(error);
      }
    }
  );

  billing.post(
    '/process',
    {
      pricing: {
        type: 'FinalCost',
      },
    },
    (req: Request, res: Response, next: NextFunction) => {
      // External provider already computes final USD cost; we pass picoUSD post-flight
      try {
        // Business logic should not depend on payment information
        // Payment info is automatically handled by middleware and sent via headers
        // For testing, set external picoUSD cost for this request (0.01 USD)
        res.locals.usage = 10_000_000_000; // picoUSD
        res.json({
          processed: req.body,
          timestamp: Date.now(),
        });
      } catch (error) {
        // Only handle specific error cases, let middleware errors propagate
        if (
          error instanceof Error &&
          error.message.includes('Cannot set headers after they are sent')
        ) {
          console.log('Response already sent by middleware, skipping route handler');
          return;
        }
        console.error('Error in /process route:', error);
        next(error);
      }
    }
  );

  // PerToken strategy route for post-flight billing testing
  billing.post(
    '/chat/completions',
    {
      pricing: {
        type: 'PerToken',
        unitPricePicoUSD: '20000000', // 20,000,000 picoUSD (0.00002 USD) per token
      },
      authRequired: true, // paymentRequired is implied when pricing > 0
    },
    (req: Request, res: Response, next: NextFunction) => {
      try {
        // Mock LLM response with variable usage based on request
        const { messages = [] } = req.body;
        const baseTokens = 100;
        const extraTokens = Math.min(messages.length * 20, 200); // Variable based on input

        const mockUsage = {
          prompt_tokens: baseTokens,
          completion_tokens: extraTokens,
          total_tokens: baseTokens + extraTokens,
        };

        // Critical: Set numeric usage (total tokens) for post-flight billing
        res.locals.usage = mockUsage.total_tokens;

        res.json({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-3.5-turbo',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: `Chat response for: ${JSON.stringify(req.body.messages || [])}`,
              },
              finish_reason: 'stop',
            },
          ],
          usage: mockUsage,
          // Note: In post-flight billing, cost is calculated AFTER response
          // Business logic should not include payment details - they're handled by middleware
          billingInfo: {
            expectedCost: (mockUsage.total_tokens * 20000000).toString() + ' picoUSD',
            mode: 'post-flight',
            tokensUsed: mockUsage.total_tokens,
          },
        });
      } catch (error) {
        console.error('Error in /chat/completions route:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Chat completion failed' });
        }
      }
    }
  );

  // Streaming SSE route: FinalCost post-flight billing with in-band payment frame
  billing.get(
    '/stream',
    { pricing: { type: 'FinalCost' }, authRequired: true },
    async (req: Request, res: Response) => {
      try {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Emit a few chunks
        let i = 0;
        const timer = setInterval(() => {
          if (i >= 3) return;
          res.write(`data: ${JSON.stringify({ text: `chunk-${i}` })}\n\n`);
          i += 1;
        }, 20);

        setTimeout(() => {
          clearInterval(timer);
          // Provide picoUSD cost (e.g., 0.002 USD)
          res.locals.usage = 2_000_000_000; // 2e9 picoUSD
          res.end();
        }, 120);
      } catch (error) {
        if (!res.headersSent) res.status(500).end();
      }
    }
  );

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
        stack: err.stack,
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
    },
  };
}
