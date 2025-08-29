import { 
  Transport, 
  JSONRPCRequest, 
  JSONRPCResponse, 
  JSONRPCError 
} from '@modelcontextprotocol/sdk/types.js'
import { TransportError, SecurityError, EventHandler, ConnectionEvent } from '../shared/types.js'

export interface PostMessageMCPTransportOptions {
  targetWindow?: Window
  targetOrigin?: string
  allowedOrigins?: string[]
  timeout?: number
  debug?: boolean
  securityPolicy?: {
    enforceOriginValidation?: boolean
    maxMessageSize?: number
    rateLimits?: {
      windowMs: number
      maxRequests: number
    }[]
  }
}

/**
 * PostMessage transport implementation for official MCP SDK
 * Provides secure iframe communication following MCP transport interface
 */
export class PostMessageMCPTransport implements Transport {
  private targetWindow: Window | null = null
  private targetOrigin: string
  private allowedOrigins: string[]
  private timeout: number
  private debug: boolean
  private securityPolicy: NonNullable<PostMessageMCPTransportOptions['securityPolicy']>

  private isConnected = false
  private messageId = 0
  private pendingRequests = new Map<string | number, {
    resolve: (response: JSONRPCResponse) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }>()

  private eventHandlers: EventHandler[] = []
  private messageHandler = this.handleMessage.bind(this)
  private rateLimiters = new Map<string, { count: number, resetTime: number }>()

  constructor(options: PostMessageMCPTransportOptions = {}) {
    this.targetWindow = options.targetWindow || null
    this.targetOrigin = options.targetOrigin || '*'
    this.allowedOrigins = options.allowedOrigins || ['*']
    this.timeout = options.timeout || 30000
    this.debug = options.debug || false

    this.securityPolicy = {
      enforceOriginValidation: true,
      maxMessageSize: 1024 * 1024, // 1MB
      rateLimits: [{ windowMs: 60000, maxRequests: 100 }],
      ...options.securityPolicy
    }

    this.log('PostMessage MCP Transport initialized', {
      targetOrigin: this.targetOrigin,
      allowedOrigins: this.allowedOrigins
    })
  }

