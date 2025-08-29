import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent,
  CallToolResult,
  ListToolsResult
} from '@modelcontextprotocol/sdk/types.js'
import { PostMessageMCPTransport } from './mcp-postmessage-transport.js'
import { TransportError } from '../shared/types.js'

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: string
    properties?: Record<string, any>
    required?: string[]
    [key: string]: any
  }
  handler: (args: Record<string, any>) => Promise<any>
}

export interface MCPServerWrapperOptions {
  targetWindow?: Window
  targetOrigin?: string
  allowedOrigins?: string[]
  timeout?: number
  debug?: boolean
  serverInfo?: {
    name: string
    version: string
  }
}

/**
 * Wrapper around official MCP Server with PostMessage transport
 * Provides easy-to-use interface for child applications
 */
export class MCPServerWrapper {
  private server: Server
  private transport: PostMessageMCPTransport
  private tools = new Map<string, ToolDefinition>()
  private isStarted = false
  private debug: boolean

  constructor(options: MCPServerWrapperOptions = {}) {
    this.debug = options.debug || false

    // Create PostMessage transport
    this.transport = new PostMessageMCPTransport({
      targetWindow: options.targetWindow,
      targetOrigin: options.targetOrigin,
      allowedOrigins: options.allowedOrigins,
      timeout: options.timeout,
      debug: options.debug
    })

    // Create MCP server
    this.server = new Server({
      name: options.serverInfo?.name || 'CapUI-MCP-Server',
      version: options.serverInfo?.version || '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    })

    this.setupServerHandlers()
    this.log('MCP Server wrapper initialized')
  }

  /**
   * Start the server and connect to parent
   */
  async start(targetWindow?: Window): Promise<void> {
    try {
      // Connect transport
      await this.transport.connect(targetWindow)

      // Connect server to transport
      await this.server.connect(this.transport)

      this.isStarted = true
      this.log('MCP Server started successfully')

    } catch (error) {
      this.log('Failed to start MCP server', error)
      throw new TransportError(`Server start failed: ${error}`)
    }
  }

  /**
   * Register a tool that can be called by the parent
   */
  registerTool(tool: ToolDefinition): void {
    // Validate tool definition
    if (!tool.name || !tool.description || !tool.handler) {
      throw new Error('Tool must have name, description, and handler')
    }

    if (typeof tool.handler !== 'function') {
      throw new Error('Tool handler must be a function')
    }

    // Store the tool
    this.tools.set(tool.name, tool)
    
    this.log('Tool registered', { 
      name: tool.name, 
      description: tool.description 
    })

    // If server is already started, we could send a notification about the new tool
    // but MCP doesn't have a standard way to do this dynamically
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): void {
    if (this.tools.delete(toolName)) {
      this.log('Tool unregistered', { name: toolName })
    }
  }

  /**
   * Get all registered tools
   */
  getRegisteredTools(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  /**
   * Check if a tool is registered
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName)
  }

  /**
   * Get a specific tool definition
   */
  getTool(toolName: string): ToolDefinition | undefined {
    return this.tools.get(toolName)
  }

  private setupServerHandlers(): void {
    // Handle tools/list requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.log('Handling tools/list request')

      const tools: Tool[] = Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))

      const response: ListToolsResult = {
        tools
      }

      this.log('Returning tools list', { count: tools.length })
      return response
    })

    // Handle tools/call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      
      this.log('Handling tool call', { name, arguments: args })

      const tool = this.tools.get(name)
      if (!tool) {
        throw new Error(`Tool not found: ${name}`)
      }

      try {
        // Execute the tool handler
        const result = await tool.handler(args || {})
        
        // Format the response according to MCP spec
        const content: TextContent[] = [{
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result)
        }]

        const response: CallToolResult = {
          content,
          isError: false
        }

        this.log('Tool call completed', { name, result })
        return response

      } catch (error) {
        this.log('Tool call failed', { name, error })
        
        // Return error in MCP format
        const content: TextContent[] = [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]

        const response: CallToolResult = {
          content,
          isError: true
        }

        return response
      }
    })
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    try {
      if (this.server) {
        await this.server.close()
      }
      if (this.transport) {
        await this.transport.close()
      }

      this.tools.clear()
      this.isStarted = false

      this.log('MCP Server stopped')

    } catch (error) {
      this.log('Error stopping MCP server', error)
      throw error
    }
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[MCPServerWrapper] ${message}`, data)
    }
  }

  // Getters
  get ready(): boolean {
    return this.isStarted && this.transport.ready
  }

  get connected(): boolean {
    return this.transport.connected
  }

  get toolCount(): number {
    return this.tools.size
  }

  get started(): boolean {
    return this.isStarted
  }
}