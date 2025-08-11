# IdentityEnv Integration

This document explains how to use `IdentityEnv` from `@nuwa-ai/identity-kit` to simplify Payment-Kit initialization and ensure consistency across components.

## Overview

The `IdentityEnv` integration provides helper functions that eliminate configuration duplication and ensure consistent use of VDR registry, chain configuration, and signers across different Payment-Kit components.

### Benefits

- **Single source of truth**: RPC URL, network, and debug settings configured once
- **Consistent KeyManager**: Same signer used for DIDAuth and SubRAV signing
- **No configuration duplication**: Chain config extracted from IdentityEnv
- **Easy network switching**: Change only `bootstrapIdentityEnv` call to switch networks
- **Type safety**: Full TypeScript support with proper type inference

## Quick Start

### 1. Initialize IdentityEnv

```typescript
import { bootstrapIdentityEnv, MemoryKeyStore } from '@nuwa-ai/identity-kit';

const env = await bootstrapIdentityEnv({
  method: 'rooch',
  vdrOptions: {
    rpcUrl: 'https://testnet.rooch.network',
    network: 'test',
    debug: true,
  },
  keyStore: new MemoryKeyStore(), // Use appropriate store for your environment
});
```

### 2. Create HTTP Client (Frontend/Client-side)

```typescript
import { createHttpClientFromEnv } from '@nuwa-ai/payment-kit';
// Or import directly from module:
// import { createHttpClientFromEnv } from '@nuwa-ai/payment-kit/http';

const httpClient = createHttpClientFromEnv(env, {
  baseUrl: 'https://api.example.com',
  keyId: 'did:rooch:test:0x123#key1',
  debug: true,
  maxAmount: BigInt('1000000'), // 1 million picoUSD
});

// Make paid API calls
const response = await httpClient.get('/ai/summarize');
const data = await httpClient.post('/ai/generate', { prompt: 'Hello AI' });
```

### 3. Create Express Payment Kit (Backend/Server-side)

```typescript
import { createExpressPaymentKitFromEnv } from '@nuwa-ai/payment-kit';
// Or import directly from module:
// import { createExpressPaymentKitFromEnv } from '@nuwa-ai/payment-kit/express';

const paymentKit = await createExpressPaymentKitFromEnv(env, {
  serviceId: 'my-ai-service',
  defaultAssetId: '0x3::gas_coin::RGas',
  defaultPricePicoUSD: BigInt('1000000'), // 1 cent per request
  debug: true,
});

// Set up Express server
const app = express();
app.use('/api', paymentKit.router);

// Add billable endpoints
paymentKit
  .get('/ai/summarize', BigInt('5000000'), handler) // 5 cents
  .post('/ai/generate', BigInt('10000000'), handler); // 10 cents
```

## API Reference

### Helper Functions

#### `getChainConfigFromEnv(env: IdentityEnv): ChainConfig`

Extracts chain configuration from IdentityEnv's registered VDRs.

**Location:** `@nuwa-ai/payment-kit` (main export) or `@nuwa-ai/payment-kit/helpers`

**Parameters:**

- `env`: IdentityEnv instance with registered VDRs

**Returns:** ChainConfig for payment channel operations

**Throws:** Error if no supported VDR is found

#### `createHttpClientFromEnv(env, opts): PaymentChannelHttpClient`

Creates PaymentChannelHttpClient using IdentityEnv's KeyManager and chain config.

**Location:** `@nuwa-ai/payment-kit` (main export) or `@nuwa-ai/payment-kit/http`

**Parameters:**

- `env`: IdentityEnv instance
- `opts`: HttpPayerOptions without signer and chainConfig (provided by env)
  - `baseUrl`: Target service base URL (required)
  - `keyId?`: Key ID for signing operations (optional)
  - `storageOptions?`: Storage options for payment channel data (optional)
  - `channelId?`: Specific channelId (optional)
  - `payerDid?`: Optional DID for Authorization header (optional)
  - `maxAmount?`: Maximum amount per request (optional)
  - `debug?`: Enable debug logging (optional)
  - `onError?`: Custom error handler (optional)
  - `mappingStore?`: Host to channelId mapping store (optional)
  - `fetchImpl?`: Custom fetch implementation (optional)

#### `createExpressPaymentKitFromEnv(env, opts): Promise<ExpressPaymentKit>`

Creates ExpressPaymentKit using IdentityEnv's KeyManager and chain config.

**Location:** `@nuwa-ai/payment-kit` (main export) or `@nuwa-ai/payment-kit/express`

**Parameters:**

