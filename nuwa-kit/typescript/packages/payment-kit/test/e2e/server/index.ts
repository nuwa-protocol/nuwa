import express, { Request, Response, NextFunction } from 'express';
import { createExpressPaymentKit } from '../../../src/integrations/express/ExpressPaymentKit';
import { HttpPaymentCodec } from '../../../src/middlewares/http/HttpPaymentCodec';
import type { 
  HttpRequestPayload, 
  HttpResponsePayload, 
  SubRAV 
} from '../../../src/core/types';
import type { PaymentChannelPayeeClient } from '../../../src/client/PaymentChannelPayeeClient';
import type { SignerInterface } from '@nuwa-ai/identity-kit';

export interface BillingServerConfig {
  // Use new simplified configuration
  signer?: SignerInterface;
  did?: string;
  // Alternative: still allow pre-created payeeClient for backward compatibility
  payeeClient?: PaymentChannelPayeeClient;
  port?: number;
  serviceId?: string;
  defaultAssetId?: string;
  debug?: boolean;
  rpcUrl?: string; // For blockchain connection
  network?: 'local' | 'dev' | 'test' | 'main';
}

export async function createBillingServer(config: BillingServerConfig) {
  const {
    signer,
    did,
    payeeClient,
    port = 3000,
    serviceId = 'echo-service',
    defaultAssetId = '0x3::gas_coin::RGas',
    debug = true,
    rpcUrl,
    network = 'local'
  } = config;

  // Validate configuration
  if (!signer && !payeeClient) {
    throw new Error('Either signer or payeeClient must be provided');
  }

  const app = express();
  app.use(express.json());

  // 1. Create ExpressPaymentKit integration for billing functionality
  const billing = await createExpressPaymentKit({
    serviceId,
    signer: signer!,
    rpcUrl,
    network,
    defaultAssetId,
    defaultPricePicoUSD: '500000000', // 0.0005 USD
    didAuth: false, // Temporarily disable DID authentication in test environment
    debug
  });

  // 2. Declare routes & pricing strategies
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

  // Test new route with PerToken strategy
  billing.post('/v1/chat/completions', {
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

  // 3. Mount billing routes
  app.use(billing.router);

  // Original business routes have been migrated to BillableRouter

  // 4. Mount admin and recovery routes
  app.use('/admin', billing.adminRouter()); // Admin interface
  app.use('/payment', billing.recoveryRouter()); // Client recovery interface

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// Client call example (deferred payment mode)
export function createTestClient(payerClient: any, baseURL: string, channelId: string) {
  let pendingSubRAV: SubRAV | null = null; // Cache the previous SubRAV
  let isFirstRequest = true; // Flag to mark if it's the first request

  return {
    async callEcho(query: string) {
      let headers: Record<string, string> = {};
      
      // 1. Always generate signed SubRAV
      let signedSubRAV: any;
      
      if (pendingSubRAV) {
        // Use server-proposed SubRAV
        signedSubRAV = await payerClient.signSubRAV(pendingSubRAV);
      } else if (isFirstRequest) {
        // First request: generate handshake SubRAV (nonce=0, amount=0)
        const channelInfo = await payerClient.getChannelInfo(channelId);
        const keyIds = await payerClient.signer.listKeyIds();
        const vmIdFragment = keyIds[0].split('#')[1]; // Extract fragment part
        
        const handshakeSubRAV: SubRAV = {
          version: 1,
          chainId: BigInt(4), // Based on network configuration
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
        maxAmount: BigInt('50000000'), // Maximum accept 0.05 RGas
        clientTxRef: `client_${Date.now()}`
      };

      headers['X-Payment-Channel-Data'] = HttpPaymentCodec.buildRequestHeader(requestPayload);
      
      // 2. Send request
      const url = `${baseURL}/v1/echo?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Request failed: ${response.status} - ${errorData.error || response.statusText}`);
      }

      // 3. Process response, extract next SubRAV proposal
      const paymentHeader = response.headers.get('X-Payment-Channel-Data');
      if (paymentHeader) {
        try {
          const responsePayload: HttpResponsePayload = HttpPaymentCodec.parseResponseHeader(paymentHeader);
          // Cache unsigned SubRAV for next request
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
      
      // Generate signed SubRAV
      let signedSubRAV: any;
      
      if (pendingSubRAV) {
        // Use server-proposed SubRAV
        signedSubRAV = await payerClient.signSubRAV(pendingSubRAV);
      } else if (isFirstRequest) {
        // First request: generate handshake SubRAV (nonce=0, amount=0)
        const channelInfo = await payerClient.getChannelInfo(channelId);
        const keyIds = await payerClient.signer.listKeyIds();
        const vmIdFragment = keyIds[0].split('#')[1]; // Extract fragment part
        
        const handshakeSubRAV: SubRAV = {
          version: 1,
          chainId: BigInt(4), // Based on network configuration
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
        maxAmount: BigInt('50000000'), // Maximum accept 0.05 RGas
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

      // Process response, extract next SubRAV proposal
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

    // Get current pending SubRAV for payment
    getPendingSubRAV() {
      return pendingSubRAV;
    },

    // Clear pending SubRAV (for testing)
    clearPendingSubRAV() {
      pendingSubRAV = null;
      isFirstRequest = true; // Reset to first request state
    },

    // Get admin information
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
      
      // Generate signed SubRAV
      let signedSubRAV: any;
      
      if (pendingSubRAV) {
        // Use server-proposed SubRAV
        signedSubRAV = await payerClient.signSubRAV(pendingSubRAV);
      } else if (isFirstRequest) {
        // First request: generate handshake SubRAV (nonce=0, amount=0)
        const channelInfo = await payerClient.getChannelInfo(channelId);
        const keyIds = await payerClient.signer.listKeyIds();
        const vmIdFragment = keyIds[0].split('#')[1]; // Extract fragment part
        
        const handshakeSubRAV: SubRAV = {
          version: 1,
          chainId: BigInt(4), // Based on network configuration
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
        maxAmount: BigInt('50000000'), // Maximum accept 0.05 RGas
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

      // Process response, extract next SubRAV proposal
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