# MCP Integration Plan for CapUI Kit (SEP-Optimized)

## Overview

This document outlines the plan to build a new MCP (Model Context Protocol) based parent-child window communication system leveraging the SEP postMessage Transport specification as foundation. This will enable:

- **Child iframe applications** to expose tools to parent AI clients through standardized MCP protocol
- **Child applications** to call parent predefined functions (sendPrompt, etc.) directly through simple SDK methods
- **Production-ready implementation** of the experimental SEP postMessage transport

## Key Optimizations from SEP Integration

### 1. Standards Alignment
- Leverages community-validated postMessage transport specification
- Future compatibility with official MCP ecosystem
- Contributes production implementation back to community

### 2. Simplified Architecture
- **Child iframe** = MCP Server + Direct SDK calls (exposes tools, calls parent functions directly)
- **Parent window** = MCP Client + Function Provider (calls child tools, handles parent function calls)
- **Hybrid communication** - MCP for child tools, direct postMessage for parent functions
- **Eliminates unnecessary MCP overhead** for hardcoded parent functions

### 3. Enhanced Security Model
- Two-phase connection model (setup + transport phases)
- Origin validation and message integrity from SEP specification
- Browser sandboxing and Content Security Policy integration

## Optimized Architecture (SEP-Based)

### Core Components

#### 1. PostMessage MCP Transport (Production Implementation)
```typescript
// Based on SEP postMessage Transport specification
class PostMessageMCPTransport {
  // Two-phase connection model
  async establishConnection(targetOrigin: string, setupConfig?: SetupConfig): Promise<void>
  
  // Production-ready security features
  validateOrigin(origin: string): boolean
  ensureMessageIntegrity(message: MCPMessage): boolean
  
  // Standard MCP transport interface
  send(message: MCPMessage): Promise<MCPResponse>
  listen(handler: (message: MCPMessage) => void): void
  close(): void
}
```

#### 2. Child Iframe: MCP Server + Direct Parent Calls
```typescript
class CapUIMCPServer {
  // Expose child tools to parent AI via MCP
  registerTool(tool: ChildToolDefinition): void
  handleToolCall(call: MCPToolCall): Promise<MCPToolResult>
}

class CapUISDK {
  // Direct calls to parent predefined functions (no MCP overhead)
  async sendPrompt(prompt: string, options?: PromptOptions): Promise<AIResponse>
  async sendMessage(type: string, payload: any): Promise<void>
  async getContext(keys?: string[]): Promise<any>
}
```

#### 3. Parent Window: MCP Client + Function Provider
```typescript
class CapUIMCPClient {
  // Discover and call child tools via MCP
  listChildTools(): Promise<ToolDefinition[]>
  callChildTool(toolName: string, params: any): Promise<any>
  
  // Route AI requests to appropriate child
  routeAIRequest(request: AIRequest): Promise<AIResponse>
}

class CapUIParent {
  // Handle direct function calls from child (no MCP setup needed)
  private handleParentFunctionCall(functionName: string, params: any): Promise<any>
  private sendPrompt(prompt: string, options?: PromptOptions): Promise<AIResponse>
  private sendMessage(type: string, payload: any): Promise<void>
  private getContext(keys?: string[]): Promise<any>
}
```

### Hybrid Communication Flow

```
AI Backend ↔ Parent (MCP Client + Function Handler) ↔ Child (MCP Server + SDK)
```

#### Setup & Discovery
1. **Setup Phase**: Establish secure postMessage connection with auth/config (SEP compliant)
2. **Transport Phase**: Activate MCP protocol for child tools
3. **Tool Discovery**: Parent discovers child's exposed MCP tools

#### Execution Flow
4. **AI → Child Tools**: AI calls child tools through parent MCP client
5. **Child → Parent Functions**: Child calls parent functions directly via SDK (sendPrompt, etc.)
6. **Resource Handling**: Child serves UI resources, parent handles AI responses

## Implementation Phases (SEP-Optimized)

### Phase 1: PostMessage Transport Foundation (Week 1-2)

#### Tasks:
1. **Implement Production PostMessage Transport**
   - SEP-compliant postMessage transport with security features
   - Two-phase connection model (setup + transport phases)  
   - Message integrity validation and origin checks
   - Error handling and connection lifecycle management

2. **Implement Bidirectional MCP Protocol**
   - Child iframe as MCP server exposing tools to parent
   - Parent window as MCP client + tool provider
   - Standard MCP message format and handshake
   - Tool discovery and registration mechanisms

3. **Implement Parent Function Handler**
   - Direct postMessage handler for `sendPrompt`, `sendMessage`, `getContext`
   - Simple function call validation (no MCP protocol overhead)
   - Secure execution with proper parameter validation

#### Deliverables:
- `src/mcp/transport/postmessage.ts` - Production postMessage transport
- `src/mcp/server.ts` - MCP server for child iframes
- `src/mcp/client.ts` - MCP client + tool provider for parent
- `src/parent/function-handler.ts` - Parent function call handler
- `src/child/sdk.ts` - Child SDK for direct parent function calls
- Updated `src/cap-ui.ts` with MCP integration

