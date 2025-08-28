import {
  MCPMessage,
  MCPResponse,
  ChildToolDefinition,
  MCPToolCall,
  MCPToolResult,
  Transport,
  MCPTransportError,
} from '../mcp/types.js'

export interface MCPClientOptions {
  transport: Transport
  debug?: boolean
  clientInfo?: {
    name: string
    version: string
  }
}

export interface DiscoveredTool {
  name: string
  description: string
  inputSchema: any
}

export interface AIRequest {
  toolName: string
  arguments: Record<string, any>
  requestId?: string
}

export interface AIResponse {
  success: boolean
  content?: any
  error?: string
  requestId?: string
}

/**
 * MCP Client implementation for parent window
 * Discovers and calls child tools via MCP protocol
 * Routes AI requests to appropriate child iframes
 * 
 * Features:
 * - Standard MCP client protocol implementation
 * - Tool discovery and caching
 * - AI request routing
 * - Connection management for multiple children
 */
export class MCPClient {
  private transport: Transport
  private debug: boolean
  private clientInfo: { name: string; version: string }
  private tools = new Map<string, DiscoveredTool>()
  private resources = new Map<string, any>()
  private messageId = 0
  private isInitialized = false
  
  private pendingRequests = new Map<string | number, {
    resolve: (response: MCPResponse) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }>()
  
  private messageHandler = this.handleMessage.bind(this)

  constructor(options: MCPClientOptions) {
    this.transport = options.transport
    this.debug = options.debug || false
    this.clientInfo = options.clientInfo || {
      name: 'CapUI-MCP-Client',
      version: '1.0.0'
    }
    
    // Listen for responses and notifications
    this.transport.listen(this.messageHandler)
    
    this.log('MCP Client initialized', this.clientInfo)
  }

  /**
   * Initialize the MCP client connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }
    
    this.log('Initializing MCP client')
    
    try {
      // Send initialize request
      const response = await this.sendRequest({
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {}
          },
          clientInfo: this.clientInfo
        }
      })
      
      if (response.error) {
        throw new MCPTransportError(`Initialization failed: ${response.error.message}`)
      }
      
      this.isInitialized = true
      this.log('MCP client initialized successfully', response.result)
      
      // Discover available tools
      await this.discoverTools()
      
    } catch (error) {
      this.log('Failed to initialize MCP client', error)
      throw error
    }
  }

  /**
   * Discover available tools from child
   */
  async discoverTools(): Promise<DiscoveredTool[]> {
    if (!this.isInitialized) {
      throw new MCPTransportError('Client not initialized')
    }
    
    this.log('Discovering tools')
    
    try {
      const response = await this.sendRequest({
        method: 'tools/list',
        params: {}
      })
      
      if (response.error) {
        throw new MCPTransportError(`Tool discovery failed: ${response.error.message}`)
      }
      
      const tools = response.result?.tools || []
      
      // Update tools cache
      this.tools.clear()
      tools.forEach((tool: DiscoveredTool) => {
        this.tools.set(tool.name, tool)
      })
      
      this.log('Tools discovered', { count: tools.length, tools: tools.map((t: any) => t.name) })
      return tools
      
    } catch (error) {
      this.log('Failed to discover tools', error)
      throw error
    }
  }

