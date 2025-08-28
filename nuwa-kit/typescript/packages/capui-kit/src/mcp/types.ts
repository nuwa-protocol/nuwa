// Core MCP types based on the Model Context Protocol specification
export interface MCPMessage {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: any
}

export interface MCPResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: any
  error?: MCPError
}

export interface MCPError {
  code: number
  message: string
  data?: any
}

// SEP postMessage Transport types
export interface ConnectionPhases {
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

export interface AuthConfig {
  type: 'none' | 'token' | 'oauth'
  credentials?: any
}

export interface ClientInfo {
  name: string
  version: string
  capabilities: string[]
}

export interface SetupConfig {
  requireAuth?: boolean
  capabilities?: string[]
  timeout?: number
}

// Tool definitions
export interface ChildToolDefinition {
  name: string
  description: string
  schema: JSONSchema
  handler: (params: any) => Promise<ToolResult>
  permissions?: string[]
  streaming?: boolean
}

export interface ToolResult {
  success: boolean
  data?: any
  error?: string
  streaming?: boolean
}

export interface JSONSchema {
  type: string
  properties?: Record<string, any>
  required?: string[]
  [key: string]: any
}

// Parent function types (direct calls)
export interface ParentFunctions {
  sendPrompt(prompt: string, options?: {
    streaming?: boolean
    model?: string
    temperature?: number
  }): Promise<AIResponse>
  
  sendMessage(type: string, payload: any): Promise<void>
  
  getContext(keys?: string[]): Promise<any>
}

export interface AIResponse {
  content: string
  streaming?: boolean
  model?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// MCP Tool Call types
export interface MCPToolCall {
  name: string
  arguments: Record<string, any>
}

export interface MCPToolResult {
  content: any[]
  isError?: boolean
}

// Transport interface
export interface Transport {
  send(message: MCPMessage): Promise<MCPResponse>
  listen(handler: (message: MCPMessage) => void): void
  close(): void
}

// Security types
export interface SecurityPolicy {
  allowedOrigins: string[]
  toolPermissions: Record<string, {
    origins: string[]
    rateLimits: RateLimit[]
  }>
  functionPermissions: Record<string, {
    origins: string[]
    rateLimits: RateLimit[]
    paramValidation: ValidationSchema
  }>
  messageValidation: {
    enforceSchema: boolean
    sanitizeInputs: boolean
    maxMessageSize: number
  }
}

export interface RateLimit {
  windowMs: number
  maxRequests: number
}

export interface ValidationSchema {
  type: string
  properties?: Record<string, any>
  required?: string[]
}

// Error types
export class MCPTransportError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
    this.name = 'MCPTransportError'
  }
}

export class SecurityError extends Error {
  constructor(message: string, public origin?: string) {
    super(message)
    this.name = 'SecurityError'
  }
}

// Event types
export interface ConnectionEvent {
  type: 'connected' | 'disconnected' | 'error' | 'tool_discovered'
  data?: any
}

export type EventHandler = (event: ConnectionEvent) => void