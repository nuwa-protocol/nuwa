import type { 
  HttpPayerOptions, 
  FetchLike, 
  HttpClientState,
  PaymentRequestContext,
  HostChannelMappingStore 
} from './types';
import type { SubRAV, SignedSubRAV } from '../../core/types';
import { PaymentChannelPayerClient } from '../../client/PaymentChannelPayerClient';
import { PaymentChannelFactory } from '../../factory/chainFactory';
import { SubRAVCache } from './internal/SubRAVCache';
import { DidAuthHelper } from './internal/DidAuthHelper';
import { HttpPaymentCodec } from './internal/codec';
import { 
  createDefaultMappingStore, 
  extractHost,
  MemoryHostChannelMappingStore 
} from './internal/HostChannelMappingStore';

/**
 * HTTP Client State enum for internal state management
 */
enum ClientState {
  INIT = 'INIT',
  OPENING = 'OPENING', 
  HANDSHAKE = 'HANDSHAKE',
  READY = 'READY'
}

/**
 * PaymentChannelHttpClient provides a high-level HTTP interface
 * for making requests with integrated payment channel functionality.
 * 
 * Features:
 * - Automatic channel creation and management
 * - DIDAuth header generation
 * - SubRAV signing and caching
 * - Error handling for payment-related HTTP status codes
 * - Host-to-channel mapping persistence
 */
export class PaymentChannelHttpClient {
  private payerClient: PaymentChannelPayerClient;
  private options: HttpPayerOptions;
  private fetchImpl: FetchLike;
  private mappingStore: HostChannelMappingStore;
  private subRAVCache: SubRAVCache;
  private host: string;
  private state: ClientState = ClientState.INIT;
  private clientState: HttpClientState;

  constructor(options: HttpPayerOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl || ((globalThis as any).fetch?.bind(globalThis));
    this.mappingStore = options.mappingStore || createDefaultMappingStore();
    this.subRAVCache = new SubRAVCache();
    this.host = extractHost(options.baseUrl);
    
    if (!this.fetchImpl) {
      throw new Error('fetch implementation not available. Please provide fetchImpl option.');
    }

    // Initialize payment channel client
    this.payerClient = PaymentChannelFactory.createClient({
      chainConfig: options.chainConfig,
      signer: options.signer,
      keyId: options.keyId,
      storageOptions: options.storageOptions
    });
    
    this.clientState = {
      isHandshakeComplete: false
    };

    this.log('PaymentChannelHttpClient initialized for host:', this.host);
  }

