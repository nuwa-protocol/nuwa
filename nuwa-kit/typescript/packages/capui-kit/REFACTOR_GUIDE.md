# CapUI Kit v2.0 - Refactored Architecture

CapUI Kit has been completely refactored with a **hybrid architecture** that provides both simple iframe communication and advanced MCP-based AI tool integration.

## 🏗️ New Architecture Overview

### **Dual Architecture Approach**

```
┌─────────────────┐    ┌─────────────────────┐
│   Embed UI      │    │   Artifact UI       │
│   (Simple)      │    │   (MCP-powered)     │
├─────────────────┤    ├─────────────────────┤
│ • Penpal-based  │    │ • Official MCP SDK  │
│ • One-way calls │    │ • Tool registration │ 
│ • Easy to use   │    │ • AI integration    │
│ • Lightweight   │    │ • Advanced features │
└─────────────────┘    └─────────────────────┘
        │                       │
        └───────┬───────────────┘
                │
    ┌─────────────────────────┐
    │  Shared Parent Methods  │
    │  • sendPrompt()         │
    │  • sendMessage()        │
    │  • getContext()         │
    │  • setHeight()          │
    │  • showLoading()        │
    └─────────────────────────┘
```

## 📦 Main Exports

### **For Simple Use Cases (Embed UI)**
```typescript
import { CapEmbedUIKit, useCapEmbedUIKit } from '@capui/kit'

// Vanilla JS
const capui = new CapEmbedUIKit({ debug: true })
await capui.sendPrompt('Hello AI!')

// React Hook
const { sendPrompt, isConnected } = useCapEmbedUIKit({ debug: true })
```

### **For AI Tool Integration (Artifact UI)**
```typescript
import { CapUIArtifact, CapUIParent } from '@capui/kit'

// Child: Register AI tools
const capui = new CapUIArtifact({ debug: true })
capui.registerTool({
  name: 'calculate',
  description: 'Perform math calculations',
  inputSchema: { type: 'object', properties: { expression: { type: 'string' } } },
  handler: async ({ expression }) => ({ result: eval(expression) })
})

// Parent: Discover and use tools
const parent = new CapUIParent({ debug: true })
const connectionId = await parent.connectToChild(iframe)
const result = await parent.callTool(connectionId, 'calculate', { expression: '2+2' })
```

## 🔧 Key Improvements

### **1. Standards Compliance**
- Uses official `@modelcontextprotocol/sdk` instead of custom implementation
- Follows MCP protocol specifications exactly
- Future-proof with automatic protocol updates

### **2. Shared Parent API**
Both architectures implement the same `ParentFunctions` interface:
```typescript
interface ParentFunctions {
  sendPrompt(prompt: string, options?: PromptOptions): Promise<AIResponse>
  sendPromptStreaming(prompt: string, options: StreamingPromptOptions): Promise<string>
  sendMessage(type: string, payload: any): Promise<void>
  getContext(keys?: string[]): Promise<any>
  setHeight(height: string | number): Promise<void>
  showLoading(message?: string): Promise<void>
  hideLoading(): Promise<void>
}
```

### **3. Enhanced Security**
- Origin validation with specific domain support
- Rate limiting and message size limits
- Input validation and sanitization
- Secure transport layer implementation

### **4. Better Type Safety**
- Comprehensive TypeScript interfaces
- Shared types between architectures
- Clear separation of concerns

## 🚀 Migration Guide

### **From v1.x Embed UI**
```typescript
// Old v1.x
import { CapEmbedUIKit } from '@capui/kit'
const capui = new CapEmbedUIKit()
await capui.connect()
const result = await capui.sendPrompt('test') // Returns string

// New v2.x  
import { CapEmbedUIKit } from '@capui/kit'
const capui = new CapEmbedUIKit() // Auto-connects by default
const result = await capui.sendPrompt('test') // Returns AIResponse object
console.log(result.content) // Access content property
```

