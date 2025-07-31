// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { DebugLogger, IdentityKit } from '@nuwa-ai/identity-kit';
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
  adminDid: string | string[];
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
      network: process.env.ROOCH_NETWORK || 'test'
    }
  });

  let keyManager = env.keyManager;
  let serviceKey = process.env.SERVICE_KEY;
  if (!serviceKey) {
    throw new Error('SERVICE_KEY environment variable is required');
  }
  
  // Import the service key first
  const importedKey = await keyManager.importKeyFromString(serviceKey);
  console.log('🔑 Imported service key:', importedKey.keyId);

  let serviceDid = await keyManager.getDid();
  console.log('🔑 Service DID:', serviceDid);

  console.log('🔑 Identity Kit initialized');
  console.log('🔑 Service config:', config);

  // Create ExpressPaymentKit integration
  const billing = await createExpressPaymentKitFromEnv(env, {
    serviceId: config.serviceId,
    defaultAssetId: config.defaultAssetId,
    defaultPricePicoUSD: '1000000000', // 0.001 USD default
    adminDid: config.adminDid,
    debug: config.debug
  });

  console.log('💳 Payment Kit initialized');

  // Set debug level after PaymentKit is initialized
  if(config.debug) {
    console.log('🔍 Setting debug level to debug');
    DebugLogger.setGlobalLevel('debug');
  }

  // Note: Service info is provided by ExpressPaymentKit at /payment-channel/info

  // Simple echo endpoint - fixed price per request
  billing.get('/echo', '2000000000', (req: Request, res: Response) => { // 0.002 USD
    const paymentResult = (req as any).paymentResult;
    const message = req.query.message || 'Hello, World!';
    
    res.json({
      echo: message,
      timestamp: new Date().toISOString(),
      cost: paymentResult?.cost?.toString(),
      nonce: paymentResult?.subRav?.nonce?.toString()
    });
  });

  // Text processing endpoint - fixed price per request
  billing.post('/process', '500000000', (req: Request, res: Response) => { // 0.0005 USD per request
    const paymentResult = (req as any).paymentResult;
    const text = req.body.text || '';
    const characters = text.length;
    
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

  // Chat completion endpoint - fixed price per request (similar to OpenAI API)
  billing.post('/chat/completions', '1000000000', (req: Request, res: Response) => { // 0.001 USD per request
    const paymentResult = (req as any).paymentResult;
    const { messages, max_tokens = 100 } = req.body;
    
    // Mock AI response and usage calculation
    const prompt = messages?.map((m: any) => m.content).join(' ') || '';
    const prompt_tokens = Math.ceil(prompt.length / 4); // rough estimate
    const completion_tokens = Math.min(max_tokens, 50); // mock response
    const total_tokens = prompt_tokens + completion_tokens;
    
    const mockResponse = `This is a mock AI response to: "${prompt.substring(0, 50)}..."`;
    
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

  // Mount recovery routes (public endpoints like /info and /price)
  app.use('/payment-channel', billing.recoveryRouter());
  app.use('/payment-channel/admin', billing.adminRouter());

  // Mount billing routes only for API paths (exclude payment-channel routes)
  app.use('/api', billing.router);

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
    console.error('🚨 Server error occurred:');
    console.error('Request URL:', req.method, req.url);
    console.error('Request headers:', JSON.stringify(req.headers, null, 2));
    console.error('Error details:', err);
    console.error('Error stack:', err.stack);
    
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
      ...(config.debug && { stack: err.stack })
    });
  });

  return { app, billing };
}

async function main() {
  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '3000'),
    serviceId: process.env.SERVICE_ID || 'payment-example',
    defaultAssetId: process.env.DEFAULT_ASSET_ID || '0x3::gas_coin::RGas',
    adminDid: process.env.ADMIN_DID?.split(',') || [],
    debug: process.env.DEBUG === 'true'
  };

  try {
    const { app } = await createPaymentServer(config);

    const server = app.listen(config.port, () => {
      console.log(`🚀 Payment server running on port ${config.port}`);
      console.log(`📖 Service info: http://localhost:${config.port}/payment-channel/info`);
      console.log(`🔍 Health check: http://localhost:${config.port}/health`);
      console.log(`💰 Admin panel: http://localhost:${config.port}/payment-channel/admin/claims`);
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
if (require.main === module) {
  main().catch(console.error);
}

export { createPaymentServer };