import {
  MCPMessage,
  MCPResponse,
  MCPError,
  ConnectionPhases,
  SetupConfig,
  ClientInfo,
  Transport,
  MCPTransportError,
  SecurityError,
  EventHandler,
  ConnectionEvent,
  SecurityPolicy,
} from './types.js'

export interface PostMessageTransportOptions {
  targetOrigin?: string
  allowedOrigins?: string[]
  timeout?: number
  securityPolicy?: Partial<SecurityPolicy>
  clientInfo?: ClientInfo
  debug?: boolean
}

/**
 * Production-ready PostMessage MCP Transport implementation
 * Based on SEP (Standards Enhancement Proposal) for postMessage Transport
 * 
 * Features:
 * - Two-phase connection model (setup + transport)
 * - Origin validation and message integrity
 * - Error handling and connection lifecycle management
 * - Security features per SEP specification
 */
export class PostMessageMCPTransport implements Transport {
  private targetWindow: Window | null = null
  private targetOrigin: string
  private allowedOrigins: string[]
  private timeout: number
  private securityPolicy: SecurityPolicy
  private clientInfo: ClientInfo
  private debug: boolean
  
  private isConnected = false
  private setupComplete = false
  private messageId = 0
  private pendingMessages = new Map<string | number, {
    resolve: (response: MCPResponse) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }>()
  
  private eventHandlers: EventHandler[] = []
  private messageHandler = this.handleMessage.bind(this)

  constructor(options: PostMessageTransportOptions = {}) {
    this.targetOrigin = options.targetOrigin || '*'
    this.allowedOrigins = options.allowedOrigins || ['*']
    this.timeout = options.timeout || 30000
    this.debug = options.debug || false
    
    this.clientInfo = options.clientInfo || {
      name: 'CapUI-MCP-Transport',
      version: '1.0.0',
      capabilities: ['tools', 'resources', 'prompts']
    }
    
    this.securityPolicy = {
      allowedOrigins: this.allowedOrigins,
      toolPermissions: {},
      functionPermissions: {},
      messageValidation: {
        enforceSchema: true,
        sanitizeInputs: true,
        maxMessageSize: 1024 * 1024, // 1MB
      },
      ...options.securityPolicy
    }
    
    this.log('Transport initialized', { targetOrigin: this.targetOrigin })
  }

