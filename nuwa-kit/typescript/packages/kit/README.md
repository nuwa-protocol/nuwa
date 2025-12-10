# @nuwa-ai/kit

> 🚀 **Unified Nuwa Protocol SDK** - One SDK to rule them all

The official TypeScript SDK for the Nuwa Protocol, providing a unified interface for identity management, payment channels, and AI service integration across browser and Node.js environments.

## ✨ Features

- **🎯 Unified API**: Single entry point for all Nuwa Protocol functionality
- **🌍 Cross-Platform**: Works seamlessly in browser and Node.js environments
- **🔧 Auto-Configuration**: Smart environment detection with sensible defaults
- **⚡ Lazy Loading**: Modules load only when needed for optimal performance
- **🛡️ Type Safe**: Full TypeScript support with environment-aware types
- **🔌 Modular Design**: Clean separation of identity, payment, and server functionality
- **📦 Tree Shakable**: Browser builds exclude Node.js-only code automatically

## 🚀 Quick Start

### Installation

```bash
npm install @nuwa-ai/kit
# or
pnpm add @nuwa-ai/kit
# or
yarn add @nuwa-ai/kit
```

### Browser Usage

```typescript
import { NuwaKit } from '@nuwa-ai/kit';

// Initialize for browser environment
const nuwa = await NuwaKit.initialize({
  environment: 'client', // or 'auto' for auto-detection
  network: 'test',
  identity: {
    cadopDomain: 'https://test-id.nuwa.dev',
    appName: 'My Nuwa App',
  },
});

// Connect to CADOP for authentication
await nuwa.identity.connect();

// Create payment client
const client = await nuwa.payment.createHttpClient({
  baseUrl: 'https://api.example.com',
  maxAmount: BigInt('1000000000000'), // 1 USD
});

// Make paid API calls
const response = await client.post('/api/chat', {
  message: 'Hello, AI!',
});
```

### Server Usage

```typescript
import { NuwaKit } from '@nuwa-ai/kit';
import express from 'express';

// Initialize for server environment
const nuwa = await NuwaKit.initialize({
  environment: 'server',
  network: 'test',
  identity: {
    serviceKey: process.env.SERVICE_KEY,
  },
  express: {
    serviceId: 'my-ai-service',
    defaultPricePicoUSD: BigInt('1000000000'), // 0.001 USD per request
  },
});

// Create Express app with billing
const app = express();
const billing = await nuwa.express.createPaymentKit();

// Register paid endpoints
billing.post(
  '/api/chat',
  { pricing: '10000000000' }, // 0.01 USD per request
  async (req, res) => {
    res.json({ response: 'AI response here' });
  }
);

app.use(billing.router);
app.listen(3000);
```

## 📖 API Reference

### NuwaKit

The main SDK class providing unified access to all functionality.

#### `NuwaKit.initialize(config?)`

Initialize the SDK with optional configuration.

```typescript
const nuwa = await NuwaKit.initialize({
  environment: 'auto' | 'client' | 'server',
  network: 'local' | 'dev' | 'test' | 'main',
  rpcUrl?: string,
  debug?: boolean,

  identity?: {
    serviceKey?: string,        // Server-side
    cadopDomain?: string,       // Client-side
    storage?: 'local' | 'indexeddb' | 'memory',
    appName?: string
  },

  payment?: {
    defaultAssetId?: string,
    maxAmount?: bigint | string,
    timeoutMs?: number
  },

  express?: {                   // Node.js only
    serviceId?: string,
    adminDid?: string | string[],
    defaultPricePicoUSD?: bigint | string,
    basePath?: string
  }
});
```

#### Instance Properties

- `nuwa.identity` - Identity management module
- `nuwa.payment` - Payment channel operations
- `nuwa.express` - Express.js integration (Node.js only)

#### Instance Methods

- `nuwa.getEnvironment()` - Get detected environment ('browser' | 'node')
- `nuwa.getConfig()` - Get resolved configuration
- `nuwa.getCapabilities()` - Get available features
- `nuwa.isModuleAvailable(name)` - Check module availability
- `nuwa.getDebugInfo()` - Get comprehensive debug information

### Identity Module

Unified identity management across environments.

#### Browser Methods

```typescript
// Connect to CADOP for authentication
await nuwa.identity.connect({ scopes?: string[] });

// Handle OAuth callback
await nuwa.identity.handleCallback(window.location.search);

// Check connection status
const isConnected = await nuwa.identity.isConnected();
```

#### Universal Methods

```typescript
// Get current DID
const did = await nuwa.identity.getDid();

// List available key IDs
const keyIds = await nuwa.identity.getKeyIds();

// Sign data with specific key
const signature = await nuwa.identity.signWithKeyId(data, keyId);

// Logout (clear stored keys)
await nuwa.identity.logout();
```

### Payment Module

Payment channel operations for HTTP and MCP clients.

#### HTTP Client

```typescript
const httpClient = await nuwa.payment.createHttpClient({
  baseUrl: 'https://api.example.com',
  maxAmount?: bigint,
  debug?: boolean
});

// Make paid requests
const response = await httpClient.get('/api/data');
const result = await httpClient.post('/api/process', { data });
```

#### MCP Client

```typescript
const mcpClient = await nuwa.payment.createMcpClient({
  baseUrl: 'https://mcp-server.example.com',
  maxAmount?: bigint,
  storageOptions?: { namespace?: string }
});

// List available tools
const tools = await mcpClient.listTools();

// Call tools with automatic payment
const result = await mcpClient.callTool('tool-name', { params });
```

#### Admin Client

```typescript
const adminClient = await nuwa.payment.createAdminClient({
  baseUrl: 'https://payment-hub.example.com',
});

// Manage payment channels
const channels = await adminClient.listChannels();
const balance = await adminClient.getBalance(channelId);
```

