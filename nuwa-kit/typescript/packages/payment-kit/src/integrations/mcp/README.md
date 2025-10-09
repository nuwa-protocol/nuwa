# MCP Integration

This directory contains the complete Model Context Protocol (MCP) integration for the Nuwa Payment Kit, providing both payment-enabled and standard MCP client implementations with automatic server detection capabilities.

## Overview

The MCP integration consists of several key components that work together to provide a seamless experience for connecting to both payment-enabled and standard MCP servers:

- **UniversalMcpClient**: Intelligent client that auto-detects server capabilities
- **PaymentChannelMcpClient**: Full-featured client for payment-enabled MCP servers
- **McpToolConverter**: Shared utility for converting MCP tools to AI SDK format
- **ServerDetector**: Automatic server capability detection
- **McpChannelManager**: Payment channel lifecycle management

## Architecture

```
mcp/
├── UniversalMcpClient.ts      # Main entry point - auto-detecting client
├── PaymentChannelMcpClient.ts # Payment-enabled MCP client
├── McpToolConverter.ts        # Shared tool format conversion
├── ServerDetector.ts          # Server capability detection
├── McpChannelManager.ts       # Payment channel management
├── types.ts                   # TypeScript type definitions
└── README.md                  # This documentation
```

## Key Features

- 🔍 **Auto-Detection**: Automatically detects server type via `/.well-known/nuwa-payment/info`
- 🔄 **Seamless Switching**: Chooses appropriate client based on server capabilities
- 📦 **Full Compatibility**: 100% backward compatible with existing PaymentChannelMcpClient API
- 🚀 **Zero Migration**: Existing code works without modifications
- 🛡️ **Type Safety**: Complete TypeScript type support
- 🎯 **AI SDK Integration**: Native support for AI SDK's tool calling interface

## Quick Start

### Basic Usage (Recommended)

```typescript
import { bootstrapIdentityEnv, createMcpClient } from '@nuwa-ai/payment-kit';

// 1. Setup identity environment (once per application)
const env = await bootstrapIdentityEnv({
  method: 'rooch',
  vdrOptions: { rpcUrl: 'https://testnet.rooch.network', network: 'test' },
});

// 2. Create universal MCP client (auto-detection)
const client = await createMcpClient({
  baseUrl: 'http://localhost:8080/mcp',
  env,
  maxAmount: BigInt('500000000000'), // 50 cents USD
});

// 3. Use it! API is identical to PaymentChannelMcpClient
const result = await client.call('some_tool', { param: 'value' });

// 4. Check detected server type
console.log('Server type:', client.getServerType()); // 'payment' | 'standard'
console.log('Supports payment:', client.supportsPayment());
```

### Force Specific Mode

```typescript
// Force payment mode (skip detection)
const paymentClient = await createMcpClient({
  baseUrl: 'http://payment-server:8080/mcp',
  env,
  forceMode: 'payment',
});

// Force standard mode (skip detection)
const standardClient = await createMcpClient({
  baseUrl: 'http://standard-server:8080/mcp',
  env,
  forceMode: 'standard',
});
```

## Components

### UniversalMcpClient

The main client that provides intelligent server detection and unified API access.

**Key Methods:**
- `call()` - Execute tools with payment support
- `callTool()` - Execute tools and return raw content
- `tools()` - Get AI SDK compatible tool definitions
- `getServerType()` - Get detected server type
- `supportsPayment()` - Check if server supports payments

### PaymentChannelMcpClient

Specialized client for payment-enabled MCP servers with full Nuwa protocol support.

**Features:**
- Payment channel management
- DID-based authentication
- Transaction logging
- SubRAV handling
- Built-in tool filtering

### McpToolConverter

Shared utility for converting MCP tool definitions to AI SDK compatible format.

**Features:**
- Handles nested `jsonSchema` structures
- Supports multiple schema locations (`inputSchema`, `parameters`, `input_schema`)
- Provides proper TypeScript typing
- Uses AI SDK's `dynamicTool` helper

### ServerDetector

Automatic server capability detection through well-known endpoints and MCP handshake.

**Detection Process:**
1. Check `/.well-known/nuwa-payment/info` for payment protocol support
2. Connect to MCP server to get standard capabilities
3. Merge information to determine server type and features

## API Reference

### Core Methods

All methods are compatible with PaymentChannelMcpClient:

#### Tool Execution

```typescript
// Call tool with payment support
const result = await client.call('tool_name', { param: 'value' });

// Call tool and return raw content
const { content } = await client.callTool('tool_name', { param: 'value' });

// Get AI SDK compatible tools
const tools = await client.tools();
```

#### Resources and Prompts

```typescript
// List tools
const tools = await client.listTools();

// List prompts
const prompts = await client.listPrompts();

// Load prompt
const prompt = await client.loadPrompt('prompt_name', { arg: 'value' });

// List resources
const resources = await client.listResources();

// Read resource
const resource = await client.readResource('resource://example');
```

