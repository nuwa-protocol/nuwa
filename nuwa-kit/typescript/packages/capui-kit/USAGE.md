# CapUI Kit - Model Context Protocol (MCP) Integration

This package provides a complete MCP (Model Context Protocol) implementation for building AI-powered applications with secure parent-child iframe communication.

## Features

- **MCP Protocol**: Full implementation of the Model Context Protocol for AI tool integration
- **Secure Communication**: SEP-compliant postMessage transport with origin validation
- **Dual Architecture**: MCP for AI tools + direct SDK for parent functions
- **TypeScript Support**: Full type safety with comprehensive interfaces
- **Security First**: Built-in rate limiting, input validation, and origin controls
- **Framework Agnostic**: Works with any JavaScript framework or vanilla JS

## Installation

```bash
npm install @capui/kit
```

## Quick Start

### Parent Application (AI Host)

```typescript
import { CapUIMCPParent } from '@capui/kit'

// Initialize parent with AI capabilities
const parent = new CapUIMCPParent({
  allowedOrigins: ['https://child.example.com'],
  debug: true,
  
  // Implement parent functions that children can call
  onSendPrompt: async (prompt, options, origin) => {
    // Send to your AI backend (OpenAI, Claude, etc.)
    const response = await yourAIBackend.chat(prompt, options)
    return {
      content: response.content,
      model: response.model,
      usage: response.usage
    }
  },
  
  onSendMessage: async (type, payload, origin) => {
    // Handle UI updates from child
    console.log(`Message from ${origin}:`, type, payload)
  },
  
  onGetContext: async (keys, origin) => {
    // Provide context to child
    return {
      user: { id: '123', name: 'John' },
      project: { id: 'abc', name: 'My Project' }
    }
  },
  
  // Event handlers
  onChildConnected: (childOrigin) => {
    console.log('Child connected:', childOrigin)
  },
  
  onToolDiscovered: (tools) => {
    console.log('Child tools discovered:', tools)
  }
})

// Connect to child iframe
const iframe = document.getElementById('child-iframe') as HTMLIFrameElement
await parent.connectToChild(iframe, 'https://child.example.com')

// Use child tools in your AI workflows
const tools = parent.getAllChildTools()
console.log('Available tools:', tools)

// Route AI requests to appropriate child tools
const result = await parent.routeAIRequest({
  toolName: 'calculate',
  arguments: { expression: '2 + 2' },
  requestId: 'req-123'
})
```

### Child Application (Tool Provider)

```typescript
import { CapUIMCP } from '@capui/kit'

// Initialize child with parent connection
const capui = new CapUIMCP({
  parentOrigin: 'https://parent.example.com',
  debug: true,
  serverInfo: {
    name: 'Calculator Tools',
    version: '1.0.0'
  }
})

// Register tools that AI can use
capui.registerTool({
  name: 'calculate',
  description: 'Perform mathematical calculations',
  schema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Mathematical expression' }
    },
    required: ['expression']
  },
  handler: async (params) => {
    try {
      const result = eval(params.expression) // Use a proper math parser in production
      return {
        success: true,
        data: { result, expression: params.expression }
      }
    } catch (error) {
      return {
        success: false,
        error: 'Invalid mathematical expression'
      }
    }
  }
})

capui.registerTool({
  name: 'get_random_number',
  description: 'Generate a random number within a range',
  schema: {
    type: 'object',
    properties: {
      min: { type: 'number', description: 'Minimum value' },
      max: { type: 'number', description: 'Maximum value' }
    },
    required: ['min', 'max']
  },
  handler: async (params) => {
    const { min, max } = params
    const result = Math.floor(Math.random() * (max - min + 1)) + min
    return {
      success: true,
      data: { result, min, max }
    }
  }
})

// Use parent functions
async function interactWithParent() {
  // Send prompt to AI backend via parent
  const response = await capui.sendPrompt('What is 2 + 2?', {
    model: 'gpt-4',
    temperature: 0
  })
  console.log('AI Response:', response.content)
  
  // Send UI update to parent
  await capui.sendMessage('calculation_complete', {
    result: response.content,
    timestamp: Date.now()
  })
  
  // Get context from parent
  const context = await capui.getContext(['user', 'project'])
  console.log('Context:', context)
}
```

