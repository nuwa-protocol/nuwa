# ExpressPaymentKit Integration Guide

## Overview

The ExpressPaymentKit provides a streamlined approach to integrating payment billing into Express applications. This eliminates the need to manually set up all the blockchain and DID infrastructure components.

## Key Features

### 1. Simplified Configuration

Previously, you had to manually create:

- `RoochPaymentChannelContract`
- `RoochVDR` and register it with `VDRRegistry`
- `PaymentChannelPayeeClient` with proper storage configuration

Now, you can simply provide basic configuration options and the ExpressPaymentKit handles all the setup automatically.

### 2. Enhanced Configuration Interface

```typescript
export interface ExpressPaymentKitOptions {
  /** Service identifier */
  serviceId: string;
  /** Service signer (key manager implementing SignerInterface) */
  signer: SignerInterface;
  /** Optional RPC URL (defaults to env.ROOCH_NODE_URL) */
  rpcUrl?: string;
  /** Optional network (defaults to 'local') */
  network?: 'local' | 'dev' | 'test' | 'main';
  /** Default asset ID for settlement */
  defaultAssetId?: string;
  /** Default price in picoUSD when no rule matches */
  defaultPricePicoUSD?: string | bigint;
  /** Enable DID authentication (default: true) */
  didAuth?: boolean;
  /** Debug logging */
  debug?: boolean;
}
```

## Quick Start

### Method 1: Simple Configuration (Recommended)

```typescript
import express from 'express';
import { createExpressPaymentKit } from '@nuwa-ai/payment-kit/express';
import { KeyManager } from '@nuwa-ai/identity-kit';

const app = express();

const payment = await createExpressPaymentKit({
  serviceId: 'my-service',
  signer: KeyManager.fromPrivateKey(process.env.SERVICE_PRIVATE_KEY!),
  rpcUrl: process.env.ROOCH_NODE_URL,
  network: 'dev',
  defaultAssetId: '0x3::gas_coin::RGas',
  defaultPricePicoUSD: '1000000000',
  didAuth: true,
  debug: process.env.NODE_ENV !== 'production',
});

// Register routes with pricing
payment.get('/api/echo', '500000000', (req, res) => {
  res.json({ echo: req.query.message });
});

payment.post(
  '/api/chat',
  {
    type: 'PerToken',
    unitPricePicoUSD: '20000',
    usageKey: 'usage.total_tokens',
  },
  (req, res) => {
    // Your LLM API logic here
    res.locals.usage = { total_tokens: 150 };
    res.json({ response: 'Hello!' });
  }
);

// Mount the router
app.use(payment.router);

// Optional: Mount admin and recovery routes
app.use('/admin', payment.adminRouter());
app.use('/payment', payment.recoveryRouter());

app.listen(3000);
```

## Advanced Configuration

### Custom Rate Provider

```typescript
import { ContractRateProvider } from '@nuwa-ai/payment-kit';

const customRateProvider = new ContractRateProvider(contract, 60000); // 60s cache

const payment = await createExpressPaymentKit({
  serviceId: 'my-service',
  signer: keyManager,
  // Custom rate provider will be created automatically
  // You can access it later via payment.getPayeeClient().rateProvider
});
```

### Environment Configuration

```bash
# .env file
ROOCH_NODE_URL=https://rooch.dev.node
SERVICE_PRIVATE_KEY=0x1234567890abcdef...
SERVICE_DID=did:rooch:0xabcdef...
NODE_ENV=production
```

### Production Setup

```typescript
const payment = await createExpressPaymentKit({
  serviceId: 'production-service',
  signer: await loadSecureKeyManager(), // Use KMS or secure key storage
  rpcUrl: 'https://rooch.mainnet.node',
  network: 'main',
  defaultAssetId: '0x3::gas_coin::RGas',
  defaultPricePicoUSD: '100000000', // 0.0001 USD
  didAuth: true, // Always enable in production
  debug: false, // Disable debug logs in production
});
```

## Route Registration Patterns

### Fixed Price Routes

```typescript
// Simple fixed price
payment.get('/api/status', '1000000000', statusHandler); // 0.001 USD

// Different prices for different methods
payment.get('/api/info', '500000000', infoHandler); // 0.0005 USD
payment.post('/api/process', '2000000000', processHandler); // 0.002 USD
```

### Dynamic Pricing Routes

```typescript
// Per-token pricing for LLM APIs
payment.post(
  '/api/chat/completions',
  {
    type: 'PerToken',
    unitPricePicoUSD: '20000', // 0.00002 USD per token
    usageKey: 'usage.total_tokens',
  },
  async (req, res) => {
    const result = await llm.complete(req.body);

    // Set usage for billing calculation
    res.locals.usage = result.usage;

    res.json(result);
  }
);

// Tiered pricing
payment.post(
  '/api/analyze',
  {
    type: 'Tiered',
    tiers: [
      { threshold: 1000, unitPricePicoUSD: '10000' },
      { threshold: 10000, unitPricePicoUSD: '8000' },
      { threshold: Infinity, unitPricePicoUSD: '5000' },
    ],
    usageKey: 'analysis.complexity_score',
  },
  analyzeHandler
);
```

