import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { 
  Tool, 
  CallToolRequest, 
  CallToolResult,
  ListToolsRequest,
  ListToolsResult
} from '@modelcontextprotocol/sdk/types.js'
import { PostMessageMCPTransport } from './mcp-postmessage-transport.js'
import { TransportError } from '../shared/types.js'

export interface MCPClientWrapperOptions {
  targetWindow?: Window
  targetOrigin?: string
  allowedOrigins?: string[]
  timeout?: number
  debug?: boolean
  clientInfo?: {
    name: string
    version: string
  }
}

export interface DiscoveredTool extends Tool {
  // Additional metadata can be added here
}

export interface ToolCallRequest {
  toolName: string
  arguments: Record<string, any>
  requestId?: string
}

export interface ToolCallResponse {
  success: boolean
  content?: any
  error?: string
  requestId?: string
}

/**
 * Wrapper around official MCP Client with PostMessage transport
 * Provides easy-to-use interface for parent applications
 */
export class MCPClientWrapper {
  private client: Client
  private transport: PostMessageMCPTransport
  private tools = new Map<string, DiscoveredTool>()
  private isInitialized = false
  private debug: boolean

  constructor(options: MCPClientWrapperOptions = {}) {
    this.debug = options.debug || false

    // Create PostMessage transport
    this.transport = new PostMessageMCPTransport({
      targetWindow: options.targetWindow,
      targetOrigin: options.targetOrigin,
      allowedOrigins: options.allowedOrigins,
      timeout: options.timeout,
      debug: options.debug
    })

    // Create MCP client with our transport
    this.client = new Client({
      name: options.clientInfo?.name || 'CapUI-MCP-Client',
      version: options.clientInfo?.version || '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    })

    this.log('MCP Client wrapper initialized')
  }

  /**
   * Connect to child iframe and initialize MCP client
   */
  async connect(targetWindow?: Window): Promise<void> {
    try {
      // Connect transport
      await this.transport.connect(targetWindow)

      // Connect MCP client to transport
      await this.client.connect(this.transport)

      this.isInitialized = true
      this.log('MCP Client connected successfully')

      // Discover available tools
      await this.discoverTools()

    } catch (error) {
      this.log('Failed to connect MCP client', error)
      throw new TransportError(`Connection failed: ${error}`)
    }
  }

  /**
   * Discover available tools from child
   */
  async discoverTools(): Promise<DiscoveredTool[]> {
    if (!this.isInitialized) {
      throw new TransportError('Client not initialized')
    }

    try {
      this.log('Discovering tools')
      
      const request: ListToolsRequest = {
        method: 'tools/list',
        params: {}
      }

      const response = await this.client.request(request) as ListToolsResult
      const tools = response.tools || []

      // Update tools cache
      this.tools.clear()
      tools.forEach(tool => {
        this.tools.set(tool.name, tool as DiscoveredTool)
      })

      this.log('Tools discovered', { 
        count: tools.length, 
        tools: tools.map(t => t.name) 
      })

      return Array.from(this.tools.values())

    } catch (error) {
      this.log('Failed to discover tools', error)
      throw new TransportError(`Tool discovery failed: ${error}`)
    }
  }

  /**
   * Get list of available tools
   */
  getAvailableTools(): DiscoveredTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * Call a specific tool
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    if (!this.isInitialized) {
      throw new TransportError('Client not initialized')
    }

    const tool = this.tools.get(toolName)
    if (!tool) {
      throw new TransportError(`Tool not found: ${toolName}`)
    }

    try {
      this.log('Calling tool', { toolName, arguments: args })

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      }

      const response = await this.client.request(request) as CallToolResult

      // Process the result
      if (response.content) {
        // Extract content from MCP response format
        const textContent = response.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('')

        try {
          // Try to parse as JSON if possible
          return JSON.parse(textContent)
        } catch {
          // Return as string if not valid JSON
          return textContent
        }
      }

      return null

    } catch (error) {
      this.log('Tool call failed', { toolName, error })
      throw new TransportError(`Tool call failed: ${error}`)
    }
  }

  /**
   * Route AI request to appropriate tool
   */
  async routeToolRequest(request: ToolCallRequest): Promise<ToolCallResponse> {
    try {
      const result = await this.callTool(request.toolName, request.arguments)
      
      return {
        success: true,
        content: result,
        requestId: request.requestId
      }

    } catch (error) {
      this.log('Tool request routing failed', { request, error })
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: request.requestId
      }
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
   * Check if a tool exists
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName)
  }

  /**
   * Get tool definition
   */
  getTool(toolName: string): DiscoveredTool | undefined {
    return this.tools.get(toolName)
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close()
      }
      if (this.transport) {
        await this.transport.close()
      }

      this.tools.clear()
      this.isInitialized = false

      this.log('MCP Client closed')

    } catch (error) {
      this.log('Error closing MCP client', error)
      throw error
    }
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[MCPClientWrapper] ${message}`, data)
    }
  }

  // Getters
  get ready(): boolean {
    return this.isInitialized && this.transport.ready
  }

  get connected(): boolean {
    return this.transport.connected
  }

  get toolCount(): number {
    return this.tools.size
  }
}