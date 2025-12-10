import type { Transport } from '@modelcontextprotocol/sdk/shared/transport';
import type { JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types';
import { SecurityError, TransportError } from './types';

export interface PostMessageMCPTransportOptions {
  targetWindow?: Window;
  targetOrigin?: string;
  allowedOrigins?: string[];
  timeout?: number;
  debug?: boolean;
  securityPolicy?: {
    enforceOriginValidation?: boolean;
    maxMessageSize?: number;
    rateLimits?: {
      windowMs: number;
      maxRequests: number;
    }[];
  };
}

/**
 * PostMessage transport implementation for official MCP SDK
 * Provides secure iframe communication following MCP transport interface
 */
export class PostMessageMCPTransport implements Transport {
  private targetWindow: Window | null = null;
  private targetOrigin: string;
  private allowedOrigins: string[];
  private timeout: number;
  private debug: boolean;
  private securityPolicy: NonNullable<PostMessageMCPTransportOptions['securityPolicy']>;

  private isConnected = false;
  private messageId = 0;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (response: JSONRPCResponse) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  // MCP SDK callback properties
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: any, extra?: any) => void;

  private messageHandler = this.handleMessage.bind(this);
  private rateLimiters = new Map<string, { count: number; resetTime: number }>();

  constructor(options: PostMessageMCPTransportOptions = {}) {
    this.targetWindow = options.targetWindow || window.parent;
    this.targetOrigin = options.targetOrigin || '*';
    this.allowedOrigins = options.allowedOrigins || ['*'];
    this.timeout = options.timeout || 30000;
    this.debug = options.debug || false;

    this.securityPolicy = {
      enforceOriginValidation: true,
      maxMessageSize: 1024 * 1024, // 1MB
      rateLimits: [{ windowMs: 60000, maxRequests: 100 }],
      ...options.securityPolicy,
    };

    this.log(
      'PostMessage MCP Transport initialized',
      {
        targetOrigin: this.targetOrigin,
        allowedOrigins: this.allowedOrigins,
      },
      'debug'
    );
  }

  /**
   * Start the transport (required by Transport interface)
   */
  async start(): Promise<void> {
    this.log('Starting transport', {}, 'debug');
    await this.connect();
    this.log('Transport started', {}, 'debug');
  }

  /**
   * Send a JSON-RPC message (required by Transport interface)
   */
  async send(message: any): Promise<void> {
    if (!this.isConnected || !this.targetWindow) {
      throw new TransportError('Transport not connected');
    }

    // Validate message size
    const messageSize = JSON.stringify(message).length;
    if (messageSize > this.securityPolicy.maxMessageSize!) {
      throw new SecurityError(
        `Message size ${messageSize} exceeds limit ${this.securityPolicy.maxMessageSize}`
      );
    }

    // Check rate limits
    this.checkRateLimit();

    try {
      this.targetWindow.postMessage(message, this.targetOrigin);
      this.log('Sent MCP message', { method: message.method }, 'debug');
    } catch (error) {
      throw new TransportError(`Failed to send message: ${error}`);
    }
  }

  /**
   * Connect to the target window
   */
  async connect(targetWindow?: Window): Promise<void> {
    this.log(
      'Connecting to target window',
      {
        hasTargetWindow: !!targetWindow,
        isInIframe: window !== window.parent,
      },
      'debug'
    );

    if (targetWindow) {
      this.targetWindow = targetWindow;
      this.log('Target window set from parameter', {}, 'debug');
    }

    if (!this.targetWindow) {
      if (typeof window !== 'undefined') {
        // If we're in a child iframe, connect to parent
        this.targetWindow = window.parent;
        this.log('Target window set to parent', {}, 'debug');
      } else {
        throw new TransportError('No target window available');
      }
    }

    // Start listening for messages
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.messageHandler);
      this.log('Message event listener added', {}, 'debug');
    }

    this.isConnected = true;
    this.log('Connected to target window', {}, 'debug');
  }

  /**
   * Send a JSON-RPC request over PostMessage
   */
  async request(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    this.log(
      'Sending MCP request',
      {
        method: request.method,
        id: request.id,
      },
      'debug'
    );

    if (!this.isConnected || !this.targetWindow) {
      const error = 'Transport not connected';
      this.log(error, {}, 'error');
      throw new TransportError(error);
    }

    // Validate message size
    const messageSize = JSON.stringify(request).length;
    if (messageSize > this.securityPolicy.maxMessageSize!) {
      throw new SecurityError(
        `Message size ${messageSize} exceeds limit ${this.securityPolicy.maxMessageSize}`
      );
    }

    // Check rate limits
    this.checkRateLimit();

    return new Promise((resolve, reject) => {
      const requestId = request.id || this.generateMessageId();

      const timeoutId = setTimeout(() => {
        this.log(`Request ${requestId} timed out`, { timeout: this.timeout }, 'warn');
        this.pendingRequests.delete(requestId);
        reject(new TransportError(`Request timeout after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      // Ensure request has an ID
      const requestWithId = { ...request, id: requestId };

      try {
        this.targetWindow!.postMessage(requestWithId, this.targetOrigin);
        this.log(
          'MCP request sent',
          {
            method: requestWithId.method,
            id: requestWithId.id,
            messageSize,
          },
          'debug'
        );
      } catch (error) {
        this.log('Failed to send message', { error }, 'error');
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutId);
        reject(new TransportError(`Failed to send message: ${error}`));
      }
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  async notify(notification: JSONRPCRequest): Promise<void> {
    if (!this.isConnected || !this.targetWindow) {
      throw new TransportError('Transport not connected');
    }

    // Validate message size
    const messageSize = JSON.stringify(notification).length;
    if (messageSize > this.securityPolicy.maxMessageSize!) {
      throw new SecurityError(
        `Message size ${messageSize} exceeds limit ${this.securityPolicy.maxMessageSize}`
      );
    }

    // Check rate limits
    this.checkRateLimit();

    try {
      this.targetWindow.postMessage(notification, this.targetOrigin);
      this.log('MCP notification sent', { method: notification.method }, 'debug');
    } catch (error) {
      throw new TransportError(`Failed to send notification: ${error}`);
    }
  }

  /**
   * Close the transport connection
   */
  async close(): Promise<void> {
    this.log('Closing transport', {}, 'debug');

    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageHandler);
    }

    // Reject all pending requests
    const pendingCount = this.pendingRequests.size;
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new TransportError('Transport closed'));
    });
    this.pendingRequests.clear();

    if (pendingCount > 0) {
      this.log(`Cancelled ${pendingCount} pending requests`, {}, 'debug');
    }

    this.isConnected = false;
    this.targetWindow = null;
    this.rateLimiters.clear();

    // Call the MCP SDK's close callback
    if (this.onclose) {
      try {
        this.onclose();
        this.log('onclose callback executed', {}, 'debug');
      } catch (error) {
        this.log('Error in onclose callback', { error }, 'error');
      }
    }

    this.log('Transport closed', {}, 'debug');
  }

  /**
   * Handle incoming PostMessage events
   */
  private handleMessage(event: MessageEvent): void {
    this.log(
      'Message received',
      {
        origin: event.origin,
        hasMethod: event.data?.method,
        hasId: event.data?.id,
        isResponse: event.data?.result !== undefined || event.data?.error !== undefined,
      },
      'debug'
    );

    // Security: Validate origin
    if (this.securityPolicy.enforceOriginValidation && !this.validateOrigin(event.origin)) {
      this.log(
        'Message rejected from unauthorized origin',
        {
          origin: event.origin,
          allowedOrigins: this.allowedOrigins,
        },
        'warn'
      );
      return;
    }

    const data = event.data;

    // Check if this is a JSON-RPC message
    if (!this.isJSONRPCMessage(data)) {
      this.log('Ignoring non-JSONRPC message', { type: typeof data }, 'debug');
      return;
    }

    this.log(
      'Processing JSONRPC message',
      {
        method: data.method,
        id: data.id,
        isResponse: this.isJSONRPCResponse(data),
      },
      'debug'
    );

    // Handle response to our request
    if (this.isJSONRPCResponse(data) && this.pendingRequests.has(data.id)) {
      this.log(
        'Handling response',
        {
          id: data.id,
          hasResult: data.result !== undefined,
          hasError: 'error' in data,
        },
        'debug'
      );

      const pending = this.pendingRequests.get(data.id)!;
      this.pendingRequests.delete(data.id);
      clearTimeout(pending.timeout);

      // For successful responses, resolve with the data
      pending.resolve(data);
      return;
    }

    // Handle error responses (they have a different structure)
    if (
      data.jsonrpc === '2.0' &&
      data.id &&
      'error' in data &&
      data.error &&
      this.pendingRequests.has(data.id)
    ) {
      this.log(
        'Handling error response',
        {
          id: data.id,
          error: (data.error as any).message,
        },
        'debug'
      );

      const pending = this.pendingRequests.get(data.id)!;
      this.pendingRequests.delete(data.id);
      clearTimeout(pending.timeout);

      pending.reject(
        new TransportError((data.error as any).message, (data.error as any).code?.toString())
      );
      return;
    }

    // Handle incoming request/notification
    this.log(
      'Forwarding to onmessage callback',
      {
        method: data.method,
        hasCallback: !!this.onmessage,
      },
      'debug'
    );

    // Call the MCP SDK's callback instead of emitting events
    if (this.onmessage) {
      try {
        this.onmessage(data);
      } catch (error) {
        this.log('Error in onmessage callback', { error }, 'error');
        if (this.onerror) {
          this.onerror(error as Error);
        }
      }
    } else {
      this.log('No onmessage callback registered', {}, 'warn');
    }
  }

  private validateOrigin(origin: string): boolean {
    if (this.allowedOrigins.includes('*')) {
      return true;
    }
    return this.allowedOrigins.includes(origin);
  }

  private isJSONRPCMessage(data: any): boolean {
    return (
      data &&
      typeof data === 'object' &&
      data.jsonrpc === '2.0' &&
      (data.method || data.result !== undefined || data.error !== undefined)
    );
  }

  private isJSONRPCResponse(data: any): data is JSONRPCResponse {
    return (
      this.isJSONRPCMessage(data) &&
      !data.method &&
      data.id !== undefined &&
      (data.result !== undefined || data.error !== undefined)
    );
  }

  private checkRateLimit(): void {
    if (!this.securityPolicy.rateLimits?.length) {
      return;
    }

    const now = Date.now();
    const key = 'global'; // Could be per-origin if needed

    for (const rateLimit of this.securityPolicy.rateLimits) {
      const limiter = this.rateLimiters.get(key);

      if (!limiter || now > limiter.resetTime) {
        // Reset or initialize
        this.rateLimiters.set(key, {
          count: 1,
          resetTime: now + rateLimit.windowMs,
        });
      } else {
        limiter.count++;
        if (limiter.count > rateLimit.maxRequests) {
          throw new SecurityError(
            `Rate limit exceeded: ${limiter.count}/${rateLimit.maxRequests} in ${rateLimit.windowMs}ms`
          );
        }
      }
    }
  }

  private generateMessageId(): number {
    return ++this.messageId;
  }

  private log(
    message: string,
    data?: any,
    level: 'debug' | 'debug' | 'warn' | 'error' = 'debug'
  ): void {
    const timestamp = new Date().toISOString();
    const logPrefix = `[PostMessageMCPTransport][${timestamp}]`;

    // Only show info and above by default, debug/verbose only when debug enabled
    if (level === 'debug' && !this.debug) {
      return;
    }

    const logData = this.debug
      ? {
          ...data,
          transportState: {
            isConnected: this.isConnected,
            hasTargetWindow: !!this.targetWindow,
            pendingRequestsCount: this.pendingRequests.size,
            hasOnMessage: !!this.onmessage,
            hasOnError: !!this.onerror,
            hasOnClose: !!this.onclose,
          },
        }
      : data;

    switch (level) {
      case 'error':
        console.error(`${logPrefix} ${message}`, logData);
        break;
      case 'warn':
        console.warn(`${logPrefix} ${message}`, logData);
        break;
      case 'debug':
        console.debug(`${logPrefix} ${message}`, logData);
        break;
      default:
        console.info(`${logPrefix} ${message}`, logData);
    }
  }

  // Getters for status
  get connected(): boolean {
    return this.isConnected;
  }

  get ready(): boolean {
    return this.isConnected && !!this.targetWindow;
  }
}