### **From v1.x MCP Implementation**
```typescript
// Old v1.x (custom MCP)
import { CapUIMCP, CapUIMCPParent } from '@capui/kit'

// New v2.x (official MCP SDK)
import { CapUIArtifact, CapUIParent } from '@capui/kit'
// Or use legacy exports:
import { CapUIMCP, CapUIMCPParent } from '@capui/kit' // Now aliases to new classes
```

## 🔄 Streaming Support

Both architectures support streaming:

```typescript
// Child
await capui.sendPromptStreaming('Generate a story', {
  streaming: true,
  model: 'gpt-4',
  onChunk: (response) => {
    console.log('Chunk:', response.content)
  },
  onComplete: (final) => {
    console.log('Done:', final.content)
  },
  onError: (error) => {
    console.error('Error:', error)
  }
})

// Parent handler
const parent = new CapUIParent({
  onSendPromptStreaming: async (prompt, options, origin) => {
    const { streamId } = options
    
    // Your streaming implementation
    // Send chunks via: parent.sendStreamingResponse(streamId, chunk)
  }
})
```

## 🛠️ Advanced Usage

### **Custom MCP Transport**
```typescript
import { PostMessageMCPTransport, MCPClientWrapper } from '@capui/kit'

const transport = new PostMessageMCPTransport({
  allowedOrigins: ['https://trusted-domain.com'],
  securityPolicy: {
    enforceOriginValidation: true,
    maxMessageSize: 2 * 1024 * 1024 // 2MB
  }
})

const client = new MCPClientWrapper({
  transport,
  debug: true
})
```

### **Tool Discovery and Management**
```typescript
const parent = new CapUIParent({
  onToolDiscovered: (tools) => {
    console.log('New tools available:', tools.map(t => t.name))
  }
})

// Get all tools from all children
const allTools = parent.getAllTools()
console.log('Available tools:', allTools)

// Route AI requests automatically
const result = await parent.routeToolRequest({
  toolName: 'weather',
  arguments: { location: 'San Francisco' }
})
```

## 📁 File Structure

```
src/
├── shared/
│   ├── types.ts               # Common types and errors
│   └── parent-functions.ts    # Shared parent interface
├── embed-ui/                  # Simple Penpal-based
│   ├── cap-ui-embed.ts       # Main embed class
│   └── use-cap-ui-embed.ts   # React hook
└── artifact-ui/              # MCP-based
    ├── cap-ui-artifact.ts          # Child MCP class  
    ├── cap-ui-parent.ts            # Parent MCP class
    ├── mcp-client-wrapper.ts       # MCP client wrapper
    ├── mcp-server-wrapper.ts       # MCP server wrapper
    └── mcp-postmessage-transport.ts # MCP transport
```

## 🔍 Debugging

Enable debug mode to see detailed logs:

```typescript
// Embed UI
const capui = new CapEmbedUIKit({ debug: true })

// Artifact UI  
const capui = new CapUIArtifact({ debug: true })
const parent = new CapUIParent({ debug: true })
```

Debug logs show:
- Connection establishment
- Message flows  
- Tool discovery
- Function calls
- Error details

## 🎯 When to Use Which Architecture

### **Use Embed UI when:**
- Simple iframe communication
- One-way parent function calls
- Lightweight requirements
- Quick prototyping
- No AI tool integration needed

### **Use Artifact UI when:**
- AI tool registration and discovery
- Bidirectional MCP communication
- Advanced parent-child interactions
- Standards compliance required
- Building AI-powered applications

## 📝 Breaking Changes

1. **`sendPrompt()` return type**: Now returns `AIResponse` object instead of string
2. **Auto-connection**: Both architectures auto-connect by default
3. **Tool registration**: Uses official MCP schema format
4. **Import paths**: Some internal imports have changed
5. **Error handling**: Uses typed error classes instead of generic Error

## 🔮 Future Roadmap

- **Resource support**: MCP resource discovery and serving
- **Prompt templates**: MCP prompt template support  
- **Enhanced streaming**: Better streaming controls and progress
- **Tool composition**: Chain multiple tools together
- **Performance monitoring**: Built-in performance metrics

---

The refactor maintains backward compatibility through legacy exports while providing a much more robust and standards-compliant foundation for AI-powered iframe applications.