# LLM Gateway Core Modules

This directory contains the core modules of the LLM Gateway after the refactoring. The architecture has been split into focused, testable modules that separate concerns and enable independent testing.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  ProviderManager│    │   AuthManager   │    │  RouteHandler   │
│                 │    │                 │    │                 │
│ • Registration  │    │ • DID Auth      │    │ • Request       │
│ • Configuration │    │ • PaymentKit    │    │   Processing    │
│ • API Keys      │    │ • Middleware    │    │ • Response      │
│                 │    │                 │    │   Handling      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  PathValidator  │
                    │                 │
                    │ • Path Security │
                    │ • Validation    │
                    │ • Sanitization  │
                    └─────────────────┘
```

## Modules

### 1. ProviderManager (`providerManager.ts`)

Manages LLM provider registration, configuration, and access.

**Key Features:**
- Provider registration and lifecycle management
- API key resolution from environment variables
- Configuration validation
- Singleton pattern with test instance support

**Usage:**
```typescript
import { ProviderManager } from './core/providerManager.js';

// Get singleton instance
const manager = ProviderManager.getInstance();

// Initialize providers from environment
const result = manager.initializeProviders();
console.log('Registered:', result.registered);

// Get provider instance
const openaiProvider = manager.getProvider('openai');

// Get API key
const apiKey = manager.getProviderApiKey('openai');
```

**Testing:**
```typescript
// Create isolated test instance
const testManager = ProviderManager.createTestInstance();

// Initialize without environment checks
testManager.initializeProviders({ skipEnvCheck: true });
```

### 2. AuthManager (`authManager.ts`)

Handles DID authentication and PaymentKit integration.

**Key Features:**
- PaymentKit initialization and configuration
- DID authentication validation
- Route registration with PaymentKit
- Test mode support (skip authentication)

**Usage:**
```typescript
import { AuthManager } from './core/authManager.js';

const authManager = new AuthManager();

// Initialize with configuration
const paymentKit = await authManager.initialize({
  serviceId: 'llm-gateway',
  defaultAssetId: '0x3::gas_coin::RGas',
  debug: true
});

// Create authentication middleware
const authMiddleware = authManager.createAuthMiddleware({ 
  skipAuth: false 
});

// Register routes with Express app
authManager.registerRoutes(app);
```

**Testing:**
```typescript
// Create test instance without PaymentKit
const testAuth = AuthManager.createTestInstance();

// Validate DID authentication
const result = testAuth.validateDIDAuth(req);
```

### 3. RouteHandler (`routeHandler.ts`)

Processes HTTP requests to providers with authentication and billing.

**Key Features:**
- Unified request handling (streaming and non-streaming)
- Provider-specific request preparation
- Usage tracking and cost calculation
- Error handling and response formatting

**Usage:**
```typescript
import { RouteHandler } from './core/routeHandler.js';

const routeHandler = new RouteHandler({
  providerManager,
  authManager,
  skipAuth: false
});

// Handle provider request
await routeHandler.handleProviderRequest(req, res, 'openai');

// Handle non-streaming request
const result = await routeHandler.handleNonStreamRequest(req, 'openai');

// Handle streaming request
await routeHandler.handleStreamRequest(req, res, 'openai');
```

**Testing:**
```typescript
// Create test instance
const testHandler = RouteHandler.createTestInstance({
  skipAuth: true,
  enabledProviders: ['openai']
});
```

### 4. PathValidator (`pathValidator.ts`)

Validates and sanitizes request paths for security.

**Key Features:**
- Path extraction from request URLs
- Security validation (prevents directory traversal, etc.)
- Provider-specific path allowlist checking
- Comprehensive error reporting

**Usage:**
```typescript
import { PathValidator } from './core/pathValidator.js';

// Validate request path
const result = PathValidator.validatePath(req, 'openai', providerConfig);
if (result.error) {
  return res.status(400).json({ error: result.error });
}

// Check if path is allowed
const isAllowed = PathValidator.isPathAllowed('/v1/chat/completions', [
  '/v1/chat/completions',
  '/v1/models',
  '/v1/*'
]);
```

**Testing:**
```typescript
// Validate multiple paths
const results = PathValidator.validatePaths(
  ['/v1/chat/completions', '/v1/models'],
  ['/v1/*']
);

