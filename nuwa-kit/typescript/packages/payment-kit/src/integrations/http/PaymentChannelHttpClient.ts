import type { 
  HttpPayerOptions, 
  FetchLike, 
  HttpClientState,
  PersistedHttpClientState,
  PaymentRequestContext,
  HostChannelMappingStore 
} from './types';
import type { SubRAV, SignedSubRAV } from '../../core/types';
import { PaymentChannelPayerClient } from '../../client/PaymentChannelPayerClient';
import { PaymentChannelFactory } from '../../factory/chainFactory';
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
  private host: string;
  private state: ClientState = ClientState.INIT;
  private clientState: HttpClientState;

  constructor(options: HttpPayerOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl || ((globalThis as any).fetch?.bind(globalThis));
    this.mappingStore = options.mappingStore || createDefaultMappingStore();
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
    return this.clientState.pendingSubRAV || null;
  }

  /**
   * Clear the pending SubRAV cache
   */
  clearPendingSubRAV(): void {
    this.clientState.pendingSubRAV = undefined;
    this.persistClientState();
  }

  /**
   * Get the current channel ID
   */
  getChannelId(): string | undefined {
    return this.clientState.channelId;
  }

  /**
   * Discover service information and get service DID
   */
  async discoverService(): Promise<{
    serviceId: string;
    serviceDid: string;
    network: string;
    defaultAssetId: string;
    defaultPricePicoUSD?: string;
  }> {
    const infoUrl = new URL('/payment-channel/info', this.options.baseUrl).toString();
    
    try {
      const response = await this.fetchImpl(infoUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to discover service info: HTTP ${response.status}`);
      }

      const serviceInfo = await response.json();
      
      if (!serviceInfo.serviceDid) {
        throw new Error('Service discovery response missing serviceDid');
      }

      this.log('Service discovery successful:', serviceInfo);
      return serviceInfo;
    } catch (error) {
      const errorMessage = `Service discovery failed: ${error instanceof Error ? error.message : String(error)}`;
      this.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Get asset price from service
   */
  async getAssetPrice(assetId: string): Promise<{
    assetId: string;
    priceUSD: string;
    pricePicoUSD: string;
    timestamp: string;
    source: string;
    lastUpdated?: string;
  }> {
    const priceUrl = new URL('/payment-channel/price', this.options.baseUrl).toString();
    
    try {
      const response = await this.fetchImpl(priceUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get asset price: HTTP ${response.status}`);
      }

      const priceInfo = await response.json();
      this.log('Asset price retrieved:', priceInfo);
      return priceInfo;
    } catch (error) {
      const errorMessage = `Asset price query failed: ${error instanceof Error ? error.message : String(error)}`;
      this.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  async healthCheck(): Promise<{
    success: boolean;
    timestamp: string;
  }> {
    const healthUrl = new URL('/payment-channel/admin/health', this.options.baseUrl).toString();
    const response = await this.fetchImpl(healthUrl, { method: 'GET' });
    return response.json();
  } 

  /**
   * Recover channel state and pending SubRAV from service
   * This requires DID authentication
   */
  async recoverFromService(): Promise<{
    channel: any | null;
    pendingSubRav: SubRAV | null;
    timestamp: string;
  }> {
    const recoveryUrl = new URL('/payment-channel/recovery', this.options.baseUrl).toString();
    
    try {
      // Generate DID auth header for authentication
      const payerDid = await this.options.signer.getDid();
      const authHeader = await DidAuthHelper.generateAuthHeader(
        payerDid,
        this.options.signer,
        recoveryUrl,
        'GET',
        this.options.keyId
      );

      const headers: Record<string, string> = {
        'Accept': 'application/json'
      };
      
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const response = await this.fetchImpl(recoveryUrl, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        console.log('Response error:', response);
        throw new Error(`Failed to recover from service: HTTP ${response.status}`);
      }

      const recoveryData = await response.json();
      
      // If there's a pending SubRAV, cache it
      if (recoveryData.pendingSubRav) {
        this.clientState.pendingSubRAV = recoveryData.pendingSubRav;
        this.log('Recovered and cached pending SubRAV:', recoveryData.pendingSubRav.nonce);
      }

      // If there's channel info, update our state
      if (recoveryData.channel) {
        this.clientState.channelId = recoveryData.channel.channelId;
        this.log('Recovered channel state:', recoveryData.channel.channelId);
      }

      // Persist the recovered state
      this.persistClientState();

      this.log('Recovery completed successfully');
      return recoveryData;
    } catch (error) {
      const errorMessage = `Recovery failed: ${error instanceof Error ? error.message : String(error)}`;
      this.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Commit a signed SubRAV to the service
   */
  async commitSubRAV(signedSubRAV: SignedSubRAV): Promise<{ success: boolean }> {
    const commitUrl = new URL('/payment-channel/commit', this.options.baseUrl).toString();
    
    try {
      // Generate DID auth header for authentication
      const payerDid = this.options.payerDid || await this.options.signer.getDid();
      const authHeader = await DidAuthHelper.generateAuthHeader(
        payerDid,
        this.options.signer,
        commitUrl,
        'POST',
        this.options.keyId
      );

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };
      
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const response = await this.fetchImpl(commitUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ subRav: signedSubRAV })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to commit SubRAV: HTTP ${response.status} - ${errorBody}`);
      }

      const result = await response.json();
      this.log('SubRAV committed successfully');
      return result;
    } catch (error) {
      const errorMessage = `SubRAV commit failed: ${error instanceof Error ? error.message : String(error)}`;
      this.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // -------- Private Methods --------

  /**
   * Ensure payment channel is ready for use
   */
  private async ensureChannelReady(): Promise<void> {
    if (this.state === ClientState.READY && this.clientState.channelId) {
      return;
    }

    // Try to load persisted state first
    await this.loadPersistedState();

    // If we still don't have a ready channel, initialize it
    if (this.state !== ClientState.READY || !this.clientState.channelId) {
      await this.initializeChannel();
    }
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
            await this.persistClientState();
            return;
          } else {
            this.log('Channel is not active, removing from store:', channelId, channelInfo.status);
            await this.mappingStore.delete(this.host);
            if (this.mappingStore.deleteState) {
              await this.mappingStore.deleteState(this.host);
            }
          }
        } catch (error) {
          this.log('Channel verification failed, removing from store:', error);
          await this.mappingStore.delete(this.host);
          if (this.mappingStore.deleteState) {
            await this.mappingStore.deleteState(this.host);
          }
        }
      }

      // Need to create a new channel
      this.log('Creating new channel...');
      
      // First, ensure the payer has sufficient funds in the hub
      const defaultAssetId = this.options.defaultAssetId || '0x3::gas_coin::RGas';
      const hubFundAmount = this.options.hubFundAmount || BigInt('1000000000'); // 10 RGas
      
      try {
        this.log('Depositing funds to hub:', hubFundAmount, 'of', defaultAssetId);
        const hubClient = this.payerClient.getHubClient();
        await hubClient.deposit(defaultAssetId, hubFundAmount);
        this.log('Hub funding completed');
      } catch (error) {
        this.log('Hub funding failed (might already have funds):', error);
        // Continue anyway - the hub might already have sufficient funds
      }
      
      // Get payee DID from options or discover from service
      let payeeDid = this.options.payeeDid;
      
      if (!payeeDid) {
        try {
          this.log('PayeeDid not provided, discovering from service...');
          const serviceInfo = await this.discoverService();
          payeeDid = serviceInfo.serviceDid;
          this.log('Discovered payeeDid from service:', payeeDid);
        } catch (error) {
          throw new Error(`PayeeDid not provided and service discovery failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      const channelInfo = await this.payerClient.openChannelWithSubChannel({
        payeeDid,
        assetId: defaultAssetId,
      });

      this.clientState.channelId = channelInfo.channelId;
      
      // Store the mapping (legacy compatibility)
      await this.mappingStore.set(this.host, channelInfo.channelId);
      
      this.state = ClientState.HANDSHAKE;
      this.log('Created new channel:', channelInfo.channelId);

      // Persist the new state
      await this.persistClientState();
      
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

      if (this.clientState.pendingSubRAV) {
        // Sign the pending SubRAV
        const pendingSubRAV = this.clientState.pendingSubRAV;
        this.clientState.pendingSubRAV = undefined; // Clear after taking
        
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
        const vmIdFragment = keyIds[0]?.split('#')[1] // Extract fragment part

        if (!vmIdFragment) {
          throw new Error('No VM ID fragment found');
        }
        
        const chainId = await this.payerClient.getChainId();
        const handshakeSubRAV: SubRAV = {
          version: 1,
          chainId: chainId,
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
          this.clientState.pendingSubRAV = responsePayload.subRav;
          this.log('Cached new unsigned SubRAV:', responsePayload.subRav.nonce);
          await this.persistClientState();
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
      this.clientState.pendingSubRAV = undefined;
      await this.persistClientState();
      throw new Error('Payment required - insufficient balance or invalid proposal');
    }
    
    if (response.status === 409) {
      this.log('SubRAV conflict (409) - resetting handshake');
      this.clientState.pendingSubRAV = undefined;
      this.clientState.isHandshakeComplete = false;
      this.state = ClientState.HANDSHAKE;
      await this.persistClientState();
      throw new Error('SubRAV conflict - need to re-handshake');
    }

    // Mark handshake as complete after first successful response
    if (!this.clientState.isHandshakeComplete && response.ok) {
      this.clientState.isHandshakeComplete = true;
      this.state = ClientState.READY;
      this.log('Handshake completed successfully');
      await this.persistClientState();
    }
  }

  /**
   * Parse JSON response with error handling
   */
  private async parseJsonResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      console.log('Response error:', response);
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
   * Load persisted client state from storage
   */
  private async loadPersistedState(): Promise<void> {
    if (!this.mappingStore.getState) {
      // Fallback to legacy method for backward compatibility
      const channelId = await this.mappingStore.get(this.host);
      if (channelId) {
        this.clientState.channelId = channelId;
        this.state = ClientState.HANDSHAKE;
        this.log('Loaded channelId from legacy storage:', channelId);
      }
      return;
    }

    try {
      const persistedState = await this.mappingStore.getState(this.host);
      if (persistedState) {
        this.clientState.channelId = persistedState.channelId;
        this.clientState.pendingSubRAV = persistedState.pendingSubRAV;
        this.clientState.isHandshakeComplete = persistedState.isHandshakeComplete;
        
        // Set appropriate state based on persisted data
        if (persistedState.isHandshakeComplete && persistedState.channelId) {
          this.state = ClientState.READY;
        } else if (persistedState.channelId) {
          this.state = ClientState.HANDSHAKE;
        }
        
        this.log('Loaded persisted client state:', {
          channelId: persistedState.channelId,
          hasPendingSubRAV: !!persistedState.pendingSubRAV,
          isHandshakeComplete: persistedState.isHandshakeComplete
        });
      }
    } catch (error) {
      this.log('Failed to load persisted state:', error);
    }
  }

  /**
   * Persist current client state to storage
   */
  private async persistClientState(): Promise<void> {
    if (!this.mappingStore.setState) {
      // Fallback to legacy method for backward compatibility
      if (this.clientState.channelId) {
        await this.mappingStore.set(this.host, this.clientState.channelId);
      }
      return;
    }

    try {
      const stateToStore: PersistedHttpClientState = {
        channelId: this.clientState.channelId,
        pendingSubRAV: this.clientState.pendingSubRAV,
        isHandshakeComplete: this.clientState.isHandshakeComplete,
        lastUpdated: new Date().toISOString()
      };

      await this.mappingStore.setState(this.host, stateToStore);
      this.log('Persisted client state');
    } catch (error) {
      this.log('Failed to persist client state:', error);
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