  /**
   * Get list of available tools
   */
  listChildTools(): DiscoveredTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * Call a specific child tool
   */
  async callChildTool(toolName: string, params: any): Promise<any> {
    if (!this.isInitialized) {
      throw new MCPTransportError('Client not initialized')
    }
    
    const tool = this.tools.get(toolName)
    if (!tool) {
      throw new MCPTransportError(`Tool not found: ${toolName}`)
    }
    
    this.log('Calling child tool', { toolName, params })
    
    try {
      const response = await this.sendRequest({
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: params
        }
      })
      
      if (response.error) {
        throw new MCPTransportError(`Tool call failed: ${response.error.message}`)
      }
      
      const result = response.result as MCPToolResult
      
      if (result.isError) {
        const errorText = result.content.find(c => c.text?.startsWith('Error:'))?.text || 'Tool execution failed'
        throw new Error(errorText)
      }
      
      // Extract result content
      const resultContent = result.content.find(c => c.text && !c.text.startsWith('Error:'))?.text
      
      try {
        // Try to parse as JSON, fall back to raw text
        return resultContent ? JSON.parse(resultContent) : null
      } catch {
        return resultContent
      }
      
    } catch (error) {
      this.log('Tool call failed', { toolName, error })
      throw error
    }
  }

  /**
   * Route AI request to appropriate child tool
   */
  async routeAIRequest(request: AIRequest): Promise<AIResponse> {
    this.log('Routing AI request', request)
    
    try {
      const result = await this.callChildTool(request.toolName, request.arguments)
      
      return {
        success: true,
        content: result,
        requestId: request.requestId
      }
      
    } catch (error) {
      this.log('AI request failed', { request, error })
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: request.requestId
      }
    }
  }

  /**
   * Discover and list available resources
   */
  async discoverResources(): Promise<any[]> {
    if (!this.isInitialized) {
      throw new MCPTransportError('Client not initialized')
    }
    
    try {
      const response = await this.sendRequest({
        method: 'resources/list',
        params: {}
      })
      
      if (response.error) {
        throw new MCPTransportError(`Resource discovery failed: ${response.error.message}`)
      }
      
      const resources = response.result?.resources || []
      
      // Update resources cache
      this.resources.clear()
      resources.forEach((resource: any) => {
        this.resources.set(resource.uri, resource)
      })
      
      this.log('Resources discovered', { count: resources.length })
      return resources
      
    } catch (error) {
      this.log('Failed to discover resources', error)
      throw error
    }
  }

  /**
   * Read a specific resource
   */
  async readResource(uri: string): Promise<any> {
    if (!this.isInitialized) {
      throw new MCPTransportError('Client not initialized')
    }
    
    try {
      const response = await this.sendRequest({
        method: 'resources/read',
        params: { uri }
      })
      
      if (response.error) {
        throw new MCPTransportError(`Resource read failed: ${response.error.message}`)
      }
      
      return response.result
      
    } catch (error) {
      this.log('Failed to read resource', { uri, error })
      throw error
    }
  }

  private async sendRequest(request: Omit<MCPMessage, 'jsonrpc' | 'id'>): Promise<MCPResponse> {
    const id = this.generateMessageId()
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      ...request
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new MCPTransportError('Request timeout'))
      }, 30000) // 30 second timeout
      
      this.pendingRequests.set(id, { resolve, reject, timeout })
      
      this.transport.send(message).catch(error => {
        this.pendingRequests.delete(id)
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  private handleMessage(message: MCPMessage): void {
    this.log('Received MCP message', message)
    
    // Handle responses to our requests
    if (message.method === 'response' && message.params && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!
      this.pendingRequests.delete(message.id)
      clearTimeout(pending.timeout)
      
      pending.resolve(message.params as MCPResponse)
      return
    }
    
    // Handle notifications
    if (message.method === 'notifications/tools/list_changed') {
      this.log('Tools changed notification received')
      // Refresh tool list
      this.discoverTools().catch(error => {
        this.log('Failed to refresh tools after notification', error)
      })
    }
  }

  private generateMessageId(): number {
    return ++this.messageId
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[MCPClient] ${message}`, data)
    }
  }

  /**
   * Close the client connection
   */
  async close(): Promise<void> {
    this.transport.close()
    
    // Reject all pending requests
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout)
      reject(new MCPTransportError('Client closed'))
    })
    this.pendingRequests.clear()
    
    this.tools.clear()
    this.resources.clear()
    this.isInitialized = false
    
    this.log('MCP Client closed')
  }

  /**
   * Check if client is ready to use
   */
  get ready(): boolean {
    return this.isInitialized && this.transport.ready
  }

  /**
   * Get client statistics
   */
  getStats(): {
    isInitialized: boolean
    toolCount: number
    resourceCount: number
    pendingRequests: number
  } {
    return {
      isInitialized: this.isInitialized,
      toolCount: this.tools.size,
      resourceCount: this.resources.size,
      pendingRequests: this.pendingRequests.size
    }
  }
}