### Custom Rule IDs

```typescript
// Assign custom rule IDs for easier management
payment.post('/api/premium-feature', '5000000000', premiumHandler, 'premium-rule');
payment.get('/api/basic-info', '100000000', basicHandler, 'basic-info-rule');
```

## Error Handling

```typescript
// The ExpressPaymentKit automatically handles payment errors
// But you can customize error responses if needed

app.use((err, req, res, next) => {
  if (err.code === 'PAYMENT_REQUIRED') {
    res.status(402).json({
      error: 'Payment Required',
      details: 'Insufficient channel balance or invalid payment data',
      channelInfo: err.channelInfo,
    });
  } else if (err.code === 'DID_AUTH_FAILED') {
    res.status(401).json({
      error: 'Authentication Failed',
      details: 'Invalid DID signature or authorization header',
    });
  } else {
    next(err);
  }
});
```

## Monitoring and Admin Features

### Admin Dashboard

```typescript
// Protected admin routes
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.use('/admin', payment.adminRouter({ auth: adminAuth }));

// Available endpoints:
// GET /admin/claims - View settlement status
// POST /admin/claim/:channelId - Manual settlement
// GET /admin/subrav/:channelId/:nonce - View specific SubRAV
// DELETE /admin/cleanup?maxAge=30 - Clean expired proposals
```

### Health Monitoring

```typescript
// Health check endpoint (automatically excluded from billing)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
  });
});

// Custom health check with payment system status
app.get('/health/detailed', async (req, res) => {
  try {
    const payeeClient = payment.getPayeeClient();
    const channels = await payeeClient.listChannels();

    res.json({
      status: 'ok',
      payment: {
        channels: channels.length,
        // Add more payment system metrics
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message,
    });
  }
});
```

## Testing

### Mock Setup for Development

```typescript
// For development/testing without real blockchain
const mockSigner = {
  sign: async () => new Uint8Array(64),
  listKeyIds: async () => ['test-key'],
  derivePublicKey: async () => ({
    keyType: 'EcdsaSecp256k1VerificationKey2019',
    publicKeyMultibase: 'z...',
  }),
} as SignerInterface;

const payment = await createExpressPaymentKit({
  serviceId: 'test-service',
  signer: mockSigner,
  rpcUrl: 'http://localhost:6767', // Local Rooch node
  network: 'local',
  didAuth: false, // Disable for easier testing
  debug: true,
});
```

### Integration Tests

```typescript
import request from 'supertest';

describe('Payment Integration', () => {
  let app;

  beforeAll(async () => {
    const payment = await createExpressPaymentKit({
      serviceId: 'test',
      signer: mockSigner,
      didAuth: false,
    });

    payment.get('/test', '1000000000', (req, res) => {
      res.json({ success: true });
    });

    app = express();
    app.use(payment.router);
  });

  it('should require payment headers', async () => {
    const response = await request(app).get('/test').expect(400);

    expect(response.body.error).toContain('Payment');
  });

  it('should process valid payment', async () => {
    const response = await request(app)
      .get('/test')
      .set('X-Payment-Channel-Data', validPaymentData)
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

## Migration from Manual Setup

If you're migrating from manual BillableRouter + HttpBillingMiddleware setup:

### Before (Manual Setup)

```typescript
// Old approach - lots of boilerplate
const contract = new RoochPaymentChannelContract({
  rpcUrl: process.env.ROOCH_NODE_URL,
  network: 'dev',
});

const roochVDR = new RoochVDR({
  rpcUrl: process.env.ROOCH_NODE_URL,
  network: 'dev',
});

const vdrRegistry = VDRRegistry.getInstance();
vdrRegistry.registerVDR(roochVDR);

const payeeClient = new PaymentChannelPayeeClient({
  contract,
  signer: keyManager,
  didResolver: vdrRegistry,
  storageOptions: {
    customChannelRepo: new MemoryChannelRepository(),
  },
});

const billableRouter = new BillableRouter({
  serviceId: 'my-service',
});

const rateProvider = new ContractRateProvider(contract, 30000);
const billingEngine = new UsdBillingEngine(billableRouter.getConfigLoader(), rateProvider);

const middleware = new HttpBillingMiddleware({
  payeeClient,
  billingEngine,
  serviceId: 'my-service',
});

// Manual middleware setup...
```

### After (ExpressPaymentKit)

```typescript
// New approach - one line!
const payment = await createExpressPaymentKit({
  serviceId: 'my-service',
  signer: keyManager,
  rpcUrl: process.env.ROOCH_NODE_URL,
  network: 'dev',
});

// That's it! Everything is set up automatically.
```

## Best Practices

1. **Environment Variables**: Store sensitive data like private keys in environment variables
2. **Error Handling**: Implement proper error handling for payment failures
3. **Monitoring**: Use admin endpoints to monitor payment channel health
4. **Testing**: Test with mock signers in development
5. **Security**: Always enable DID authentication in production
6. **Performance**: Use appropriate cache settings for rate providers
7. **Logging**: Enable debug mode in development, disable in production

This integration approach reduces setup complexity by ~80% while maintaining full flexibility for advanced use cases.