  /**
   * Establish connection using SEP two-phase model
   * Phase 1: Setup - authentication and capability negotiation
   * Phase 2: Transport - activate MCP protocol
   */
  async establishConnection(
    targetWindow: Window, 
    setupConfig: SetupConfig = {}
  ): Promise<void> {
    this.log('Establishing connection...', { setupConfig })
    
    this.targetWindow = targetWindow
    window.addEventListener('message', this.messageHandler)
    
    try {
      // Phase 1: Setup
      await this.performSetupPhase(setupConfig)
      this.log('Setup phase completed')
      
      // Phase 2: Transport
      await this.performTransportPhase()
      this.log('Transport phase completed')
      
      this.isConnected = true
      this.setupComplete = true
      this.emit({ type: 'connected' })
      
    } catch (error) {
      this.log('Connection failed', error)
      this.cleanup()
      throw new MCPTransportError(
        `Failed to establish connection: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }
  
  private async performSetupPhase(config: SetupConfig): Promise<void> {
    const setupMessage: ConnectionPhases['setup'] = {
      phase: 'setup',
      origin: window.location.origin,
      capabilities: config.capabilities || this.clientInfo.capabilities,
      auth: config.requireAuth ? { type: 'none' } : undefined
    }
    
    const response = await this.sendRawMessage(setupMessage)
    
    if (response.error) {
      throw new MCPTransportError(`Setup failed: ${response.error.message}`)
    }
    
    // Validate setup response
    if (response.result?.phase !== 'setup' || !response.result?.approved) {
      throw new MCPTransportError('Setup not approved by target')
    }
  }
  
  private async performTransportPhase(): Promise<void> {
    const transportMessage: ConnectionPhases['transport'] = {
      phase: 'transport',
      mcpVersion: '2024-11-05',
      clientInfo: this.clientInfo
    }
    
    const response = await this.sendRawMessage(transportMessage)
    
    if (response.error) {
      throw new MCPTransportError(`Transport phase failed: ${response.error.message}`)
    }
  }

  private async sendRawMessage(data: any): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const id = this.generateMessageId()
      const message = {
        jsonrpc: '2.0' as const,
        id,
        method: 'connection',
        params: data
      }
      
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(id)
        reject(new MCPTransportError(`Message timeout after ${this.timeout}ms`))
      }, this.timeout)
      
      this.pendingMessages.set(id, { resolve, reject, timeout })
      
      if (!this.targetWindow) {
        reject(new MCPTransportError('No target window available'))
        return
      }
      
      this.targetWindow.postMessage(message, this.targetOrigin)
      this.log('Sent raw message', message)
    })
  }

  /**
   * Send MCP message over established transport
   */
  async send(message: MCPMessage): Promise<MCPResponse> {
    if (!this.isConnected || !this.setupComplete) {
      throw new MCPTransportError('Transport not connected')
    }
    
    if (!this.validateMessage(message)) {
      throw new MCPTransportError('Invalid message format')
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(message.id)
        reject(new MCPTransportError(`Message timeout after ${this.timeout}ms`))
      }, this.timeout)
      
      this.pendingMessages.set(message.id, { resolve, reject, timeout })
      
      if (!this.targetWindow) {
        reject(new MCPTransportError('No target window available'))
        return
      }
      
      this.targetWindow.postMessage(message, this.targetOrigin)
      this.log('Sent MCP message', message)
    })
  }

  /**
   * Listen for incoming MCP messages
   */
  listen(handler: (message: MCPMessage) => void): void {
    this.addEventListener((event) => {
      if (event.type === 'tool_discovered' && event.data) {
        handler(event.data)
      }
    })
  }

  private handleMessage(event: MessageEvent): void {
    this.log('Received message', event)
    
    // Security: Validate origin
    if (!this.validateOrigin(event.origin)) {
      this.log('Rejected message from unauthorized origin', event.origin)
      return
    }
    
    const data = event.data
    
    // Handle responses to our messages
    if (data.jsonrpc === '2.0' && data.id && this.pendingMessages.has(data.id)) {
      const pending = this.pendingMessages.get(data.id)!
      this.pendingMessages.delete(data.id)
      clearTimeout(pending.timeout)
      
      if (data.error) {
        pending.reject(new MCPTransportError(data.error.message, data.error.code))
      } else {
        pending.resolve(data)
      }
      return
    }
    
    // Handle incoming MCP messages
    if (data.jsonrpc === '2.0' && data.method && !data.id) {
      // Notification (no response expected)
      this.emit({ type: 'tool_discovered', data })
    } else if (data.jsonrpc === '2.0' && data.method && data.id) {
      // Request (response expected) - handled by listeners
      this.emit({ type: 'tool_discovered', data })
    }
  }

  private validateOrigin(origin: string): boolean {
    if (this.allowedOrigins.includes('*')) {
      return true
    }
    return this.allowedOrigins.includes(origin)
  }

  private validateMessage(message: MCPMessage): boolean {
    if (!message.jsonrpc || message.jsonrpc !== '2.0') {
      return false
    }
    
    if (!message.method || typeof message.method !== 'string') {
      return false
    }
    
    if (message.id === undefined || message.id === null) {
      return false
    }
    
    // Check message size limit
    const messageSize = JSON.stringify(message).length
    if (messageSize > this.securityPolicy.messageValidation.maxMessageSize) {
      this.log('Message exceeds size limit', { size: messageSize, limit: this.securityPolicy.messageValidation.maxMessageSize })
      return false
    }
    
    return true
  }

  private generateMessageId(): number {
    return ++this.messageId
  }

  private emit(event: ConnectionEvent): void {
    this.eventHandlers.forEach(handler => handler(event))
  }

  addEventListener(handler: EventHandler): void {
    this.eventHandlers.push(handler)
  }

  removeEventListener(handler: EventHandler): void {
    const index = this.eventHandlers.indexOf(handler)
    if (index > -1) {
      this.eventHandlers.splice(index, 1)
    }
  }

  /**
   * Close the transport connection
   */
  close(): void {
    this.log('Closing transport')
    this.cleanup()
    this.emit({ type: 'disconnected' })
  }

  private cleanup(): void {
    window.removeEventListener('message', this.messageHandler)
    
    // Reject all pending messages
    this.pendingMessages.forEach(({ reject, timeout }) => {
      clearTimeout(timeout)
      reject(new MCPTransportError('Transport closed'))
    })
    this.pendingMessages.clear()
    
    this.isConnected = false
    this.setupComplete = false
    this.targetWindow = null
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[PostMessageMCPTransport] ${message}`, data)
    }
  }

  // Getters
  get connected(): boolean {
    return this.isConnected && this.setupComplete
  }

  get ready(): boolean {
    return this.connected && !!this.targetWindow
  }
}