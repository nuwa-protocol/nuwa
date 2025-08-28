import {
  ParentFunctions,
  AIResponse,
  MCPTransportError,
} from '../mcp/types.js'

export interface ChildSDKOptions {
  parentOrigin?: string
  timeout?: number
  debug?: boolean
}

/**
 * Child SDK for direct parent function calls
 * Simple postMessage-based SDK with no MCP protocol overhead
 * 
 * Features:
 * - Direct function calls to parent (sendPrompt, sendMessage, getContext)
 * - Promise-based API with timeout handling
 * - Simple request/response pattern
 * - TypeScript support with full type safety
 */
export class ChildSDK implements ParentFunctions {
  private parentWindow: Window
  private parentOrigin: string
  private timeout: number
  private debug: boolean
  private messageId = 0
  private pendingCalls = new Map<string, {
    resolve: (result: any) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }>()
  
  private messageHandler = this.handleMessage.bind(this)

  constructor(options: ChildSDKOptions = {}) {
    this.parentWindow = window.parent
    this.parentOrigin = options.parentOrigin || '*'
    this.timeout = options.timeout || 30000
    this.debug = options.debug || false
    
    // Start listening for responses
    window.addEventListener('message', this.messageHandler)
    
    this.log('Child SDK initialized', { parentOrigin: this.parentOrigin })
  }

  /**
   * Send prompt to AI backend via parent
   */
  async sendPrompt(
    prompt: string, 
    options?: {
      streaming?: boolean
      model?: string
      temperature?: number
    }
  ): Promise<AIResponse> {
    this.log('Sending prompt', { prompt: prompt.substring(0, 100) + '...', options })
    
    return this.callParentFunction('sendPrompt', { prompt, options })
  }

  /**
   * Send message to parent for UI updates
   */
  async sendMessage(type: string, payload: any): Promise<void> {
    this.log('Sending message', { type, payload })
    
    await this.callParentFunction('sendMessage', { type, payload })
  }

  /**
   * Get context from parent application
   */
  async getContext(keys?: string[]): Promise<any> {
    this.log('Getting context', { keys })
    
    return this.callParentFunction('getContext', { keys })
  }

  /**
   * Generic function to call parent functions
   */
  private async callParentFunction(functionName: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.generateMessageId()
      
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(id)
        reject(new MCPTransportError(`Function call timeout after ${this.timeout}ms`))
      }, this.timeout)
      
      this.pendingCalls.set(id, { resolve, reject, timeout })
      
      const message = {
        type: 'PARENT_FUNCTION_CALL',
        id,
        function: functionName,
        params
      }
      
      this.parentWindow.postMessage(message, this.parentOrigin)
      this.log('Sent function call', message)
    })
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data
    
    // Check if this is a response to our function call
    if (data?.type === 'PARENT_FUNCTION_RESPONSE' && data?.id && this.pendingCalls.has(data.id)) {
      const pending = this.pendingCalls.get(data.id)!
      this.pendingCalls.delete(data.id)
      clearTimeout(pending.timeout)
      
      if (data.success) {
        this.log('Function call succeeded', data)
        pending.resolve(data.result)
      } else {
        this.log('Function call failed', data)
        pending.reject(new Error(data.error || 'Function call failed'))
      }
    }
  }

  private generateMessageId(): string {
    return `child-sdk-${++this.messageId}-${Date.now()}`
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[ChildSDK] ${message}`, data)
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    window.removeEventListener('message', this.messageHandler)
    
    // Reject all pending calls
    this.pendingCalls.forEach(({ reject, timeout }) => {
      clearTimeout(timeout)
      reject(new MCPTransportError('SDK destroyed'))
    })
    this.pendingCalls.clear()
    
    this.log('Child SDK destroyed')
  }

  /**
   * Check if parent window is available
   */
  get isAvailable(): boolean {
    return this.parentWindow !== window && this.parentWindow !== null
  }

  /**
   * Get number of pending calls
   */
  get pendingCallCount(): number {
    return this.pendingCalls.size
  }
}