- `env`: IdentityEnv instance
- `opts`: ExpressPaymentKitOptions without signer, rpcUrl, and network (provided by env)
  - `serviceId`: Service identifier (required)
  - `defaultAssetId?`: Default asset ID for settlement (optional)
  - `defaultPricePicoUSD?`: Default price in picoUSD (optional)
  - `adminDid?`: Authorized admin DIDs (optional)
  - `debug?`: Debug logging (optional)

## Environment-Specific Examples

### Browser Environment

```typescript
import { bootstrapIdentityEnv, MemoryKeyStore } from '@nuwa-ai/identity-kit';
import { createHttpClientFromEnv } from '@nuwa-ai/payment-kit';

// Use MemoryKeyStore or IndexedDB store in browser
const env = await bootstrapIdentityEnv({
  method: 'rooch',
  vdrOptions: { network: 'test' },
  keyStore: new MemoryKeyStore(),
});

const httpClient = createHttpClientFromEnv(env, {
  baseUrl: 'https://api.myservice.com',
  debug: false,
});
```

### Server Environment

```typescript
import { bootstrapIdentityEnv } from '@nuwa-ai/identity-kit';
import { createExpressPaymentKitFromEnv } from '@nuwa-ai/payment-kit';

// Use file-based or KMS key store on server
const env = await bootstrapIdentityEnv({
  method: 'rooch',
  vdrOptions: {
    rpcUrl: process.env.ROOCH_RPC_URL,
    network: (process.env.ROOCH_NETWORK as any) || 'test',
  },
  keyStore: customKeyStore, // FileKeyStore, KMSKeyStore, etc.
});

const paymentKit = await createExpressPaymentKitFromEnv(env, {
  serviceId: process.env.SERVICE_ID || 'my-service',
  adminDid: process.env.ADMIN_DID,
});
```

### Network Switching

```typescript
// Development
const devEnv = await bootstrapIdentityEnv({
  method: 'rooch',
  vdrOptions: { network: 'test', rpcUrl: 'https://testnet.rooch.network' },
  keyStore,
});

// Production
const prodEnv = await bootstrapIdentityEnv({
  method: 'rooch',
  vdrOptions: { network: 'main', rpcUrl: 'https://mainnet.rooch.network' },
  keyStore,
});

// Same code works with both environments
const httpClient = createHttpClientFromEnv(env, { baseUrl: API_URL });
const paymentKit = await createExpressPaymentKitFromEnv(env, { serviceId: 'my-service' });
```

## Migration from Direct Initialization

### Before (Direct Initialization)

```typescript
// Old way - configuration duplication
const chainConfig = {
  chain: 'rooch',
  rpcUrl: 'https://testnet.rooch.network',
  network: 'test',
  debug: true,
};

const httpClient = new PaymentChannelHttpClient({
  baseUrl: 'https://api.example.com',
  chainConfig,
  signer: myKeyManager,
  debug: true,
});

const paymentKit = await createExpressPaymentKit({
  serviceId: 'my-service',
  signer: myKeyManager,
  rpcUrl: 'https://testnet.rooch.network',
  network: 'test',
  debug: true,
});
```

### After (IdentityEnv Integration)

```typescript
// New way - single configuration
const env = await bootstrapIdentityEnv({
  method: 'rooch',
  vdrOptions: {
    rpcUrl: 'https://testnet.rooch.network',
    network: 'test',
    debug: true,
  },
  keyStore: new MemoryKeyStore(),
});

const httpClient = createHttpClientFromEnv(env, {
  baseUrl: 'https://api.example.com',
});

const paymentKit = await createExpressPaymentKitFromEnv(env, {
  serviceId: 'my-service',
});
```

## Error Handling

The helper functions will throw descriptive errors in the following cases:

1. **No RoochVDR registered**: If IdentityEnv doesn't have a 'rooch' VDR registered
2. **Unsupported chain type**: If the chain config is not for 'rooch' (future-proofing)
3. **Missing required parameters**: If required parameters are not provided

```typescript
try {
  const httpClient = createHttpClientFromEnv(env, {
    baseUrl: 'https://api.example.com',
  });
} catch (error) {
  if (error.message.includes('RoochVDR not registered')) {
    // Handle VDR registration issue
    console.error('Please ensure bootstrapIdentityEnv was called with method="rooch"');
  }
}
```

## Best Practices

1. **Initialize IdentityEnv once** per application/session
2. **Use appropriate KeyStore** for your environment (Memory for browser, File/KMS for server)
3. **Share IdentityEnv instance** across multiple Payment-Kit components
4. **Handle network switching** at the IdentityEnv level, not component level
5. **Use environment variables** for network-specific configuration

## Complete Example

See [identity-env-integration.ts](../examples/identity-env-integration.ts) for a complete working example that demonstrates:

- IdentityEnv initialization
- HTTP client creation for frontend
- Express Payment Kit creation for backend
- Multiple deployment scenarios
- Error handling patterns
