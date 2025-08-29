import { MCPClientWrapper, type ToolCallRequest, type ToolCallResponse } from './mcp-client-wrapper.js'
import type { 
  ParentHandler, 
  ParentConfig,
  AIResponse,
  PromptOptions,
  StreamingPromptOptions
} from '../shared/parent-functions.js'
import { CapUIError, TransportError } from '../shared/types.js'

export interface CapUIParentOptions extends ParentConfig, ParentHandler {
  // Additional parent-specific options
  clientInfo?: {
    name: string
    version: string
  }
}

export interface ChildConnection {
  id: string
  iframe: HTMLIFrameElement
  origin: string
  client: MCPClientWrapper
  tools: string[]
  connected: boolean
}

/**
 * CapUI Parent - MCP-based parent application
 * Manages multiple child iframes with MCP tool discovery and parent function handling
 * Uses official @modelcontextprotocol SDK with custom PostMessage transport
 */
export class CapUIParent {
  private options: CapUIParentOptions
  private connections = new Map<string, ChildConnection>()
  private messageHandler = this.handleMessage.bind(this)

  constructor(options: CapUIParentOptions = {}) {
    this.options = {
      allowedOrigins: ['*'],
      debug: false,
      timeout: 30000,
      ...options
    }

    // Start listening for parent function calls
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.messageHandler)
    }

    this.log('CapUIParent initialized', this.options)
  }

  /**
   * Connect to a child iframe
   */
  async connectToChild(iframe: HTMLIFrameElement, childOrigin: string = '*'): Promise<string> {
    if (!iframe.contentWindow) {
      throw new TransportError('Iframe content window not available')
    }

    const connectionId = this.generateConnectionId(iframe, childOrigin)

    if (this.connections.has(connectionId)) {
      throw new TransportError(`Already connected to child: ${connectionId}`)
    }

    try {
      this.log('Connecting to child', { connectionId, childOrigin })

      // Create MCP client for this child
      const client = new MCPClientWrapper({
        targetWindow: iframe.contentWindow,
        targetOrigin: childOrigin,
        allowedOrigins: this.options.allowedOrigins,
        timeout: this.options.timeout,
        debug: this.options.debug,
        clientInfo: this.options.clientInfo
      })

      // Connect to child
      await client.connect()

      // Discover available tools
      const tools = await client.discoverTools()
      const toolNames = tools.map(tool => tool.name)

      // Create connection record
      const connection: ChildConnection = {
        id: connectionId,
        iframe,
        origin: childOrigin,
        client,
        tools: toolNames,
        connected: true
      }

      this.connections.set(connectionId, connection)

      this.log('Connected to child successfully', {
        connectionId,
        toolCount: toolNames.length,
        tools: toolNames
      })

      // Notify handlers
      if (this.options.onChildConnected) {
        this.options.onChildConnected(childOrigin)
      }
      if (this.options.onToolDiscovered && tools.length > 0) {
        this.options.onToolDiscovered(tools)
      }

      return connectionId

    } catch (error) {
      this.log('Failed to connect to child', { connectionId, error })
      throw new TransportError(`Connection failed: ${error}`)
    }
  }

  /**
   * Disconnect from a child iframe
   */
  async disconnectFromChild(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId)
    if (!connection) {
      return // Already disconnected
    }

    try {
      await connection.client.close()
      this.connections.delete(connectionId)

      this.log('Disconnected from child', { connectionId })

      // Notify handlers
      if (this.options.onChildDisconnected) {
        this.options.onChildDisconnected(connection.origin)
      }

    } catch (error) {
      this.log('Error disconnecting from child', { connectionId, error })
      throw error
    }
  }

  /**
   * Get all connected children
   */
  getConnections(): ChildConnection[] {
    return Array.from(this.connections.values())
  }

  /**
   * Get all available tools from all children
   */
  getAllTools(): Array<{ connectionId: string; toolName: string; tool: any }> {
    const allTools: Array<{ connectionId: string; toolName: string; tool: any }> = []

    for (const [connectionId, connection] of this.connections) {
      const tools = connection.client.getAvailableTools()
      tools.forEach(tool => {
        allTools.push({
          connectionId,
          toolName: tool.name,
          tool
        })
      })
    }

    return allTools
  }

  /**
   * Call a tool from a specific child
   */
  async callTool(connectionId: string, toolName: string, args: Record<string, any>): Promise<any> {
    const connection = this.connections.get(connectionId)
    if (!connection) {
      throw new CapUIError(`Connection not found: ${connectionId}`)
    }

    try {
      return await connection.client.callTool(toolName, args)
    } catch (error) {
      this.log('Tool call failed', { connectionId, toolName, error })
      throw error
    }
  }

  /**
   * Route tool request to appropriate child (finds child automatically)
   */
  async routeToolRequest(request: ToolCallRequest): Promise<ToolCallResponse> {
    this.log('Routing tool request', request)

    // Find which child has this tool
    for (const [connectionId, connection] of this.connections) {
      if (connection.client.hasTool(request.toolName)) {
        try {
          return await connection.client.routeToolRequest(request)
        } catch (error) {
          this.log('Tool routing failed in connection', { connectionId, error })
          // Continue to next connection
        }
      }
    }

    // Tool not found in any child
    return {
      success: false,
      error: `Tool not found in any connected child: ${request.toolName}`,
      requestId: request.requestId
    }
  }

  /**
   * Batch tool requests
   */
  async batchToolRequests(requests: ToolCallRequest[]): Promise<ToolCallResponse[]> {
    const promises = requests.map(request => this.routeToolRequest(request))
    return Promise.all(promises)
  }

  /**
   * Handle incoming parent function calls from children
   */
  private async handleMessage(event: MessageEvent): Promise<void> {
    // Check if this is a JSON-RPC message for parent functions
    const data = event.data
    if (!this.isParentFunctionCall(data)) {
      return
    }

    // Validate origin
    if (!this.validateOrigin(event.origin)) {
      this.log('Rejected message from unauthorized origin', event.origin)
      return
    }

    try {
      this.log('Handling parent function call', { method: data.method, origin: event.origin })

      let result: any

      switch (data.method) {
        case 'sendPrompt':
          result = await this.handleSendPrompt(data.params.prompt, data.params.options, event.origin)
          break

        case 'sendPromptStreaming':
          result = await this.handleSendPromptStreaming(data.params.prompt, data.params.options, event.origin)
          break

        case 'sendMessage':
          await this.handleSendMessage(data.params.type, data.params.payload, event.origin)
          result = { success: true }
          break

        case 'getContext':
          result = await this.handleGetContext(data.params.keys, event.origin)
          break

        case 'setHeight':
          await this.handleSetHeight(data.params.height, event.origin)
          result = { success: true }
          break

        case 'showLoading':
          await this.handleShowLoading(data.params.message, event.origin)
          result = { success: true }
          break

        case 'hideLoading':
          await this.handleHideLoading(event.origin)
          result = { success: true }
          break

        default:
          throw new Error(`Unknown method: ${data.method}`)
      }

      // Send response
      const response = {
        jsonrpc: '2.0',
        id: data.id,
        result
      }

      ;(event.source as Window).postMessage(response, event.origin)
      this.log('Sent function response', { method: data.method, result })

    } catch (error) {
      this.log('Function call failed', { method: data.method, error })

      // Send error response
      const errorResponse = {
        jsonrpc: '2.0',
        id: data.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        }
      }

      ;(event.source as Window).postMessage(errorResponse, event.origin)
    }
  }

  private async handleSendPrompt(prompt: string, options?: PromptOptions, origin?: string): Promise<AIResponse> {
    if (this.options.onSendPrompt) {
      return await this.options.onSendPrompt(prompt, options, origin)
    }
    throw new Error('onSendPrompt handler not configured')
  }

  private async handleSendPromptStreaming(prompt: string, options: StreamingPromptOptions, origin?: string): Promise<string> {
    if (this.options.onSendPromptStreaming) {
      const streamId = this.generateStreamId()
      await this.options.onSendPromptStreaming(prompt, { ...options, streamId }, origin)
      return streamId
    }
    throw new Error('onSendPromptStreaming handler not configured')
  }

  private async handleSendMessage(type: string, payload: any, origin?: string): Promise<void> {
    if (this.options.onSendMessage) {
      await this.options.onSendMessage(type, payload, origin)
    }
    // No error if handler not configured - message is optional
  }

  private async handleGetContext(keys?: string[], origin?: string): Promise<any> {
    if (this.options.onGetContext) {
      return await this.options.onGetContext(keys, origin)
    }
    return {} // Return empty context if not configured
  }

  private async handleSetHeight(height: string | number, origin?: string): Promise<void> {
    if (this.options.onSetHeight) {
      await this.options.onSetHeight(height, origin)
    }
    // No error if handler not configured - height setting is optional
  }

  private async handleShowLoading(message?: string, origin?: string): Promise<void> {
    if (this.options.onShowLoading) {
      await this.options.onShowLoading(message, origin)
    }
    // No error if handler not configured - loading is optional
  }

  private async handleHideLoading(origin?: string): Promise<void> {
    if (this.options.onHideLoading) {
      await this.options.onHideLoading(origin)
    }
    // No error if handler not configured - loading is optional
  }

  private isParentFunctionCall(data: any): boolean {
    return (
      data &&
      data.jsonrpc === '2.0' &&
      data.method &&
      data.id !== undefined &&
      ['sendPrompt', 'sendPromptStreaming', 'sendMessage', 'getContext', 'setHeight', 'showLoading', 'hideLoading'].includes(data.method)
    )
  }

  private validateOrigin(origin: string): boolean {
    if (this.options.allowedOrigins?.includes('*')) {
      return true
    }
    return this.options.allowedOrigins?.includes(origin) || false
  }

  private generateConnectionId(iframe: HTMLIFrameElement, origin: string): string {
    const src = iframe.src || iframe.getAttribute('data-capui-id') || `iframe-${Date.now()}`
    return `${origin}:${src}`
  }

  private generateStreamId(): string {
    return `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Update parent function handlers
   */
  updateHandlers(handlers: Partial<ParentHandler>): void {
    Object.assign(this.options, handlers)
    this.log('Updated parent function handlers')
  }

  /**
   * Get parent statistics
   */
  getStats(): {
    connectedChildren: number
    totalTools: number
    connections: Array<{
      id: string
      origin: string
      toolCount: number
      connected: boolean
    }>
  } {
    const connections: Array<{
      id: string
      origin: string
      toolCount: number
      connected: boolean
    }> = []

    let totalTools = 0

    for (const connection of this.connections.values()) {
      totalTools += connection.tools.length
      connections.push({
        id: connection.id,
        origin: connection.origin,
        toolCount: connection.tools.length,
        connected: connection.connected
      })
    }

    return {
      connectedChildren: this.connections.size,
      totalTools,
      connections
    }
  }

  /**
   * Clean up and close all connections
   */
  async destroy(): Promise<void> {
    // Remove message listener
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageHandler)
    }

    // Close all connections
    const closePromises = Array.from(this.connections.keys()).map(id => 
      this.disconnectFromChild(id).catch(error => {
        this.log('Error closing connection', { id, error })
      })
    )

    await Promise.allSettled(closePromises)
    this.connections.clear()

    this.log('CapUIParent destroyed')
  }

  private log(message: string, data?: any): void {
    if (this.options.debug) {
      console.log(`[CapUIParent] ${message}`, data)
    }
  }
}