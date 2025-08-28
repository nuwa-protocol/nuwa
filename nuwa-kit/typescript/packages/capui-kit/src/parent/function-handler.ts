import {
  ParentFunctions,
  AIResponse,
  SecurityError,
  SecurityPolicy,
  ValidationSchema,
} from '../mcp/types.js'

export interface ParentFunctionHandlerOptions {
  allowedOrigins?: string[]
  securityPolicy?: Partial<SecurityPolicy>
  debug?: boolean
  // Parent function implementations
  onSendPrompt?: (prompt: string, options?: any, origin?: string) => Promise<AIResponse>
  onSendMessage?: (type: string, payload: any, origin?: string) => Promise<void>
  onGetContext?: (keys?: string[], origin?: string) => Promise<any>
}

/**
 * Handles direct function calls from child iframes
 * No MCP protocol overhead - simple postMessage validation and execution
 * 
 * Features:
 * - Direct postMessage handler for parent functions
 * - Origin validation and rate limiting
 * - Parameter validation and sanitization
 * - Simple request/response pattern
 */
export class ParentFunctionHandler {
  private allowedOrigins: string[]
  private securityPolicy: SecurityPolicy
  private debug: boolean
  private messageHandler = this.handleMessage.bind(this)
  
  // Function implementations provided by parent
  private onSendPrompt?: ParentFunctionHandlerOptions['onSendPrompt']
  private onSendMessage?: ParentFunctionHandlerOptions['onSendMessage']
  private onGetContext?: ParentFunctionHandlerOptions['onGetContext']
  
  // Rate limiting
  private rateLimiters = new Map<string, { count: number, resetTime: number }>()