  /**
   * Send an HTTP request with payment channel integration
   */
  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    init?: RequestInit
  ): Promise<Response> {
    const fullUrl = new URL(path, this.options.baseUrl).toString();
    
    // Ensure channel is ready
    await this.ensureChannelReady();
    
    // Prepare headers
    const headers = await this.prepareHeaders(fullUrl, method, init?.headers);
    
    // Build request context
    const requestContext: PaymentRequestContext = {
      method,
      url: fullUrl,
      headers,
      body: init?.body
    };

    // Execute request with retry logic
    return this.executeRequest(requestContext, init);
  }

  /**
   * Convenience methods for common HTTP verbs
   */
  async get<T = any>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.request('GET', path, init);
    return this.parseJsonResponse(response);
  }

  async post<T = any>(path: string, body?: any, init?: RequestInit): Promise<T> {
    const requestInit = {
      ...init,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers
      }
    };
    const response = await this.request('POST', path, requestInit);
    return this.parseJsonResponse(response);
  }

  async put<T = any>(path: string, body?: any, init?: RequestInit): Promise<T> {
    const requestInit = {
      ...init,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers
      }
    };
    const response = await this.request('PUT', path, requestInit);
    return this.parseJsonResponse(response);
  }

  async patch<T = any>(path: string, body?: any, init?: RequestInit): Promise<T> {
    const requestInit = {
      ...init,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers
      }
    };
    const response = await this.request('PATCH', path, requestInit);
    return this.parseJsonResponse(response);
  }

  async delete<T = any>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.request('DELETE', path, init);
    return this.parseJsonResponse(response);
  }

  /**
   * Get the currently cached pending SubRAV
   */
  getPendingSubRAV(): SubRAV | null {
    return this.subRAVCache.getPending();
  }

  /**
   * Clear the pending SubRAV cache
   */
  clearPendingSubRAV(): void {
    this.subRAVCache.clear();
  }

  /**
   * Get the current channel ID
   */
  getChannelId(): string | undefined {
    return this.clientState.channelId;
  }

  // -------- Private Methods --------

  /**
   * Ensure payment channel is ready for use
   */
  private async ensureChannelReady(): Promise<void> {
    if (this.state === ClientState.READY && this.clientState.channelId) {
      return;
    }

    await this.initializeChannel();
  }

  /**
   * Initialize or restore payment channel
   */
  private async initializeChannel(): Promise<void> {
    this.state = ClientState.OPENING;
    this.log('Initializing channel for host:', this.host);

    try {
      // Check if we have a specific channelId
      let channelId = this.options.channelId;
      
      if (!channelId) {
        // Try to get from mapping store
        channelId = await this.mappingStore.get(this.host);
        this.log('Retrieved channelId from mapping store:', channelId);
      }

      if (channelId) {
        // Verify channel is still active
        try {
          const channelInfo = await this.payerClient.getChannelInfo(channelId);
          if (channelInfo.status === 'active') {
            this.clientState.channelId = channelId;
            this.state = ClientState.HANDSHAKE;
            this.log('Using existing active channel:', channelId);
            return;
          } else {
            this.log('Channel is not active, removing from store:', channelId, channelInfo.status);
            await this.mappingStore.delete(this.host);
          }
        } catch (error) {
          this.log('Channel verification failed, removing from store:', error);
          await this.mappingStore.delete(this.host);
        }
      }

      // Need to create a new channel
      this.log('Creating new channel...');
      
      // First, ensure the payer has sufficient funds in the hub
      const defaultAssetId = this.options.defaultAssetId || '0x3::gas_coin::RGas';
      const hubFundAmount = this.options.hubFundAmount || BigInt('1000000000'); // 10 RGas
      
      try {
        this.log('Depositing funds to hub:', hubFundAmount, 'of', defaultAssetId);
        await this.payerClient.depositToHub({
          assetId: defaultAssetId,
          amount: hubFundAmount,
        });
        this.log('Hub funding completed');
      } catch (error) {
        this.log('Hub funding failed (might already have funds):', error);
        // Continue anyway - the hub might already have sufficient funds
      }
      
      // Get payee DID from options or use a default approach
      // In a real implementation, this should come from the service discovery
      const payeeDid = this.options.payeeDid || await this.options.signer.getDid();
      
      const channelInfo = await this.payerClient.openChannelWithSubChannel({
        payeeDid,
        assetId: defaultAssetId,
        collateral: this.options.channelCollateral || BigInt('100000000'), // 1 RGas
      });

      this.clientState.channelId = channelInfo.channelId;
      
      // Store the mapping
      await this.mappingStore.set(this.host, channelInfo.channelId);
      
      this.state = ClientState.HANDSHAKE;
      this.log('Created new channel:', channelInfo.channelId);
      
    } catch (error) {
      this.handleError('Failed to initialize channel', error);
      throw error;
    }
  }

  /**
   * Prepare headers for the request
   */
  private async prepareHeaders(
    fullUrl: string, 
    method: string, 
    providedHeaders?: HeadersInit
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    // Copy provided headers
    if (providedHeaders) {
      if (providedHeaders instanceof Headers) {
        providedHeaders.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(providedHeaders)) {
        providedHeaders.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, providedHeaders);
      }
    }

    // Add DID authorization header if signer is available
    try {
      const payerDid = this.options.payerDid || await this.options.signer.getDid();
      const authHeader = await DidAuthHelper.generateAuthHeader(
        payerDid,
        this.options.signer,
        fullUrl,
        method,
        this.options.keyId // Pass the configured keyId
      );
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
    } catch (error) {
      this.log('Failed to generate DID auth header:', error);
    }

    // Add payment channel header
    await this.addPaymentChannelHeader(headers);

    return headers;
  }

  /**
   * Add payment channel data to headers
   */
  private async addPaymentChannelHeader(headers: Record<string, string>): Promise<void> {
    if (!this.clientState.channelId) {
      throw new Error('Channel not initialized');
    }

    try {
      let signedSubRAV: SignedSubRAV;

      if (this.subRAVCache.hasPending()) {
        // Sign the pending SubRAV
        const pendingSubRAV = this.subRAVCache.takePending()!;
        
        // Check amount limit if configured
        if (this.options.maxAmount && pendingSubRAV.accumulatedAmount > this.options.maxAmount) {
          throw new Error(`Payment amount ${pendingSubRAV.accumulatedAmount} exceeds maximum allowed ${this.options.maxAmount}`);
        }
        
        signedSubRAV = await this.payerClient.signSubRAV(pendingSubRAV, {
          maxAmount: this.options.maxAmount
        });
        this.log('Signed pending SubRAV:', pendingSubRAV.nonce, pendingSubRAV.accumulatedAmount);
      } else {
        // First request or handshake - create nonce=0, amount=0 SubRAV manually
        const channelInfo = await this.payerClient.getChannelInfo(this.clientState.channelId);
        const signer = this.options.signer;
        
        const keyIds = await signer.listKeyIds();
        const vmIdFragment = keyIds[0]?.split('#')[1] || 'key1'; // Extract fragment part
        
        const handshakeSubRAV: SubRAV = {
          version: 1,
          chainId: BigInt(4), // Based on network configuration - should be made configurable
          channelId: this.clientState.channelId,
          channelEpoch: channelInfo.epoch,
          vmIdFragment,
          accumulatedAmount: BigInt(0),
          nonce: BigInt(0)
        };
        
        signedSubRAV = await this.payerClient.signSubRAV(handshakeSubRAV);
        this.log('Created handshake SubRAV:', handshakeSubRAV.nonce);
      }

      // Encode to header
      const codec = new HttpPaymentCodec();
      const headerValue = codec.encode(signedSubRAV);
      headers[HttpPaymentCodec.getHeaderName()] = headerValue;
      
    } catch (error) {
      this.handleError('Failed to add payment channel header', error);
      throw error;
    }
  }

  /**
   * Execute the HTTP request with payment channel logic
   */
  private async executeRequest(
    context: PaymentRequestContext, 
    init?: RequestInit
  ): Promise<Response> {
    try {
      // Extract headers from init to avoid overriding context.headers
      const { headers: _, ...initWithoutHeaders } = init || {};
      
      const response = await this.fetchImpl(context.url, {
        method: context.method,
        headers: context.headers,
        body: context.body,
        ...initWithoutHeaders
      });

      await this.handleResponse(response);
      return response;
      
    } catch (error) {
      this.handleError('Request failed', error);
      throw error;
    }
  }

  /**
   * Handle the HTTP response and extract payment data
   */
  private async handleResponse(response: Response): Promise<void> {
    // Extract payment channel data from response headers
    const paymentHeader = response.headers.get(HttpPaymentCodec.getHeaderName());
    
    if (paymentHeader) {
      try {
        const responsePayload = HttpPaymentCodec.parseResponseHeader(paymentHeader);
        
        if (responsePayload.subRav) {
          // Cache the unsigned SubRAV for the next request
          this.subRAVCache.setPending(responsePayload.subRav);
          this.log('Cached new unsigned SubRAV:', responsePayload.subRav.nonce);
        }
        
        if (responsePayload.serviceTxRef) {
          this.log('Received service transaction reference:', responsePayload.serviceTxRef);
        }
      } catch (error) {
        this.log('Failed to parse payment response header:', error);
      }
    }

    // Handle payment-related status codes
    if (response.status === 402) {
      this.log('Payment required (402) - clearing cache and retrying');
      this.subRAVCache.clear();
      throw new Error('Payment required - insufficient balance or invalid proposal');
    }
    
    if (response.status === 409) {
      this.log('SubRAV conflict (409) - resetting handshake');
      this.subRAVCache.clear();
      this.clientState.isHandshakeComplete = false;
      this.state = ClientState.HANDSHAKE;
      throw new Error('SubRAV conflict - need to re-handshake');
    }

    // Mark handshake as complete after first successful response
    if (!this.clientState.isHandshakeComplete && response.ok) {
      this.clientState.isHandshakeComplete = true;
      this.state = ClientState.READY;
      this.log('Handshake completed successfully');
    }
  }

  /**
   * Parse JSON response with error handling
   */
  private async parseJsonResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Response is not JSON');
    }

    try {
      return await response.json();
    } catch (error) {
      throw new Error('Failed to parse JSON response');
    }
  }

  /**
   * Handle errors with optional custom error handler
   */
  private handleError(message: string, error: unknown): void {
    const errorMessage = `${message}: ${error instanceof Error ? error.message : String(error)}`;
    
    if (this.options.onError) {
      this.options.onError(new Error(errorMessage));
    }
    
    if (this.options.debug) {
      console.error('PaymentChannelHttpClient error:', errorMessage);
    }
  }

  /**
   * Debug logging
   */
  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[PaymentChannelHttpClient]', ...args);
    }
  }
}