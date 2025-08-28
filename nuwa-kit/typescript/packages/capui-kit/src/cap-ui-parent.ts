import { PostMessageMCPTransport } from './mcp/transport/postmessage.js'
import { MCPClient, DiscoveredTool, AIRequest, AIResponse } from './mcp/client.js'
import { ParentFunctionHandler } from './parent/function-handler.js'
import {
  AIResponse as TypesAIResponse,
  SecurityPolicy,
} from './mcp/types.js'

export interface CapUIParentOptions {
  // Security options
  allowedOrigins?: string[]
  securityPolicy?: Partial<SecurityPolicy>
  debug?: boolean
  
  // Parent function implementations
  onSendPrompt?: (prompt: string, options?: any, origin?: string) => Promise<TypesAIResponse>
  onSendMessage?: (type: string, payload: any, origin?: string) => Promise<void>
  onGetContext?: (keys?: string[], origin?: string) => Promise<any>
  
  // Event handlers
  onChildConnected?: (childOrigin: string) => void
  onChildDisconnected?: (childOrigin: string) => void
  onToolDiscovered?: (tools: DiscoveredTool[]) => void
  onError?: (error: string) => void
}

/**
 * CapUI Parent class for managing MCP client connections and parent functions
 * 
 * Features:
 * - MCP client for calling child tools
 * - Parent function handler for direct child function calls
 * - Multi-child connection management
 * - AI request routing to appropriate children
 */
export class CapUIParent {
  private options: CapUIParentOptions
  private functionHandler: ParentFunctionHandler
  private childConnections = new Map<string, {
    transport: PostMessageMCPTransport
    client: MCPClient
    origin: string
    iframe: HTMLIFrameElement
  }>()
  
  constructor(options: CapUIParentOptions = {}) {
    this.options = options
    
    // Initialize parent function handler
    this.functionHandler = new ParentFunctionHandler({
      allowedOrigins: options.allowedOrigins || ['*'],
      securityPolicy: options.securityPolicy,
      debug: options.debug || false,
      onSendPrompt: options.onSendPrompt,
      onSendMessage: options.onSendMessage,
      onGetContext: options.onGetContext
    })
    
    // Start listening for function calls
    this.functionHandler.start()
    
    if (options.debug) {
      console.log('[CapUIParent] Initialized with function handler')
    }
  }

  /**
   * Connect to a child iframe and establish MCP client
   */
  async connectToChild(iframe: HTMLIFrameElement, childOrigin: string = '*'): Promise<void> {
    if (!iframe.contentWindow) {
      throw new Error('Iframe content window not available')
    }
    
    const connectionId = this.generateConnectionId(childOrigin, iframe)
    
    if (this.childConnections.has(connectionId)) {
      throw new Error(`Already connected to child: ${connectionId}`)
    }
    
    try {
      // Create transport for this child
      const transport = new PostMessageMCPTransport({
        targetOrigin: childOrigin,
        allowedOrigins: this.options.allowedOrigins || ['*'],
        timeout: 30000,
        debug: this.options.debug || false,
        clientInfo: {
          name: 'CapUI-Parent-Client',
          version: '1.0.0',
          capabilities: ['tools', 'resources']
        }
      })
      
      // Establish connection
      await transport.establishConnection(iframe.contentWindow)
      
      // Create MCP client
      const client = new MCPClient({
        transport,
        debug: this.options.debug || false,
        clientInfo: {
          name: 'CapUI-Parent-Client',
          version: '1.0.0'
        }
      })
      
      // Initialize client
      await client.initialize()
      
      // Store connection
      this.childConnections.set(connectionId, {
        transport,
        client,
        origin: childOrigin,
        iframe
      })
      
      this.options.onChildConnected?.(childOrigin)
      
      // Discover tools from child
      const tools = await client.discoverTools()
      this.options.onToolDiscovered?.(tools)
      
      if (this.options.debug) {
        console.log(`[CapUIParent] Connected to child: ${connectionId}`, { tools: tools.length })
      }
      
    } catch (error) {
      console.error(`Failed to connect to child ${connectionId}:`, error)
      this.options.onError?.(
        error instanceof Error ? error.message : 'Connection failed'
      )
      throw error
    }
  }

  /**
   * Disconnect from a specific child
   */
  async disconnectFromChild(iframe: HTMLIFrameElement, childOrigin: string = '*'): Promise<void> {
    const connectionId = this.generateConnectionId(childOrigin, iframe)
    const connection = this.childConnections.get(connectionId)
    
    if (!connection) {
      return // Already disconnected
    }
    
    try {
      await connection.client.close()
      this.childConnections.delete(connectionId)
      this.options.onChildDisconnected?.(childOrigin)
      
      if (this.options.debug) {
        console.log(`[CapUIParent] Disconnected from child: ${connectionId}`)
      }
      
    } catch (error) {
      console.error(`Failed to disconnect from child ${connectionId}:`, error)
    }
  }

