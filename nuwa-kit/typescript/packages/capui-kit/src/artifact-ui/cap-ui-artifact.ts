import { MCPServerWrapper, type ToolDefinition } from './mcp-server-wrapper.js'
import { PostMessageMCPTransport } from './mcp-postmessage-transport.js'
import type { 
  ParentFunctions, 
  AIResponse, 
  PromptOptions, 
  StreamingPromptOptions, 
  ChildConfig 
} from '../shared/parent-functions.js'
import { CapUIError, TransportError } from '../shared/types.js'

export interface CapUIArtifactOptions extends ChildConfig {
  autoConnect?: boolean
  serverInfo?: {
    name: string
    version: string
  }
}

/**
 * CapUI Artifact - MCP-based child application
 * Provides both tool registration (MCP Server) and parent function calls
 * Uses official @modelcontextprotocol SDK with custom PostMessage transport
 */
export class CapUIArtifact implements ParentFunctions {
  private mcpServer: MCPServerWrapper
  private transport: PostMessageMCPTransport
  private options: CapUIArtifactOptions
  private isConnected = false

  constructor(options: CapUIArtifactOptions = {}) {
    this.options = {
      autoConnect: true,
      debug: false,
      ...options
    }

    // Create MCP server for tool registration
    this.mcpServer = new MCPServerWrapper({
      targetOrigin: this.options.parentOrigin,
      debug: this.options.debug,
      serverInfo: this.options.serverInfo
    })

    // Create separate transport for parent function calls
    this.transport = new PostMessageMCPTransport({
      targetOrigin: this.options.parentOrigin,
      debug: this.options.debug
    })

    if (this.options.autoConnect) {
      this.connect().catch(error => {
        this.log('Auto-connect failed', error)
      })
    }

    this.log('CapUIArtifact initialized', this.options)
  }

  /**
   * Connect to parent window
   */
  async connect(): Promise<void> {
    try {
      this.log('Connecting to parent')

      // Start MCP server for tool registration
      await this.mcpServer.start(window.parent)
      
      // Connect transport for parent function calls
      await this.transport.connect(window.parent)

      this.isConnected = true
      this.log('Connected to parent successfully')

    } catch (error) {
      this.log('Failed to connect to parent', error)
      throw new TransportError(`Connection failed: ${error}`)
    }
  }

  // === Tool Registration (MCP Server) ===

  /**
   * Register a tool that can be called by the AI
   */
  registerTool(tool: ToolDefinition): void {
    this.mcpServer.registerTool(tool)
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): void {
    this.mcpServer.unregisterTool(toolName)
  }

  /**
   * Get all registered tools
   */
  getRegisteredTools(): ToolDefinition[] {
    return this.mcpServer.getRegisteredTools()
  }

  /**
   * Check if a tool is registered
   */
  hasTool(toolName: string): boolean {
    return this.mcpServer.hasTool(toolName)
  }

  // === Parent Function Calls ===

  /**
   * Send prompt to AI backend via parent
   */
  async sendPrompt(prompt: string, options?: PromptOptions): Promise<AIResponse> {
    await this.ensureConnected()
    
    try {
      this.log('Sending prompt', { prompt: prompt.substring(0, 100) + '...', options })
      
      const response = await this.transport.request({
        jsonrpc: '2.0',
        id: this.generateId(),
        method: 'sendPrompt',
        params: { prompt, options }
      })

      if (response.error) {
        throw new CapUIError(`Send prompt failed: ${response.error.message}`)
      }

      return response.result as AIResponse
    } catch (error) {
      this.log('Send prompt failed', error)
      throw error
    }
  }

  /**
   * Send streaming prompt to AI backend via parent
   */
  async sendPromptStreaming(prompt: string, options: StreamingPromptOptions): Promise<string> {
    await this.ensureConnected()
    
    try {
      this.log('Sending streaming prompt', { 
        prompt: prompt.substring(0, 100) + '...', 
        options: { ...options, onChunk: undefined } // Don't log callbacks
      })
      
      const response = await this.transport.request({
        jsonrpc: '2.0',
        id: this.generateId(),
        method: 'sendPromptStreaming',
        params: { prompt, options }
      })

      if (response.error) {
        throw new CapUIError(`Send streaming prompt failed: ${response.error.message}`)
      }

      return response.result as string
    } catch (error) {
      this.log('Send streaming prompt failed', error)
      throw error
    }
  }

