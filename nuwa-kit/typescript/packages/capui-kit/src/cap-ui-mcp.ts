import { PostMessageMCPTransport } from './mcp/transport/postmessage.js'
import { MCPServer } from './mcp/server.js'
import { ChildSDK } from './child/sdk.js'
import {
  ChildToolDefinition,
  ParentFunctions,
  AIResponse,
  MCPTransportError,
} from './mcp/types.js'

export interface CapUIOptions {
  // Parent connection options
  parentOrigin?: string
  allowedOrigins?: string[]
  timeout?: number
  debug?: boolean
  
  // Event handlers (backward compatibility)
  onReceiveMessage?(incomingMessage: string): string
  onError?(error: string): void
  onConnectionChange?(isConnected: boolean): void
  
  // MCP options
  serverInfo?: {
    name: string
    version: string
  }
}

/**
 * Modern CapUI class with MCP integration
 * 
 * Features:
 * - Hybrid architecture: MCP for child tools + direct SDK for parent functions
 * - Child iframe exposes tools to parent AI via MCP protocol
 * - Direct parent function calls (sendPrompt, sendMessage, getContext)
 * - Backward compatibility with existing API
 * - SEP-compliant postMessage transport
 */
export class CapUI implements ParentFunctions {
  private transport: PostMessageMCPTransport
  private mcpServer: MCPServer
  private childSDK: ChildSDK
  private options: CapUIOptions
  private isConnected = false

  constructor(options: CapUIOptions = {}) {
    this.options = options
    
    // Initialize transport with SEP compliance
    this.transport = new PostMessageMCPTransport({
      targetOrigin: options.parentOrigin || '*',
      allowedOrigins: options.allowedOrigins || ['*'],
      timeout: options.timeout || 30000,
      debug: options.debug || false,
      clientInfo: {
        name: options.serverInfo?.name || 'CapUI-Child',
        version: options.serverInfo?.version || '1.0.0',
        capabilities: ['tools', 'resources']
      }
    })
    
    // Initialize MCP server for exposing child tools
    this.mcpServer = new MCPServer({
      transport: this.transport,
      debug: options.debug || false,
      serverInfo: options.serverInfo
    })
    
    // Initialize child SDK for direct parent function calls
    this.childSDK = new ChildSDK({
      parentOrigin: options.parentOrigin || '*',
      timeout: options.timeout || 30000,
      debug: options.debug || false
    })
    
    // Initialize connection
    this.initConnection()
  }

  private async initConnection(): Promise<void> {
    try {
      // Establish MCP transport connection with parent
      await this.transport.establishConnection(window.parent)
      
      // Start MCP server
      await this.mcpServer.start()
      
      this.isConnected = true
      this.options.onConnectionChange?.(true)
      
      if (this.options.debug) {
        console.log('[CapUI] Connected successfully with MCP transport')
      }
      
    } catch (error) {
      console.error('Failed to establish MCP connection:', error)
      this.options.onError?.(
        error instanceof Error ? error.message : 'Connection failed'
      )
      this.options.onConnectionChange?.(false)
    }
  }

  // === Tool Registration API (MCP Server) ===
  
  /**
   * Register a tool that can be called by the parent AI
   */
  registerTool(tool: ChildToolDefinition): void {
    this.mcpServer.registerTool(tool)
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): void {
    this.mcpServer.unregisterTool(toolName)
  }

  /**
   * Register a resource (file, image, etc.)
   */
  registerResource(uri: string, content: any, mimeType?: string): void {
    this.mcpServer.registerResource(uri, content, mimeType)
  }

  /**
   * Get all registered tools
   */
  getRegisteredTools(): ChildToolDefinition[] {
    return this.mcpServer.getTools()
  }

  // === Parent Function Calls (Child SDK) ===

  /**
   * Send prompt to AI backend via parent
   */
  async sendPrompt(
    prompt: string,
    options?: {
      streaming?: boolean
      model?: string
      temperature?: number
    }
  ): Promise<AIResponse> {
    return this.childSDK.sendPrompt(prompt, options)
  }

  /**
   * Send message to parent for UI updates
   */
  async sendMessage(type: string, payload: any): Promise<void> {
    return this.childSDK.sendMessage(type, payload)
  }

  /**
   * Get context from parent application
   */
  async getContext(keys?: string[]): Promise<any> {
    return this.childSDK.getContext(keys)
  }

  // === Backward Compatibility API ===

  /**
   * @deprecated Use sendMessage instead
   */
  async sendToolCall(toolCall: string): Promise<string> {
    try {
      await this.sendMessage('tool_call', { toolCall })
      return 'success'
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Tool call failed')
    }
  }

  /**
   * @deprecated Use sendPrompt instead (returns AIResponse, not string)
   */
  async sendPromptLegacy(prompt: string): Promise<string> {
    try {
      const response = await this.sendPrompt(prompt)
      return response.content || ''
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Prompt failed')
    }
  }

  // === Connection Management ===

  /**
   * Check if connected to parent
   */
  get isConnectedToParent(): boolean {
    return this.isConnected && this.transport.connected && this.childSDK.isAvailable
  }

  /**
   * @deprecated Use isConnectedToParent instead
   */
  get isConnected_(): boolean {
    return this.isConnectedToParent
  }

  /**
   * Reconnect to parent if connection is lost
   */
  async reconnect(): Promise<void> {
    if (this.isConnectedToParent) {
      return
    }
    
    await this.initConnection()
  }

  /**
   * Disconnect from parent and clean up resources
   */
  disconnect(): void {
    this.transport.close()
    this.mcpServer.stop()
    this.childSDK.destroy()
    
    this.isConnected = false
    this.options.onConnectionChange?.(false)
  }

  /**
   * Get connection and server statistics
   */
  getStats(): {
    isConnected: boolean
    transport: {
      connected: boolean
      ready: boolean
    }
    server: {
      toolCount: number
      resourceCount: number
    }
    sdk: {
      isAvailable: boolean
      pendingCallCount: number
    }
  } {
    return {
      isConnected: this.isConnected,
      transport: {
        connected: this.transport.connected,
        ready: this.transport.ready
      },
      server: this.mcpServer.getStats(),
      sdk: {
        isAvailable: this.childSDK.isAvailable,
        pendingCallCount: this.childSDK.pendingCallCount
      }
    }
  }
}