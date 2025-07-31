import express from 'express';
import { IdentityKit } from '@nuwa-ai/identity-kit';
import { createExpressPaymentKitFromEnv } from '@nuwa-ai/payment-kit';
import type { Request, Response } from 'express';

/**
 * Simple HTTP server demonstrating Payment Kit integration
 * 
 * This example shows how to:
 * 1. Set up ExpressPaymentKit for billing functionality
 * 2. Define routes with different pricing strategies
 * 3. Handle payment verification and billing
 */

interface ServerConfig {
  port: number;
  serviceId: string;
  defaultAssetId: string;
  debug: boolean;
}

async function createPaymentServer(config: ServerConfig): Promise<{
  app: express.Application;
  billing: any;
}> {
  const app = express();
  app.use(express.json());

  // Initialize IdentityKit environment
  const env = await IdentityKit.bootstrap({
    method: 'rooch',
    vdrOptions: {
      rpcUrl: process.env.ROOCH_NODE_URL,
      network: process.env.ROOCH_NETWORK
    }
  });

  let keyManager = env.keyManager;
  let serviceKey = process.env.SERVICE_KEY;
  if (!serviceKey) {
    throw new Error('SERVICE_KEY environment variable is required');
  }
  keyManager.importKeyFromString(serviceKey);

  let serviceDid = await keyManager.getDid();
  console.log('🔑 Service DID:', serviceDid);

  console.log('🔑 Identity Kit initialized');

  // Create ExpressPaymentKit integration
  const billing = await createExpressPaymentKitFromEnv(env, {
    serviceId: config.serviceId,
    defaultAssetId: config.defaultAssetId,
    defaultPricePicoUSD: '1000000000', // 0.001 USD default
    debug: config.debug
  });

  console.log('💳 Payment Kit initialized');

  // Note: Service info is provided by ExpressPaymentKit at /payment/info

  // Simple echo endpoint - fixed price per request
  billing.get('/api/echo', '2000000000', (req: Request, res: Response) => { // 0.002 USD
    const paymentResult = (req as any).paymentResult;
    const message = req.query.message || 'Hello, World!';
    
    res.json({
      echo: message,
      timestamp: new Date().toISOString(),
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString()
    });
  });

  // Text processing endpoint - per-character pricing
  billing.post('/api/process', {
    type: 'PerToken',
    unitPricePicoUSD: '100000', // 0.0001 USD per character
    usageKey: 'usage.characters'
  }, (req: Request, res: Response) => {
    const paymentResult = (req as any).paymentResult;
    const text = req.body.text || '';
    const characters = text.length;
    
    // Set usage for billing calculation
    res.locals.usage = { characters };
    
    // Simple text processing (uppercase)
    const processed = text.toUpperCase();
    
    res.json({
      input: text,
      output: processed,
      characters,
      timestamp: new Date().toISOString(),
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString()
    });
  });

  // Chat completion endpoint - per-token pricing (similar to OpenAI API)
  billing.post('/api/chat/completions', {
    type: 'PerToken',
    unitPricePicoUSD: '50000', // 0.00005 USD per token
    usageKey: 'usage.total_tokens'
  }, (req: Request, res: Response) => {
    const paymentResult = (req as any).paymentResult;
    const { messages, max_tokens = 100 } = req.body;
    
    // Mock AI response and usage calculation
    const prompt = messages?.map((m: any) => m.content).join(' ') || '';
    const prompt_tokens = Math.ceil(prompt.length / 4); // rough estimate
    const completion_tokens = Math.min(max_tokens, 50); // mock response
    const total_tokens = prompt_tokens + completion_tokens;
    
    const mockResponse = `This is a mock AI response to: "${prompt.substring(0, 50)}..."`;
    
    // Set usage for billing
    res.locals.usage = {
      prompt_tokens,
      completion_tokens,
      total_tokens
    };
    
    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'mock-gpt',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: mockResponse
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens,
        completion_tokens,
        total_tokens
      },
      // Payment information
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString()
    });
  });

  // Mount billing routes
  app.use(billing.router);

  // Mount admin and recovery routes
  app.use('/admin', billing.adminRouter());
  app.use('/payment', billing.recoveryRouter());

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      service: config.serviceId
    });
  });

  // Error handling
  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error('Server error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  });

  return { app, billing };
}

async function main() {
  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '3000'),
    serviceId: process.env.SERVICE_ID || 'payment-example',
    defaultAssetId: process.env.DEFAULT_ASSET_ID || '0x3::gas_coin::RGas',
    debug: process.env.DEBUG === 'true'
  };

  try {
    const { app } = await createPaymentServer(config);

    const server = app.listen(config.port, () => {
      console.log(`🚀 Payment server running on port ${config.port}`);
      console.log(`📖 Service info: http://localhost:${config.port}/payment/info`);
      console.log(`🔍 Health check: http://localhost:${config.port}/health`);
      console.log(`💰 Admin panel: http://localhost:${config.port}/admin/claims`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🛑 Received SIGTERM, shutting down gracefully');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('🛑 Received SIGINT, shutting down gracefully');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if run directly
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { createPaymentServer };