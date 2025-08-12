# @nuwa-ai/payment-kit

> SDK for NIP-4 Unidirectional Payment Channels on Rooch and other ledgers

TypeScript/JavaScript SDK based on the “NIP-4 Unidirectional Payment Channel Core” specification and Rooch on-chain payment channel contracts.

[English]|[中文](./README.zh-CN.md)

## ✨ Features

- **NIP-4 Compatible**: Full implementation of SubRAV (Sub-channel Receipt And Voucher)
- **Versioned Protocol**: SubRAV versioning for backward compatibility and evolution
- **BCS Serialization**: Native Rooch BCS serialization for on-chain compatibility
- **Multi-device Support**: Multiple sub-channels under one channel, each bound to a verification method
- **Chain Agnostic**: Abstract design; Rooch supported today, extensible to others
- **HTTP Client**: `PaymentChannelHttpClient` handles `X-Payment-Channel-Data`, channel lifecycle, and payment tracking
- **API Server Integration**: `ExpressPaymentKit` mounts payment and billing with one line (built-in per-request/per-usage strategies, auto-settlement, and admin endpoints)
- **Type-safe**: 100% TypeScript with complete typings

## 📦 Installation

```bash
npm install @nuwa-ai/payment-kit @nuwa-ai/identity-kit @roochnetwork/rooch-sdk
```

## 🚀 Getting Started

### Client Integration (HTTP)

> Recommended: Use `PaymentChannelHttpClient` or `createHttpClient` for HTTP integration. It automatically initializes channels, signs, injects/reads headers, and tracks payments.

```typescript
import { IdentityKit } from '@nuwa-ai/identity-kit';
import { createHttpClient } from '@nuwa-ai/payment-kit';

// 1) Initialize identity environment (Rooch network and rpcUrl)
const env = await IdentityKit.bootstrap({
  method: 'rooch',
  vdrOptions: { rpcUrl: 'https://test-seed.rooch.network', network: 'test' },
});

// 2) Create HTTP client (auto-manages channel and payments)
const http = await createHttpClient({
  baseUrl: 'http://localhost:3003',
  env,
  maxAmount: BigInt('10000000000'), // max acceptable per-request amount (asset minimum unit)
  debug: true,
});

// 3) Make payment-enabled request (auto add/parse X-Payment-Channel-Data)
const { data, payment } = await http.get('/echo?message=hello');
console.log('Echo:', data);
console.log('Payment cost (asset units):', payment?.cost.toString());
```

You can also initialize the lower-level class directly:

```typescript
import { PaymentChannelHttpClient } from '@nuwa-ai/payment-kit';

const client = new PaymentChannelHttpClient({
  baseUrl: 'http://localhost:3003',
  chainConfig: { chain: 'rooch', network: 'test', rpcUrl: 'https://test-seed.rooch.network' },
  signer,       // IdentityKit-compatible SignerInterface
  keyId,        // recommended to set explicitly
  payerDid,     // optional, defaults to signer.getDid()
  defaultAssetId: '0x3::gas_coin::RGas',
  maxAmount: BigInt('10000000000'),
  debug: true,
});

const result = await client.post('/process', { text: 'hello world' });
console.log(result.data, result.payment);
```

### API Server Integration (Express)

> Recommended: Use `createExpressPaymentKit` / `createExpressPaymentKitFromEnv` to add payment and billing to an existing Express app. You declare routes and pricing strategies; the framework handles verification, billing, response headers, persistence, and auto-claim.

```typescript
import express from 'express';
import { IdentityKit } from '@nuwa-ai/identity-kit';
import { createExpressPaymentKitFromEnv } from '@nuwa-ai/payment-kit';

// 1) Bootstrap Identity environment
const env = await IdentityKit.bootstrap({
  method: 'rooch',
  vdrOptions: { rpcUrl: 'https://test-seed.rooch.network', network: 'test' },
});

// 2) Create and configure Payment Kit (default price, asset, admin DID, etc.)
const billing = await createExpressPaymentKitFromEnv(env, {
  serviceId: 'payment-example',
  defaultAssetId: '0x3::gas_coin::RGas',
  defaultPricePicoUSD: '1000000000', // 0.001 USD default
  adminDid: 'did:rooch:...',
  debug: true,
});

// 3) Declare business routes and pricing (per request)
billing.get('/echo', { pricing: '2000000000' }, (req, res) => {
  res.json({ echo: req.query.message || 'Hello, World!', timestamp: new Date().toISOString() });
});

// 4) Post-billing by usage (tokens): write usage to res.locals
billing.post(
  '/chat/completions',
  { pricing: { type: 'PerToken', unitPricePicoUSD: '50000000' } },
  (req, res) => {
    const { messages = [], max_tokens = 100 } = req.body || {};
    const prompt = messages.map((m: any) => m.content).join(' ');
    const prompt_tokens = Math.ceil(prompt.length / 4);
    const completion_tokens = Math.min(max_tokens, 50);
    const total_tokens = prompt_tokens + completion_tokens;
    (res as any).locals.usage = total_tokens; // used by strategy for final cost
    res.json({ choices: [{ message: { role: 'assistant', content: 'mock response' } }], usage: { prompt_tokens, completion_tokens, total_tokens } });
  }
);

// 5) Mount router (includes payment-channel admin endpoints and business routes)
const app = express();
app.use(express.json());
app.use(billing.router);
app.listen(3000);
```

