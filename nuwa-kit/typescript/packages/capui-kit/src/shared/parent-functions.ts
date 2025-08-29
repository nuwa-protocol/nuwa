import type {
  AIResponse,
  StreamingPromptOptions,
  PromptOptions
} from './types.js'

// Re-export types for convenience
export type { AIResponse, PromptOptions, StreamingPromptOptions }

/**
 * Shared interface for parent functions that can be called by child iframes
 * Both embed-ui (via Penpal) and artifact-ui (via custom transport) implement this
 */
export interface ParentFunctions {
  /**
   * Send a prompt to the AI backend
   * @param prompt The prompt text to send
   * @param options Optional configuration for the request
   * @returns Promise resolving to the AI response
   */
  sendPrompt(prompt: string, options?: PromptOptions): Promise<AIResponse>

  /**
   * Send a streaming prompt to the AI backend
   * @param prompt The prompt text to send
   * @param options Streaming configuration with callbacks
   * @returns Promise resolving to the stream ID
   */
  sendPromptStreaming(prompt: string, options: StreamingPromptOptions): Promise<string>

  /**
   * Send a message to the parent application
   * @param type Message type identifier
   * @param payload Message payload data
   * @returns Promise resolving when message is sent
   */
  sendMessage(type: string, payload: any): Promise<void>

  /**
   * Get context data from the parent application
   * @param keys Optional array of specific context keys to retrieve
   * @returns Promise resolving to the context data
   */
  getContext(keys?: string[]): Promise<any>

  /**
   * Set the height of the iframe (convenience method)
   * @param height Height in pixels or CSS value
   * @returns Promise resolving when height is set
   */
  setHeight?(height: string | number): Promise<void>

  /**
   * Show loading state in parent
   * @param message Optional loading message
   * @returns Promise resolving when loading state is shown
   */
  showLoading?(message?: string): Promise<void>

  /**
   * Hide loading state in parent
   * @returns Promise resolving when loading state is hidden
   */
  hideLoading?(): Promise<void>
}

/**
 * Parent handler interface - implemented by parent applications
 * to handle calls from child iframes
 */
export interface ParentHandler {
  /**
   * Handle prompt requests from child
   */
  onSendPrompt?(prompt: string, options?: PromptOptions, origin?: string): Promise<AIResponse>

  /**
   * Handle streaming prompt requests from child
   */
  onSendPromptStreaming?(
    prompt: string, 
    options: StreamingPromptOptions & { streamId: string }, 
    origin?: string
  ): Promise<void>

  /**
   * Handle messages from child
   */
  onSendMessage?(type: string, payload: any, origin?: string): Promise<void>

  /**
   * Handle context requests from child
   */
  onGetContext?(keys?: string[], origin?: string): Promise<any>

  /**
   * Handle height change requests from child
   */
  onSetHeight?(height: string | number, origin?: string): Promise<void>

  /**
   * Handle loading state requests from child
   */
  onShowLoading?(message?: string, origin?: string): Promise<void>
  onHideLoading?(origin?: string): Promise<void>
}

/**
 * Base configuration for parent applications
 */
export interface ParentConfig {
  allowedOrigins?: string[]
  securityPolicy?: Partial<import('./types.js').SecurityPolicy>
  debug?: boolean
  timeout?: number
}

/**
 * Base configuration for child applications
 */
export interface ChildConfig {
  parentOrigin?: string
  timeout?: number
  debug?: boolean
  connectionInfo?: import('./types.js').ConnectionInfo
}