  /**
   * Send message to parent
   */
  async sendMessage(type: string, payload: any): Promise<void> {
    await this.ensureConnected()
    
    try {
      this.log('Sending message', { type, payload })
      
      const response = await this.transport.request({
        jsonrpc: '2.0',
        id: this.generateId(),
        method: 'sendMessage',
        params: { type, payload }
      })

      if (response.error) {
        throw new CapUIError(`Send message failed: ${response.error.message}`)
      }
    } catch (error) {
      this.log('Send message failed', error)
      throw error
    }
  }

  /**
   * Get context from parent
   */
  async getContext(keys?: string[]): Promise<any> {
    await this.ensureConnected()
    
    try {
      this.log('Getting context', { keys })
      
      const response = await this.transport.request({
        jsonrpc: '2.0',
        id: this.generateId(),
        method: 'getContext',
        params: { keys }
      })

      if (response.error) {
        throw new CapUIError(`Get context failed: ${response.error.message}`)
      }

      return response.result
    } catch (error) {
      this.log('Get context failed', error)
      throw error
    }
  }

  /**
   * Set iframe height
   */
  async setHeight(height: string | number): Promise<void> {
    await this.ensureConnected()
    
    try {
      this.log('Setting height', { height })
      
      const response = await this.transport.request({
        jsonrpc: '2.0',
        id: this.generateId(),
        method: 'setHeight',
        params: { height }
      })

      if (response.error) {
        throw new CapUIError(`Set height failed: ${response.error.message}`)
      }
    } catch (error) {
      this.log('Set height failed', error)
      throw error
    }
  }

  /**
   * Show loading state in parent
   */
  async showLoading(message?: string): Promise<void> {
    await this.ensureConnected()
    
    try {
      this.log('Showing loading', { message })
      
      const response = await this.transport.request({
        jsonrpc: '2.0',
        id: this.generateId(),
        method: 'showLoading',
        params: { message }
      })

      if (response.error) {
        throw new CapUIError(`Show loading failed: ${response.error.message}`)
      }
    } catch (error) {
      this.log('Show loading failed', error)
      throw error
    }
  }

  /**
   * Hide loading state in parent
   */
  async hideLoading(): Promise<void> {
    await this.ensureConnected()
    
    try {
      this.log('Hiding loading')
      
      const response = await this.transport.request({
        jsonrpc: '2.0',
        id: this.generateId(),
        method: 'hideLoading',
        params: {}
      })

      if (response.error) {
        throw new CapUIError(`Hide loading failed: ${response.error.message}`)
      }
    } catch (error) {
      this.log('Hide loading failed', error)
      throw error
    }
  }

  // === Connection Management ===

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect()
    }
  }

  /**
   * Check if connected to parent
   */
  get connected(): boolean {
    return this.isConnected && this.mcpServer.connected && this.transport.connected
  }

  /**
   * Reconnect to parent
   */
  async reconnect(): Promise<void> {
    await this.disconnect()
    await this.connect()
  }

  /**
   * Disconnect from parent
   */
  async disconnect(): Promise<void> {
    try {
      if (this.mcpServer) {
        await this.mcpServer.stop()
      }
      if (this.transport) {
        await this.transport.close()
      }

      this.isConnected = false
      this.log('Disconnected from parent')

    } catch (error) {
      this.log('Error during disconnect', error)
      throw error
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    isConnected: boolean
    mcpServer: {
      connected: boolean
      toolCount: number
    }
    transport: {
      connected: boolean
    }
  } {
    return {
      isConnected: this.isConnected,
      mcpServer: {
        connected: this.mcpServer.connected,
        toolCount: this.mcpServer.toolCount
      },
      transport: {
        connected: this.transport.connected
      }
    }
  }

  private generateId(): string {
    return `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private log(message: string, data?: any): void {
    if (this.options.debug) {
      console.log(`[CapUIArtifact] ${message}`, data)
    }
  }
}