  constructor(options: ParentFunctionHandlerOptions = {}) {
    this.allowedOrigins = options.allowedOrigins || ['*']
    this.debug = options.debug || false
    
    this.securityPolicy = {
      allowedOrigins: this.allowedOrigins,
      toolPermissions: {},
      functionPermissions: {
        sendPrompt: {
          origins: this.allowedOrigins,
          rateLimits: [{ windowMs: 60000, maxRequests: 60 }], // 60 per minute
          paramValidation: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
              options: { type: 'object' }
            },
            required: ['prompt']
          }
        },
        sendMessage: {
          origins: this.allowedOrigins,
          rateLimits: [{ windowMs: 60000, maxRequests: 120 }], // 120 per minute
          paramValidation: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              payload: {}
            },
            required: ['type', 'payload']
          }
        },
        getContext: {
          origins: this.allowedOrigins,
          rateLimits: [{ windowMs: 60000, maxRequests: 100 }], // 100 per minute
          paramValidation: {
            type: 'object',
            properties: {
              keys: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      },
      messageValidation: {
        enforceSchema: true,
        sanitizeInputs: true,
        maxMessageSize: 1024 * 1024 // 1MB
      },
      ...options.securityPolicy
    }
    
    this.onSendPrompt = options.onSendPrompt
    this.onSendMessage = options.onSendMessage
    this.onGetContext = options.onGetContext
    
    this.log('Parent function handler initialized')
  }

  /**
   * Start listening for function calls from child iframes
   */
  start(): void {
    window.addEventListener('message', this.messageHandler)
    this.log('Started listening for parent function calls')
  }

  /**
   * Stop listening for function calls
   */
  stop(): void {
    window.removeEventListener('message', this.messageHandler)
    this.log('Stopped listening for parent function calls')
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    this.log('Received message', event.data)
    
    // Check if this is a parent function call
    const data = event.data
    if (!this.isParentFunctionCall(data)) {
      return // Not our message
    }
    
    try {
      // Security validation
      this.validateOrigin(event.origin)
      this.validateMessage(data, event.origin)
      this.checkRateLimit(data.function, event.origin)
      
      // Execute function
      const result = await this.executeFunction(data.function, data.params, event.origin)
      
      // Send response
      this.sendResponse(event.source as Window, event.origin, data.id, { success: true, result })
      
    } catch (error) {
      this.log('Function call failed', error)
      
      // Send error response
      this.sendResponse(event.source as Window, event.origin, data.id, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  private isParentFunctionCall(data: any): boolean {
    return data?.type === 'PARENT_FUNCTION_CALL' && 
           data?.function && 
           data?.id &&
           ['sendPrompt', 'sendMessage', 'getContext'].includes(data.function)
  }

  private validateOrigin(origin: string): void {
    if (this.allowedOrigins.includes('*')) {
      return
    }
    
    if (!this.allowedOrigins.includes(origin)) {
      throw new SecurityError(`Origin not allowed: ${origin}`, origin)
    }
  }

  private validateMessage(data: any, origin: string): void {
    const functionName = data.function as keyof ParentFunctions
    const permissions = this.securityPolicy.functionPermissions[functionName]
    
    if (!permissions) {
      throw new SecurityError(`Function not allowed: ${functionName}`)
    }
    
    // Check origin permissions
    if (!permissions.origins.includes('*') && !permissions.origins.includes(origin)) {
      throw new SecurityError(`Function ${functionName} not allowed for origin: ${origin}`, origin)
    }
    
    // Validate parameters against schema
    if (this.securityPolicy.messageValidation.enforceSchema && permissions.paramValidation) {
      this.validateParams(data.params, permissions.paramValidation)
    }
    
    // Check message size
    const messageSize = JSON.stringify(data).length
    if (messageSize > this.securityPolicy.messageValidation.maxMessageSize) {
      throw new SecurityError(`Message size ${messageSize} exceeds limit ${this.securityPolicy.messageValidation.maxMessageSize}`)
    }
  }

  private validateParams(params: any, schema: ValidationSchema): void {
    if (schema.type === 'object' && typeof params !== 'object') {
      throw new SecurityError('Parameters must be an object')
    }
    
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in params)) {
          throw new SecurityError(`Required parameter missing: ${field}`)
        }
      }
    }
    
    // Basic type validation for properties
    if (schema.properties && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        const propSchema = schema.properties[key]
        if (propSchema && propSchema.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value
          if (actualType !== propSchema.type && value !== null && value !== undefined) {
            throw new SecurityError(`Parameter ${key} must be of type ${propSchema.type}, got ${actualType}`)
          }
        }
      }
    }
  }

  private checkRateLimit(functionName: string, origin: string): void {
    const permissions = this.securityPolicy.functionPermissions[functionName]
    if (!permissions?.rateLimits?.length) {
      return
    }
    
    const key = `${origin}:${functionName}`
    const now = Date.now()
    
    for (const rateLimit of permissions.rateLimits) {
      const limiter = this.rateLimiters.get(key)
      
      if (!limiter || now > limiter.resetTime) {
        // Reset or initialize
        this.rateLimiters.set(key, { count: 1, resetTime: now + rateLimit.windowMs })
      } else {
        limiter.count++
        if (limiter.count > rateLimit.maxRequests) {
          throw new SecurityError(`Rate limit exceeded for ${functionName}: ${limiter.count}/${rateLimit.maxRequests} in ${rateLimit.windowMs}ms`)
        }
      }
    }
  }

  private async executeFunction(functionName: string, params: any, origin: string): Promise<any> {
    this.log(`Executing function: ${functionName}`, { params, origin })
    
    switch (functionName) {
      case 'sendPrompt':
        if (!this.onSendPrompt) {
          throw new Error('sendPrompt handler not configured')
        }
        return await this.onSendPrompt(params.prompt, params.options, origin)
        
      case 'sendMessage':
        if (!this.onSendMessage) {
          throw new Error('sendMessage handler not configured')
        }
        await this.onSendMessage(params.type, params.payload, origin)
        return { success: true }
        
      case 'getContext':
        if (!this.onGetContext) {
          throw new Error('getContext handler not configured')
        }
        return await this.onGetContext(params.keys, origin)
        
      default:
        throw new Error(`Unknown function: ${functionName}`)
    }
  }

  private sendResponse(targetWindow: Window, targetOrigin: string, messageId: string, response: any): void {
    const responseMessage = {
      type: 'PARENT_FUNCTION_RESPONSE',
      id: messageId,
      ...response
    }
    
    targetWindow.postMessage(responseMessage, targetOrigin)
    this.log('Sent response', responseMessage)
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[ParentFunctionHandler] ${message}`, data)
    }
  }

  /**
   * Update function handlers
   */
  updateHandlers(handlers: Partial<Pick<ParentFunctionHandlerOptions, 'onSendPrompt' | 'onSendMessage' | 'onGetContext'>>): void {
    if (handlers.onSendPrompt) this.onSendPrompt = handlers.onSendPrompt
    if (handlers.onSendMessage) this.onSendMessage = handlers.onSendMessage
    if (handlers.onGetContext) this.onGetContext = handlers.onGetContext
    this.log('Updated function handlers')
  }

  /**
   * Update security policy
   */
  updateSecurityPolicy(policy: Partial<SecurityPolicy>): void {
    this.securityPolicy = { ...this.securityPolicy, ...policy }
    this.log('Updated security policy')
  }
}