### Phase 2: Enhanced Tool System (Week 2-3)

#### Tasks:
1. **Enhanced Parent Function Handler**
   - Streaming responses for sendPrompt
   - Batch operations support
   - Context management and state sharing
   - Permission-based function access

2. **Child Tool Development Framework**
   - Easy tool registration API for child apps
   - Schema validation and type generation
   - Resource handling (UI components, files)
   - Built-in error handling and validation

3. **Connection Management**
   - Multiple child iframe support
   - Connection health monitoring
   - Automatic reconnection logic
   - Performance optimization

#### Deliverables:
- Enhanced parent function handler with streaming
- Child tool development framework  
- Child SDK with TypeScript support
- Connection management system
- Performance monitoring tools

### Phase 3: Developer Experience & Production Features (Week 3-4)

#### Tasks:
1. **TypeScript Integration**
   - Auto-generated types from tool schemas
   - IDE autocompletion for parent tools
   - Compile-time validation
   - Enhanced error messages

2. **Security & Validation**
   - Comprehensive origin validation
   - Rate limiting for tool calls
   - Input sanitization and validation
   - Security audit and testing

3. **Production Features**
   - Comprehensive error handling and recovery
   - Performance optimization and monitoring
   - Security validation and testing
   - Documentation and examples

#### Deliverables:
- TypeScript definitions and tooling
- Security validation layer
- Documentation and examples
- Performance benchmarks

## Technical Specifications (SEP-Based)

### Connection Phases (SEP-Compliant)
```typescript
// Two-phase connection model from SEP
interface ConnectionPhases {
  setup: {
    phase: 'setup'
    origin: string
    capabilities?: string[]
    auth?: AuthConfig
  }
  transport: {
    phase: 'transport'  
    mcpVersion: string
    clientInfo: ClientInfo
  }
}
```

### Parent Function Definitions
```typescript
// Direct function calls (no MCP protocol needed)
interface ParentFunctions {
  sendPrompt(prompt: string, options?: {
    streaming?: boolean
    model?: string
    temperature?: number
  }): Promise<AIResponse>
  
  sendMessage(type: string, payload: any): Promise<void>
  
  getContext(keys?: string[]): Promise<any>
}

// Child SDK interface
interface CapUISDK {
  // Direct parent function calls
  sendPrompt: ParentFunctions['sendPrompt']
  sendMessage: ParentFunctions['sendMessage']
  getContext: ParentFunctions['getContext']
  
  // MCP server for exposing child tools
  registerTool(tool: ChildToolDefinition): void
  handleToolCall(call: MCPToolCall): Promise<MCPToolResult>
}
```

### Security Model (SEP-Enhanced)
```typescript
interface SecurityPolicy {
  // Origin validation (SEP requirement)
  allowedOrigins: string[]
  
  // Child tool permissions (MCP)
  toolPermissions: {
    [toolName: string]: {
      origins: string[]
      rateLimits: RateLimit[]
    }
  }
  
  // Parent function permissions (direct calls)
  functionPermissions: {
    [functionName: string]: {
      origins: string[]
      rateLimits: RateLimit[]
      paramValidation: ValidationSchema
    }
  }
  
  // Message integrity validation
  messageValidation: {
    enforceSchema: boolean
    sanitizeInputs: boolean
    maxMessageSize: number
  }
}
```



## Success Metrics

### SEP Compliance
- Full compatibility with postMessage transport specification
- Two-phase connection model implementation  
- Security features: origin validation, message integrity, sandboxing
- Standards-compliant MCP protocol messages

### Technical Performance
- Connection establishment time < 500ms (including setup phase)
- Child tool call latency < 1s (via MCP)
- Parent function call latency < 100ms (direct calls)
- Zero message loss rate with proper error handling

### Developer Experience
- Simple child tool registration API (MCP)
- Direct SDK methods for parent functions (sendPrompt, etc.)
- Type-safe function calls and tool definitions
- Clear separation of concerns

### Production Readiness
- Battle-tested postMessage transport implementation
- Comprehensive error handling and recovery
- Security validation and origin checking
- Performance monitoring and optimization

## Risk Mitigation

### Security Risks
- **Risk**: Malicious iframe exploitation
- **Mitigation**: SEP security model, origin validation, permission system, browser sandboxing

### Performance Risks
- **Risk**: PostMessage overhead for high-frequency calls
- **Mitigation**: Direct function calls for parent functions, message batching for tools, streaming optimization


## Next Steps

1. **✅ Review optimized plan leveraging SEP foundation**
2. **🔄 Begin Phase 1: Production postMessage transport implementation**
3. **📋 Implement bidirectional MCP protocol (child server + parent client/tools)**
4. **🎯 Create demo showcasing parent tool consumption (sendPrompt)**
5. **✔️ Validate against SEP specification compliance**
6. **🤝 Plan contribution back to MCP community**

---

*This plan leverages the SEP postMessage Transport as foundation while creating a production-ready implementation for CapUI Kit. The hybrid approach uses MCP for child tools and direct SDK calls for parent functions, optimizing for both standards compliance and performance.*