### Server Information

```typescript
// Get server type
const type = client.getServerType(); // 'payment' | 'standard' | 'unknown'

// Get enhanced server capabilities
const capabilities = client.getCapabilities();

// Check supported features
const supportsPayment = client.supportsPayment();
const supportsAuth = client.supportsAuth();
const hasBuiltinTools = client.hasBuiltinTools();
```

## Server Detection

### Detection Flow

1. **Well-known Endpoint**: Try accessing `/.well-known/nuwa-payment/info`
2. **MCP Capabilities**: Connect to MCP server to get standard capabilities
3. **Result Merging**: Combine both sources to determine server type

### Payment Protocol Detection

If `/.well-known/nuwa-payment/info` returns valid payment information:

```json
{
  "serviceId": "my-service",
  "serviceDid": "did:example:123",
  "defaultAssetId": "0x3::gas_coin::RGas",
  "supportedFeatures": ["payment", "auth"],
  "basePath": "/payment-channel"
}
```

The server is identified as payment-enabled.

### Capability Structure

```typescript
interface EnhancedServerCapabilities {
  // Standard MCP capabilities
  tools?: { listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };

  // Nuwa extensions
  nuwa?: {
    payment?: {
      supported: boolean;
      serviceId?: string;
      serviceDid?: string;
      defaultAssetId?: string;
    };
    auth?: {
      supported: boolean;
      methods?: string[];
    };
    builtinTools?: {
      supported: boolean;
      tools?: string[];
    };
  };
}
```

## AI SDK Integration

The MCP integration provides native support for AI SDK's tool calling interface:

```typescript
import { streamText } from 'ai';

// Get AI SDK compatible tools
const tools = await client.tools();

// Use with AI SDK
const { textStream } = await streamText({
  model: openai('gpt-4'),
  messages: [{ role: 'user', content: 'Help me with maps' }],
  tools,
});
```

### Tool Format Conversion

The `McpToolConverter` handles the conversion from MCP tool definitions to AI SDK format:

- Extracts schemas from various locations
- Handles nested `jsonSchema` structures
- Provides proper `dynamicTool` instances
- Maintains type safety throughout

## Error Handling

```typescript
try {
  const result = await client.call('tool_name', params);
} catch (error) {
  if (error.code === 'PAYMENT_REQUIRED') {
    // Handle payment errors
  } else if (error.code === 'TOOL_NOT_FOUND') {
    // Handle tool not found errors
  }
}
```

## Best Practices

1. **Use Auto-Detection**: Unless you have specific requirements, use the default auto-detection mode
2. **Cache Client Instances**: Client initialization has overhead, reuse instances when possible
3. **Proper Timeout Settings**: Adjust `detectionTimeout` based on your network environment
4. **Error Handling**: Always include appropriate error handling logic
5. **Resource Cleanup**: Call `client.close()` when shutting down to clean up resources

## Migration Guide

### From PaymentChannelMcpClient

Existing code using `PaymentChannelMcpClient` works without changes:

```typescript
// Old code - still works
import { createMcpClient } from '@nuwa-ai/payment-kit';

const client = await createMcpClient({ baseUrl, env });
const result = await client.call('tool', {});
```

### Type Compatibility

```typescript
// Type aliases provide backward compatibility
import type { PaymentChannelMcpClientType } from '@nuwa-ai/payment-kit';

// Equivalent to UniversalMcpClient
const client: PaymentChannelMcpClientType = await createMcpClient(options);
```

## Troubleshooting

### Detection Failures

If auto-detection fails, the client defaults to standard MCP mode. Enable debug logging for details:

```typescript
const client = await createMcpClient({
  baseUrl,
  env,
  debug: true, // Enable debug logging
});
```

### Force Mode

If auto-detection is inaccurate, force a specific mode:

```typescript
const client = await createMcpClient({
  baseUrl,
  env,
  forceMode: 'payment', // or 'standard'
});
```

### Common Issues

1. **Connection Timeouts**: Increase `detectionTimeout` for slow networks
2. **Authentication Errors**: Ensure proper DID setup and key management
3. **Payment Failures**: Check channel balance and asset configuration
4. **Tool Not Found**: Verify tool names and server capabilities

## Development

### Adding New Features

1. Update type definitions in `types.ts`
2. Implement in appropriate client class
3. Add tests for new functionality
4. Update documentation

### Testing

```bash
# Run MCP integration tests
npm test -- --grep "MCP"

# Test with real servers
npm run test:integration
```

## Contributing

When contributing to the MCP integration:

1. Maintain backward compatibility
2. Add comprehensive tests
3. Update type definitions
4. Document new features
5. Follow existing code patterns
