/**
 * Express Payment Kit Simple Configuration Example
 * 
 * This example demonstrates how to use ExpressPaymentKit with simple configuration
 * for streamlined integration.
 */

import express from 'express';
import { createExpressPaymentKit } from '../src/integrations/express/ExpressPaymentKit';
import type { SignerInterface } from '@nuwa-ai/identity-kit';

async function main() {
  const app = express();
  app.use(express.json());

  // Mock key manager - in real usage, create this from your DID setup
  const mockKeyManager: SignerInterface = {
    sign: async () => new Uint8Array(64),
    listKeyIds: async () => ['did:rooch:test#key1'],
    derivePublicKey: async () => ({ 
      keyType: 'EcdsaSecp256k1VerificationKey2019',
      publicKeyMultibase: 'z...'
    }),
  } as any;

  try {
    // Create ExpressPaymentKit with simple configuration
    const payment = await createExpressPaymentKit({
      serviceId: 'my-api-service',
      
      // Signer configuration
      signer: mockKeyManager,
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      network: 'local',
      
      // Billing configuration
      defaultAssetId: '0x3::gas_coin::RGas',
      defaultPricePicoUSD: '1000000000', // 0.001 USD default price
      
      // DID authentication (optional)
      didAuth: process.env.NODE_ENV === 'production', // Enable in production
      
      debug: process.env.NODE_ENV !== 'production',
    });

    // Register billable API routes
    payment.get('/api/echo', '500000000', (req, res) => { // 0.0005 USD
      res.json({
        echo: req.query.message,
        timestamp: new Date().toISOString()
      });
    });

    payment.post('/api/process', '2000000000', (req, res) => { // 0.002 USD
      res.json({
        processed: req.body,
        timestamp: new Date().toISOString()
      });
    });

    // Dynamic pricing based on request complexity
    payment.post('/api/analyze', {
      type: 'PerToken',
      unitPricePicoUSD: '10000', // 0.00001 USD per token
      usageKey: 'usage.total_tokens'
    }, (req, res) => {
      const complexity = req.body.data?.length || 100;
      const tokens = Math.max(complexity / 4, 50); // Simulate token usage
      
      // Set usage for billing calculation
      res.locals.usage = { total_tokens: tokens };
      
      res.json({
        analysis: `Analyzed ${req.body.data || 'default data'}`,
        tokens_used: tokens,
        timestamp: new Date().toISOString()
      });
    });

    // Mount payment router
    app.use(payment.router);

    // Mount admin and recovery routes
    app.use('/admin', payment.adminRouter()); // Admin endpoints
    app.use('/payment', payment.recoveryRouter()); // Client recovery

    // Health check (no billing)
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Start server
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`🚀 API server with payment billing running on port ${port}`);
      console.log(`💰 Payment features:`);
      console.log(`  - GET /api/echo?message=hello (0.0005 USD)`);
      console.log(`  - POST /api/process (0.002 USD)`);
      console.log(`  - POST /api/analyze (dynamic pricing)`);
      console.log(`📊 Management:`);
      console.log(`  - GET /admin/claims (payment status)`);
      console.log(`  - GET /payment/pending (client recovery)`);
      console.log(`  - GET /health (no payment required)`);
    });

    // Access the underlying PayeeClient if needed for advanced operations
    const payeeClient = payment.getPayeeClient();
    console.log(`✅ PayeeClient initialized for advanced operations`);

  } catch (error) {
    console.error('❌ Failed to start payment server:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main }; 