### Express Module (Node.js Only)

Express.js integration with automatic billing.

#### Payment Kit

```typescript
const billing = await nuwa.express.createPaymentKit({
  serviceId?: string,
  defaultPricePicoUSD?: bigint,
  adminDid?: string[]
});

// Register paid endpoints
billing.get('/api/data', { pricing: '1000000000' }, handler);
billing.post('/api/process', { pricing: '5000000000' }, handler);

// Mount router
app.use(billing.router);
```

#### Configuration Methods

```typescript
// Get service configuration
const serviceId = nuwa.express.getServiceId();
const adminDids = nuwa.express.getAdminDids();
const defaultPrice = nuwa.express.getDefaultPrice();

// Get claim and hub balance settings
const claimConfig = nuwa.express.getClaimConfig();
const hubConfig = nuwa.express.getHubBalanceConfig();
```

## 🔧 Configuration

### Environment Variables

The SDK automatically loads configuration from environment variables:

```bash
# Network configuration
ROOCH_NETWORK=test
ROOCH_NODE_URL=https://test-seed.rooch.network

# Identity configuration
SERVICE_KEY=your-service-key-here
CADOP_DOMAIN=https://test-id.nuwa.dev

# Express configuration
SERVICE_ID=my-ai-service
ADMIN_DID=did:rooch:1234567890abcdef
```

### Configuration Priority

1. **User-provided config** (highest priority)
2. **Environment variables**
3. **Default values** (lowest priority)

### Network Defaults

Each network has sensible defaults:

- **local**: `http://localhost:6767`, `http://localhost:3000`
- **dev**: Development endpoints
- **test**: Test network endpoints
- **main**: Production endpoints

## 🌍 Environment Support

### Browser Environment

- ✅ CADOP authentication flow
- ✅ LocalStorage/IndexedDB key storage
- ✅ HTTP payment clients
- ✅ MCP payment clients
- ❌ Express integration (Node.js only)

### Node.js Environment

- ✅ Service key authentication
- ✅ File-based key storage
- ✅ HTTP payment clients
- ✅ MCP payment clients
- ✅ Express integration
- ✅ Admin operations

### Automatic Detection

The SDK automatically detects the environment:

```typescript
// Auto-detect environment
const nuwa = await NuwaKit.initialize({ environment: 'auto' });

// Manual override
const nuwa = await NuwaKit.initialize({ environment: 'server' });
```

## 🚨 Error Handling

The SDK provides comprehensive error handling with intelligent error wrapping:

```typescript
import {
  NuwaKitError,
  NuwaKitConfigError,
  NuwaKitEnvironmentError,
  NuwaKitInitializationError,
  NuwaKitRuntimeError,
  NuwaKitModuleUnavailableError,
  isNuwaKitError,
  createErrorSummary,
  formatErrorForConsole,
} from '@nuwa-ai/kit';

try {
  const nuwa = await NuwaKit.initialize(config);
} catch (error) {
  if (isNuwaKitError(error)) {
    // Get user-friendly error message
    console.error(error.getUserMessage());

    // Get detailed error summary
    const summary = createErrorSummary(error);
    console.log('Error details:', summary);

    // Format for console with colors and suggestions
    console.log(formatErrorForConsole(error));
  }
}
```

### Error Types

- **NuwaKitConfigError**: Configuration validation errors
- **NuwaKitEnvironmentError**: Environment detection/compatibility issues
- **NuwaKitInitializationError**: SDK initialization failures
- **NuwaKitRuntimeError**: Runtime operation errors
- **NuwaKitModuleUnavailableError**: Module not available in current environment

### Package Error Integration

NuwaKit automatically wraps and preserves errors from underlying packages:

```typescript
// PaymentKitError, IdentityKit errors, etc. are automatically wrapped
try {
  const client = await nuwa.payment.createHttpClient({ baseUrl: 'invalid' });
} catch (error) {
  // error is a NuwaKitRuntimeError that wraps the original PaymentKitError
  const summary = createErrorSummary(error);
  console.log(`Error from ${summary.package}: ${summary.code}`);
}
```

## 🔄 Migration Guide

### From @nuwa-ai/identity-kit-web

```typescript
// Before
import { IdentityKitWeb } from '@nuwa-ai/identity-kit-web';
const identity = await IdentityKitWeb.init();
await identity.connect();

// After
import { NuwaKit } from '@nuwa-ai/kit';
const nuwa = await NuwaKit.initialize();
await nuwa.identity.connect();
```

### From @nuwa-ai/payment-kit

```typescript
// Before
import { createHttpClient } from '@nuwa-ai/payment-kit/http';
const client = await createHttpClient({ env, baseUrl });

// After
import { NuwaKit } from '@nuwa-ai/kit';
const nuwa = await NuwaKit.initialize();
const client = await nuwa.payment.createHttpClient({ baseUrl });
```

### From ExpressPaymentKit

```typescript
// Before
import { createExpressPaymentKit } from '@nuwa-ai/payment-kit/express';
const billing = await createExpressPaymentKit(options);

// After
import { NuwaKit } from '@nuwa-ai/kit';
const nuwa = await NuwaKit.initialize();
const billing = await nuwa.express.createPaymentKit();
```

## 🛠️ Development

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

### Type Checking

```bash
pnpm type-check
```

## 📄 License

Apache-2.0 License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📞 Support

- 📖 [Documentation](https://docs.nuwa.dev)
- 💬 [Discord Community](https://discord.gg/nuwa)
- 🐛 [Issue Tracker](https://github.com/rooch-network/nuwa/issues)
- 📧 [Email Support](mailto:support@nuwa.dev)

---

<div align="center">
  <strong>Built with ❤️ by the Nuwa Protocol Team</strong>
</div>