// Check for dangerous patterns
const hasDanger = PathValidator.hasDangerousPatterns('../etc/passwd');
```

## Integration Example

Here's how the modules work together in the main application:

```typescript
import express from 'express';
import { ProviderManager } from './core/providerManager.js';
import { AuthManager } from './core/authManager.js';
import { RouteHandler } from './core/routeHandler.js';

export async function initPaymentKitAndRegisterRoutes(app: express.Application) {
  // 1. Initialize core managers
  const providerManager = ProviderManager.getInstance();
  const authManager = new AuthManager();
  
  // 2. Initialize authentication
  const paymentKit = await authManager.initialize({
    serviceId: 'llm-gateway',
    debug: process.env.DEBUG === 'true'
  });

  // 3. Initialize providers
  const result = providerManager.initializeProviders();
  console.log(`Initialized ${result.registered.length} providers`);

  // 4. Create route handler
  const routeHandler = new RouteHandler({
    providerManager,
    authManager,
    skipAuth: false
  });

  // 5. Register routes
  const providers = providerManager.list();
  providers.forEach(providerName => {
    const pathPattern = new RegExp(`^\\/${providerName}\\/(.*)$`);
    
    paymentKit.post(pathPattern, { pricing: { type: 'FinalCost' } }, 
      (req, res) => routeHandler.handleProviderRequest(req, res, providerName),
      `${providerName}.post.wildcard`
    );
  });

  // 6. Register PaymentKit routes
  authManager.registerRoutes(app);
  
  return paymentKit;
}
```

## Testing Strategy

### Unit Tests
Each module can be tested independently:

```typescript
// Test ProviderManager
const manager = ProviderManager.createTestInstance();
manager.initializeProviders({ skipEnvCheck: true });

// Test AuthManager
const auth = AuthManager.createTestInstance();
const result = auth.validateDIDAuth(mockRequest);

// Test RouteHandler
const handler = RouteHandler.createTestInstance({ skipAuth: true });
const response = await handler.handleNonStreamRequest(mockRequest, 'openai');

// Test PathValidator
const pathResult = PathValidator.validatePath(mockRequest, 'openai', config);
```

### Integration Tests
Real API calls with environment-based configuration:

```typescript
import { TestEnv } from '../test/utils/testEnv.js';

// Skip tests if API keys not configured
TestEnv.describeProvider('openai', () => {
  it('should handle real API calls', async () => {
    const apiKey = TestEnv.getProviderApiKey('openai');
    // ... test with real API
  });
});
```

## Benefits of the New Architecture

1. **Separation of Concerns**: Each module has a single, well-defined responsibility
2. **Testability**: Modules can be tested independently without full PaymentKit setup
3. **Maintainability**: Clear interfaces and focused functionality
4. **Extensibility**: Easy to add new providers or authentication methods
5. **Debugging**: Easier to isolate and fix issues in specific areas

## Migration Guide

### For Existing Code

The main entry point (`paymentKit.ts`) maintains backward compatibility:

```typescript
// Old usage still works
import { initPaymentKitAndRegisterRoutes } from './paymentKit.js';
const paymentKit = await initPaymentKitAndRegisterRoutes(app);

// New modules are also available
import { ProviderManager, AuthManager } from './paymentKit.js';
```

### For Tests

Update existing tests to use the new modules:

```typescript
// Old
import { providerRegistry } from './providers/registry.js';

// New
import { ProviderManager } from './core/providerManager.js';
const manager = ProviderManager.createTestInstance();
```

## Environment Variables

The new architecture supports the same environment variables:

```bash
# Provider API Keys
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
LITELLM_API_KEY=sk-...

# Provider Configuration
OPENAI_BASE_URL=https://api.openai.com
OPENROUTER_BASE_URL=https://openrouter.ai
LITELLM_BASE_URL=http://localhost:4000

# Authentication & Billing
SERVICE_KEY=...
DEFAULT_ASSET_ID=0x3::gas_coin::RGas
ADMIN_DID=did:rooch:...

# Testing
SKIP_INTEGRATION_TESTS=true  # Skip real API tests
```

## Future Enhancements

The modular architecture enables future improvements:

1. **Provider Plugins**: Dynamic provider loading
2. **Advanced Authentication**: Multiple auth methods
3. **Caching Layer**: Response caching in RouteHandler
4. **Monitoring**: Enhanced metrics and observability
5. **Rate Limiting**: Per-provider rate limiting