  /**
   * Get all tools from all connected children
   */
  getAllChildTools(): { connectionId: string; tools: DiscoveredTool[] }[] {
    const allTools: { connectionId: string; tools: DiscoveredTool[] }[] = []
    
    for (const [connectionId, connection] of this.childConnections) {
      const tools = connection.client.listChildTools()
      allTools.push({ connectionId, tools })
    }
    
    return allTools
  }

  /**
   * Call a tool from a specific child
   */
  async callChildTool(
    connectionIdOrIframe: string | HTMLIFrameElement,
    toolName: string,
    params: any,
    childOrigin?: string
  ): Promise<any> {
    let connection: any
    
    if (typeof connectionIdOrIframe === 'string') {
      connection = this.childConnections.get(connectionIdOrIframe)
    } else {
      const connectionId = this.generateConnectionId(childOrigin || '*', connectionIdOrIframe)
      connection = this.childConnections.get(connectionId)
    }
    
    if (!connection) {
      throw new Error('Child connection not found')
    }
    
    return connection.client.callChildTool(toolName, params)
  }

  /**
   * Route AI request to appropriate child based on tool name
   * Searches all children for the tool
   */
  async routeAIRequest(request: AIRequest): Promise<AIResponse> {
    // Find which child has this tool
    for (const [connectionId, connection] of this.childConnections) {
      const tools = connection.client.listChildTools()
      const hasTool = tools.some(tool => tool.name === request.toolName)
      
      if (hasTool) {
        try {
          return await connection.client.routeAIRequest(request)
        } catch (error) {
          // Continue to next child if this one fails
          console.warn(`[CapUIParent] Tool call failed in ${connectionId}:`, error)
          continue
        }
      }
    }
    
    return {
      success: false,
      error: `Tool not found in any connected child: ${request.toolName}`,
      requestId: request.requestId
    }
  }

  /**
   * Batch AI requests to multiple children
   */
  async batchAIRequests(requests: AIRequest[]): Promise<AIResponse[]> {
    const promises = requests.map(request => this.routeAIRequest(request))
    return Promise.all(promises)
  }

  /**
   * Update parent function handlers
   */
  updateFunctionHandlers(handlers: {
    onSendPrompt?: (prompt: string, options?: any, origin?: string) => Promise<TypesAIResponse>
    onSendMessage?: (type: string, payload: any, origin?: string) => Promise<void>
    onGetContext?: (keys?: string[], origin?: string) => Promise<any>
  }): void {
    this.functionHandler.updateHandlers(handlers)
  }

  /**
   * Update security policy
   */
  updateSecurityPolicy(policy: Partial<SecurityPolicy>): void {
    this.functionHandler.updateSecurityPolicy(policy)
  }

  private generateConnectionId(origin: string, iframe: HTMLIFrameElement): string {
    // Use iframe src or a unique identifier
    const src = iframe.src || iframe.getAttribute('data-capui-id') || `iframe-${Date.now()}`
    return `${origin}:${src}`
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    connectedChildren: number
    totalTools: number
    connections: Array<{
      connectionId: string
      origin: string
      toolCount: number
      isReady: boolean
    }>
  } {
    const connections: Array<{
      connectionId: string
      origin: string
      toolCount: number
      isReady: boolean
    }> = []
    
    let totalTools = 0
    
    for (const [connectionId, connection] of this.childConnections) {
      const tools = connection.client.listChildTools()
      totalTools += tools.length
      
      connections.push({
        connectionId,
        origin: connection.origin,
        toolCount: tools.length,
        isReady: connection.client.ready
      })
    }
    
    return {
      connectedChildren: this.childConnections.size,
      totalTools,
      connections
    }
  }

  /**
   * Cleanup all connections and stop function handler
   */
  async destroy(): Promise<void> {
    // Disconnect all children
    const disconnectPromises = Array.from(this.childConnections.keys()).map(async connectionId => {
      const connection = this.childConnections.get(connectionId)!
      try {
        await connection.client.close()
      } catch (error) {
        console.warn(`Error closing connection ${connectionId}:`, error)
      }
    })
    
    await Promise.allSettled(disconnectPromises)
    this.childConnections.clear()
    
    // Stop function handler
    this.functionHandler.stop()
    
    if (this.options.debug) {
      console.log('[CapUIParent] Destroyed')
    }
  }
}