## Advanced Usage

### Custom Transport Configuration

```typescript
import { PostMessageMCPTransport, MCPClient, MCPServer } from '@capui/kit'

// Create custom transport with advanced security
const transport = new PostMessageMCPTransport({
  targetOrigin: 'https://trusted-domain.com',
  allowedOrigins: ['https://trusted-domain.com', 'https://backup-domain.com'],
  timeout: 45000,
  debug: true,
  securityPolicy: {
    allowedOrigins: ['https://trusted-domain.com'],
    messageValidation: {
      enforceSchema: true,
      sanitizeInputs: true,
      maxMessageSize: 2 * 1024 * 1024 // 2MB
    }
  }
})

// Use with custom client or server
const client = new MCPClient({ transport, debug: true })
const server = new MCPServer({ transport, debug: true })
```

### Resource Management

```typescript
// Child: Register resources (files, images, etc.)
capui.registerResource('/data/users.json', usersData, 'application/json')
capui.registerResource('/images/chart.png', chartImageBase64, 'image/png')

// Parent: Access child resources
const client = parent.getChildConnection(iframe).client
const resources = await client.discoverResources()
const userData = await client.readResource('/data/users.json')
```

### Error Handling and Monitoring

```typescript
const parent = new CapUIMCPParent({
  onError: (error) => {
    console.error('Parent error:', error)
    // Send to monitoring service
    analytics.track('mcp_error', { error, timestamp: Date.now() })
  }
})

// Monitor connection health
setInterval(() => {
  const stats = parent.getStats()
  console.log('Parent stats:', stats)
  
  if (stats.connectedChildren === 0) {
    console.warn('No children connected')
  }
}, 10000)
```

### Batch Operations

```typescript
// Execute multiple AI requests in parallel
const requests = [
  { toolName: 'calculate', arguments: { expression: '2 + 2' } },
  { toolName: 'calculate', arguments: { expression: '5 * 3' } },
  { toolName: 'get_random_number', arguments: { min: 1, max: 100 } }
]

const results = await parent.batchAIRequests(requests)
console.log('Batch results:', results)
```

## API Reference

### CapUIMCPParent

Main class for parent applications that host AI and manage child iframes.

```typescript
interface CapUIParentOptions {
  allowedOrigins?: string[]
  securityPolicy?: Partial<SecurityPolicy>
  debug?: boolean
  onSendPrompt?: (prompt: string, options?: any, origin?: string) => Promise<AIResponse>
  onSendMessage?: (type: string, payload: any, origin?: string) => Promise<void>
  onGetContext?: (keys?: string[], origin?: string) => Promise<any>
  onChildConnected?: (childOrigin: string) => void
  onChildDisconnected?: (childOrigin: string) => void
  onToolDiscovered?: (tools: DiscoveredTool[]) => void
  onError?: (error: string) => void
}
```

#### Methods

- `connectToChild(iframe: HTMLIFrameElement, childOrigin?: string): Promise<void>`
- `disconnectFromChild(iframe: HTMLIFrameElement, childOrigin?: string): Promise<void>`
- `getAllChildTools(): Array<{ connectionId: string; tools: DiscoveredTool[] }>`
- `callChildTool(connectionId: string, toolName: string, params: any): Promise<any>`
- `routeAIRequest(request: AIRequest): Promise<AIResponse>`
- `batchAIRequests(requests: AIRequest[]): Promise<AIResponse[]>`
- `getStats(): ConnectionStats`
- `destroy(): Promise<void>`

### CapUIMCP

Main class for child applications that provide tools and interact with parent.

```typescript
interface CapUIOptions {
  parentOrigin?: string
  allowedOrigins?: string[]
  timeout?: number
  debug?: boolean
  serverInfo?: { name: string; version: string }
}
```