#### Service Key Configuration (SERVICE_KEY)

The server needs a signing key for DID identity and on-chain operations. Inject it via environment variable and import on startup:

```bash
# Recommended: configure via .env or deployment platform
export SERVICE_KEY="<your-service-private-key>"
```

```typescript
import { IdentityKit } from '@nuwa-ai/identity-kit';

const env = await IdentityKit.bootstrap({
  method: 'rooch',
  vdrOptions: { rpcUrl: 'https://test-seed.rooch.network', network: 'test' },
});

const serviceKey = process.env.SERVICE_KEY;
if (!serviceKey) throw new Error('SERVICE_KEY is required');

// Import server private key (string format must match your deployment)
const imported = await env.keyManager.importKeyFromString(serviceKey);
const serviceDid = await env.keyManager.getDid();

// Then create ExpressPaymentKit (see example above)
```

Note: The `SERVICE_KEY` format must match `IdentityKit.importKeyFromString` (e.g., keys managed via CADOP or locally generated Ed25519 private key encoding).

Recommended way to obtain `SERVICE_KEY`:

- Visit the CADOP test site: [CADOP Test ID](https://test-id.nuwa.dev/)
- In your DID configuration, choose “Add Authentication Method”
- Select a key type (Ed25519 recommended), then securely save the private key string (compatible with `importKeyFromString`)
- Set that private key string as the `SERVICE_KEY` environment variable in your deployment

You can also review the deep-link authorization flow in the example (`../../examples/payment-kit-integration/src/client-cli.ts`, function `connectToCadop`) to understand how keys are associated with DIDs.

Admin and Discovery endpoints (provided automatically by the framework):

- `/.well-known/nuwa-payment/info` — service info and discovery
- `/payment-channel/health` — health check
- `/payment-channel/admin/claims` — claim scheduler status and trigger

Client can call these via `PaymentChannelAdminClient`:

```typescript
import { PaymentChannelAdminClient } from '@nuwa-ai/payment-kit';

const admin = new PaymentChannelAdminClient(httpClient);
await admin.getClaimsStatus();
await admin.triggerClaim({ channelId: '0x...' });
```

## 🛠️ API Reference

### Core Types

```typescript
interface SubRAV {
  version: number;          // Protocol version (default: 1)
  chainId: bigint;
  channelId: string;        // 32-byte hex string
  channelEpoch: bigint;
  vmIdFragment: string;     // DID verification method fragment
  accumulatedAmount: bigint;
  nonce: bigint;
}

interface SignedSubRAV {
  subRav: SubRAV;
  signature: Uint8Array;
}
```

### HTTP Client and Server Notes

- **`PaymentChannelHttpClient`**: Handles signing, header injection, payment tracking, channel state caching and recovery.
- **`ExpressPaymentKit`**: Declare per-route billing (`PerRequest`/`PerToken`/`FinalCost`), automatically generates next SubRAV proposal on success or protocol error header on failure.
- **`PaymentChannelAdminClient`**: Access admin endpoints (query/trigger claim, SubRAV queries, etc.).

### SubRAVSigner

```typescript
class SubRAVSigner {
  static async sign(
    subRav: SubRAV,
    signer: SignerInterface,
    keyId: string
  ): Promise<SignedSubRAV>;

  static async verify(
    signedSubRAV: SignedSubRAV,
    resolver: DIDResolver
  ): Promise<boolean>;
}
```

### SubRAV BCS Serialization

```typescript
import { SubRAVCodec, SubRAVUtils } from '@nuwa-ai/payment-kit';

// Create SubRAV (uses current protocol version)
const subRav = SubRAVUtils.create({
  chainId: BigInt(4),
  channelId: '0x1234...',
  channelEpoch: BigInt(0),
  vmIdFragment: 'device-key',
  accumulatedAmount: BigInt(1000),
  nonce: BigInt(1),
});

// BCS encode
const encoded = SubRAVCodec.encode(subRav);
const hex = SubRAVCodec.toHex(subRav);

// Decode
const decoded = SubRAVCodec.decode(encoded);
const fromHex = SubRAVCodec.fromHex(hex);
```

## 🔧 Development

### Build

```bash
cd nuwa-kit/typescript/packages/payment-kit
pnpm build
```

### Test

```bash
# Unit tests
pnpm test
```

## 📄 Design Docs

See [DESIGN.md](./DESIGN.md)

### 📚 Examples

- Example project: `nuwa-kit/typescript/examples/payment-kit-integration`
  - Client CLI: `src/client-cli.ts` (demonstrates `PaymentChannelHttpClient` and `PaymentChannelAdminClient`)
  - Server: `src/server.ts` (demonstrates `createExpressPaymentKitFromEnv` with multiple billing strategies)

## 📄 License

Apache-2.0


