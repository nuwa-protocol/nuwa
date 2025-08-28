import {
  MCPMessage,
  MCPResponse,
  MCPError,
  ChildToolDefinition,
  MCPToolCall,
  MCPToolResult,
  Transport,
  MCPTransportError,
} from '../mcp/types.js'

export interface MCPServerOptions {
  transport: Transport
  debug?: boolean
  serverInfo?: {
    name: string
    version: string
  }
}

/**
 * MCP Server implementation for child iframes
 * Exposes child tools to parent AI through standard MCP protocol
 * 
 * Features:
 * - Standard MCP server protocol implementation
 * - Tool registration and discovery
 * - Tool execution with proper error handling
 * - Resource serving capabilities
 */
export class MCPServer {
  private transport: Transport
  private debug: boolean
  private serverInfo: { name: string; version: string }
  private tools = new Map<string, ChildToolDefinition>()
  private resources = new Map<string, any>()
  
  private messageHandler = this.handleMessage.bind(this)

  constructor(options: MCPServerOptions) {
    this.transport = options.transport
    this.debug = options.debug || false
    this.serverInfo = options.serverInfo || {
      name: 'CapUI-MCP-Server',
      version: '1.0.0'
    }
    
    // Start listening for MCP messages
    this.transport.listen(this.messageHandler)
    
    this.log('MCP Server initialized', this.serverInfo)
  }

  /**
   * Register a tool that can be called by the parent AI
   */
  registerTool(tool: ChildToolDefinition): void {
    this.tools.set(tool.name, tool)
    this.log('Tool registered', { name: tool.name, description: tool.description })
    
    // Notify parent about new tool (if connected)
    this.notifyToolDiscovery()
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): void {
    if (this.tools.delete(toolName)) {
      this.log('Tool unregistered', { name: toolName })
      this.notifyToolDiscovery()
    }
  }

  /**
   * Register a resource (file, image, etc.)
   */
  registerResource(uri: string, content: any, mimeType?: string): void {
    this.resources.set(uri, { content, mimeType })
    this.log('Resource registered', { uri, mimeType })
  }

  /**
   * Get all registered tools
   */
  getTools(): ChildToolDefinition[] {
    return Array.from(this.tools.values())
  }

  private async handleMessage(message: MCPMessage): Promise<void> {
    this.log('Received MCP message', message)
    
    try {
      let response: MCPResponse
      
      switch (message.method) {
        case 'initialize':
          response = await this.handleInitialize(message)
          break
          
        case 'tools/list':
          response = await this.handleToolsList(message)
          break
          
        case 'tools/call':
          response = await this.handleToolCall(message)
          break
          
        case 'resources/list':
          response = await this.handleResourcesList(message)
          break
          
        case 'resources/read':
          response = await this.handleResourceRead(message)
          break
          
        default:
          response = this.createErrorResponse(
            message.id,
            -32601,
            `Method not found: ${message.method}`
          )
      }
      
      // Send response back through transport
      if (message.id) {
        await this.transport.send({
          jsonrpc: '2.0',
          id: message.id,
          method: 'response',
          params: response
        })
      }
      
    } catch (error) {
      this.log('Error handling message', error)
      
      if (message.id) {
        const errorResponse = this.createErrorResponse(
          message.id,
          -32603,
          error instanceof Error ? error.message : 'Internal error'
        )
        
        await this.transport.send({
          jsonrpc: '2.0',
          id: message.id,
          method: 'response',
          params: errorResponse
        })
      }
    }
  }

  private async handleInitialize(message: MCPMessage): Promise<MCPResponse> {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true }
        },
        serverInfo: this.serverInfo
      }
    }
  }

  private async handleToolsList(message: MCPMessage): Promise<MCPResponse> {
    const tools = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema
    }))
    
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: { tools }
    }
  }

  private async handleToolCall(message: MCPMessage): Promise<MCPResponse> {
    const { name, arguments: args } = message.params as MCPToolCall
    
    const tool = this.tools.get(name)
    if (!tool) {
      return this.createErrorResponse(
        message.id,
        -32602,
        `Tool not found: ${name}`
      )
    }
    
    try {
      this.log('Executing tool', { name, arguments: args })
      const result = await tool.handler(args)
      
      const mcpResult: MCPToolResult = {
        content: [
          {
            type: 'text',
            text: typeof result.data === 'string' ? result.data : JSON.stringify(result.data)
          }
        ],
        isError: !result.success
      }
      
      if (!result.success && result.error) {
        mcpResult.content.push({
          type: 'text',
          text: `Error: ${result.error}`
        })
      }
      
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: mcpResult
      }
      
    } catch (error) {
      return this.createErrorResponse(
        message.id,
        -32603,
        error instanceof Error ? error.message : 'Tool execution failed'
      )
    }
  }

  private async handleResourcesList(message: MCPMessage): Promise<MCPResponse> {
    const resources = Array.from(this.resources.entries()).map(([uri, resource]) => ({
      uri,
      name: uri.split('/').pop() || uri,
      mimeType: resource.mimeType || 'text/plain'
    }))
    
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: { resources }
    }
  }

  private async handleResourceRead(message: MCPMessage): Promise<MCPResponse> {
    const { uri } = message.params
    const resource = this.resources.get(uri)
    
    if (!resource) {
      return this.createErrorResponse(
        message.id,
        -32602,
        `Resource not found: ${uri}`
      )
    }
    
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        contents: [
          {
            uri,
            mimeType: resource.mimeType || 'text/plain',
            text: typeof resource.content === 'string' ? resource.content : JSON.stringify(resource.content)
          }
        ]
      }
    }
  }

  private createErrorResponse(id: string | number, code: number, message: string): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message }
    }
  }

  private async notifyToolDiscovery(): Promise<void> {
    try {
      // Send notification about tools change
      await this.transport.send({
        jsonrpc: '2.0',
        id: this.generateNotificationId(),
        method: 'notifications/tools/list_changed',
        params: {}
      })
    } catch (error) {
      this.log('Failed to notify tool discovery', error)
    }
  }

  private generateNotificationId(): string {
    return `server-notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[MCPServer] ${message}`, data)
    }
  }

  /**
   * Start the server (if transport supports it)
   */
  async start(): Promise<void> {
    this.log('MCP Server started')
    // Transport should already be listening
    // Send initial tool discovery notification
    this.notifyToolDiscovery()
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    this.transport.close()
    this.tools.clear()
    this.resources.clear()
    this.log('MCP Server stopped')
  }

  /**
   * Get server statistics
   */
  getStats(): {
    toolCount: number
    resourceCount: number
    serverInfo: { name: string; version: string }
  } {
    return {
      toolCount: this.tools.size,
      resourceCount: this.resources.size,
      serverInfo: this.serverInfo
    }
  }
}