#### Methods

- `registerTool(tool: ChildToolDefinition): void`
- `unregisterTool(toolName: string): void`
- `registerResource(uri: string, content: any, mimeType?: string): void`
- `sendPrompt(prompt: string, options?: any): Promise<AIResponse>`
- `sendMessage(type: string, payload: any): Promise<void>`
- `getContext(keys?: string[]): Promise<any>`
- `getStats(): ConnectionStats`
- `disconnect(): void`

### Types

```typescript
interface ChildToolDefinition {
  name: string
  description: string
  schema: JSONSchema
  handler: (params: any) => Promise<ToolResult>
  permissions?: string[]
  streaming?: boolean
}

interface AIRequest {
  toolName: string
  arguments: Record<string, any>
  requestId?: string
}

interface AIResponse {
  content: string
  streaming?: boolean
  model?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface SecurityPolicy {
  allowedOrigins: string[]
  toolPermissions: Record<string, ToolPermissions>
  functionPermissions: Record<string, FunctionPermissions>
  messageValidation: MessageValidationConfig
}
```

## Security Best Practices

### Origin Validation

Always specify allowed origins rather than using wildcards:

```typescript
// ❌ Insecure - allows any origin
const parent = new CapUIMCPParent({
  allowedOrigins: ['*']
})

// ✅ Secure - specific origins only
const parent = new CapUIMCPParent({
  allowedOrigins: [
    'https://trusted-child1.example.com',
    'https://trusted-child2.example.com'
  ]
})
```

### Input Validation

Define strict schemas for tool parameters:

```typescript
capui.registerTool({
  name: 'process_data',
  schema: {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        items: { type: 'object' },
        maxItems: 1000
      },
      operation: {
        type: 'string',
        enum: ['sort', 'filter', 'transform']
      }
    },
    required: ['data', 'operation']
  },
  handler: async (params) => {
    // Params are pre-validated against schema
    // ... implementation
  }
})
```

### Rate Limiting

Configure appropriate rate limits for functions:

```typescript
const parent = new CapUIMCPParent({
  securityPolicy: {
    functionPermissions: {
      sendPrompt: {
        origins: ['https://child.example.com'],
        rateLimits: [
          { windowMs: 60000, maxRequests: 10 } // 10 prompts per minute
        ]
      }
    }
  }
})
```

### Content Security Policy

Add CSP headers to restrict iframe sources:

```html
<meta http-equiv="Content-Security-Policy" 
      content="frame-src 'self' https://trusted-child.example.com;">
```

## Troubleshooting

### Common Issues

1. **Connection Timeout**: Increase timeout or check network connectivity
2. **Origin Mismatch**: Ensure iframe src matches allowedOrigins
3. **Schema Validation Errors**: Check tool parameter schemas match usage
4. **Rate Limiting**: Reduce request frequency or increase limits

### Debug Mode

Enable debug mode to see detailed logs:

```typescript
const parent = new CapUIMCPParent({ debug: true })
const child = new CapUIMCP({ debug: true })
```

### Health Monitoring

```typescript
// Monitor connection health
const stats = parent.getStats()
console.log('Health check:', {
  connectedChildren: stats.connectedChildren,
  totalTools: stats.totalTools,
  allReady: stats.connections.every(c => c.isReady)
})
```

## Examples

See the `/examples` directory for complete working examples:

- **Basic Calculator**: Simple math tools with MCP integration
- **Data Visualization**: Chart generation with resource management  
- **AI Assistant**: Full conversational AI with multiple tool providers
- **Security Demo**: Advanced security policy configuration

## Migration Guide

### From CapUI v1.x to v2.x (MCP)

1. Replace `CapEmbedUIKit` with `CapUIMCP` for children
2. Replace direct parent communication with `CapUIMCPParent`
3. Convert tool definitions to MCP format with schemas
4. Update security configuration for new origin validation

See `MIGRATION.md` for detailed migration instructions.

## License

MIT License - see LICENSE file for details.