  /**
   * Connect to the target window
   */
  async connect(targetWindow?: Window): Promise<void> {
    if (targetWindow) {
      this.targetWindow = targetWindow
    }

    if (!this.targetWindow) {
      if (typeof window !== 'undefined') {
        // If we're in a child iframe, connect to parent
        this.targetWindow = window.parent
      } else {
        throw new TransportError('No target window available')
      }
    }

    // Start listening for messages
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.messageHandler)
    }

    this.isConnected = true
    this.emit({ type: 'connected' })
    this.log('Connected to target window')
  }

  /**
   * Send a JSON-RPC request over PostMessage
   */
  async request(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    if (!this.isConnected || !this.targetWindow) {
      throw new TransportError('Transport not connected')
    }

    // Validate message size
    const messageSize = JSON.stringify(request).length
    if (messageSize > this.securityPolicy.maxMessageSize!) {
      throw new SecurityError(`Message size ${messageSize} exceeds limit ${this.securityPolicy.maxMessageSize}`)
    }

    // Check rate limits
    this.checkRateLimit()

    return new Promise((resolve, reject) => {
      const requestId = request.id || this.generateMessageId()
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new TransportError(`Request timeout after ${this.timeout}ms`))
      }, this.timeout)

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutId
      })

      // Ensure request has an ID
      const requestWithId = { ...request, id: requestId }

      try {
        this.targetWindow!.postMessage(requestWithId, this.targetOrigin)
        this.log('Sent MCP request', requestWithId)
      } catch (error) {
        this.pendingRequests.delete(requestId)
        clearTimeout(timeoutId)
        reject(new TransportError(`Failed to send message: ${error}`))
      }
    })
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  async notify(notification: JSONRPCRequest): Promise<void> {
    if (!this.isConnected || !this.targetWindow) {
      throw new TransportError('Transport not connected')
    }

    // Validate message size
    const messageSize = JSON.stringify(notification).length
    if (messageSize > this.securityPolicy.maxMessageSize!) {
      throw new SecurityError(`Message size ${messageSize} exceeds limit ${this.securityPolicy.maxMessageSize}`)
    }

    // Check rate limits
    this.checkRateLimit()

    try {
      this.targetWindow.postMessage(notification, this.targetOrigin)
      this.log('Sent MCP notification', notification)
    } catch (error) {
      throw new TransportError(`Failed to send notification: ${error}`)
    }
  }

  /**
   * Close the transport connection
   */
  async close(): Promise<void> {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageHandler)
    }

    // Reject all pending requests
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout)
      reject(new TransportError('Transport closed'))
    })
    this.pendingRequests.clear()

    this.isConnected = false
    this.targetWindow = null
    this.rateLimiters.clear()

    this.emit({ type: 'disconnected' })
    this.log('Transport closed')
  }

  /**
   * Handle incoming PostMessage events
   */
  private handleMessage(event: MessageEvent): void {
    this.log('Received message', { origin: event.origin, data: event.data })

    // Security: Validate origin
    if (this.securityPolicy.enforceOriginValidation && !this.validateOrigin(event.origin)) {
      this.log('Rejected message from unauthorized origin', event.origin)
      return
    }

    const data = event.data

    // Check if this is a JSON-RPC message
    if (!this.isJSONRPCMessage(data)) {
      return
    }

    // Handle response to our request
    if (this.isJSONRPCResponse(data) && this.pendingRequests.has(data.id)) {
      const pending = this.pendingRequests.get(data.id)!
      this.pendingRequests.delete(data.id)
      clearTimeout(pending.timeout)

      if (data.error) {
        pending.reject(new TransportError(data.error.message, data.error.code?.toString()))
      } else {
        pending.resolve(data)
      }
      return
    }

    // Handle incoming request/notification
    this.emit({ type: 'message', data })
  }

  /**
   * Add event listener for transport events
   */
  addEventListener(handler: EventHandler): void {
    this.eventHandlers.push(handler)
  }

  /**
   * Remove event listener
   */
  removeEventListener(handler: EventHandler): void {
    const index = this.eventHandlers.indexOf(handler)
    if (index > -1) {
      this.eventHandlers.splice(index, 1)
    }
  }

  private emit(event: ConnectionEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event)
      } catch (error) {
        this.log('Error in event handler', error)
      }
    })
  }

  private validateOrigin(origin: string): boolean {
    if (this.allowedOrigins.includes('*')) {
      return true
    }
    return this.allowedOrigins.includes(origin)
  }

  private isJSONRPCMessage(data: any): boolean {
    return (
      data &&
      typeof data === 'object' &&
      data.jsonrpc === '2.0' &&
      (data.method || data.result !== undefined || data.error !== undefined)
    )
  }

  private isJSONRPCResponse(data: any): data is JSONRPCResponse {
    return (
      this.isJSONRPCMessage(data) &&
      !data.method &&
      data.id !== undefined &&
      (data.result !== undefined || data.error !== undefined)
    )
  }

  private checkRateLimit(): void {
    if (!this.securityPolicy.rateLimits?.length) {
      return
    }

    const now = Date.now()
    const key = 'global' // Could be per-origin if needed

    for (const rateLimit of this.securityPolicy.rateLimits) {
      const limiter = this.rateLimiters.get(key)

      if (!limiter || now > limiter.resetTime) {
        // Reset or initialize
        this.rateLimiters.set(key, { count: 1, resetTime: now + rateLimit.windowMs })
      } else {
        limiter.count++
        if (limiter.count > rateLimit.maxRequests) {
          throw new SecurityError(`Rate limit exceeded: ${limiter.count}/${rateLimit.maxRequests} in ${rateLimit.windowMs}ms`)
        }
      }
    }
  }

  private generateMessageId(): number {
    return ++this.messageId
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[PostMessageMCPTransport] ${message}`, data)
    }
  }

  // Getters for status
  get connected(): boolean {
    return this.isConnected
  }

  get ready(): boolean {
    return this.isConnected && !!this.targetWindow
  }
}