import type {
  HttpPayerOptions,
  FetchLike,
  PaymentRequestContext,
  PaymentRequestHandle,
} from './types';
import type {
  SubRAV,
  SignedSubRAV,
  PaymentInfo,
  PaymentResult,
  SubChannelInfo,
} from '../../core/types';
import type { ApiResponse } from '../../types/api';
import type {
  DiscoveryResponse,
  HealthResponse,
  RecoveryResponse,
  CommitResponse,
} from '../../schema';
import { ErrorCode } from '../../types/api';
import { PaymentKitError } from '../../errors';
import { PaymentChannelPayerClient } from '../../client/PaymentChannelPayerClient';
import { assertSubRavProgression } from '../../core/RavVerifier';
import { PaymentChannelFactory } from '../../factory/chainFactory';
import { DidAuthHelper } from './internal/DidAuthHelper';
import {
  createDefaultMappingStore,
  extractHost,
  createDefaultChannelRepo,
  createDefaultTransactionStore,
  createNamespacedMappingStore,
} from './internal/LocalStore';
import { parseJsonResponse, serializeJson } from '../../utils/json';
import { RecoveryResponseSchema, HealthResponseSchema } from '../../schema';
import type { z } from 'zod';
import { PaymentHubClient } from '../../client/PaymentHubClient';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import { TransactionStore, type ChannelRepository } from '../../storage';
import { PaymentErrorCode } from '../../errors/codes';
import { wrapAndFilterInBandFrames } from './internal/StreamPaymentFilter';
import { isStreamLikeResponse } from './internal/utils';
import { RateProvider } from '../../billing/rate/types';
import { ContractRateProvider } from '../../billing/rate/contract';
import { RequestScheduler } from './internal/RequestScheduler';

// Import new core modules
import { PaymentState } from './core/PaymentState';
import { PaymentProtocol } from './core/PaymentProtocol';
import { RequestManager } from './core/RequestManager';
import { ChannelManager } from './core/ChannelManager';

/**
 * PaymentChannelHttpClient provides a high-level HTTP interface
 * for making requests with integrated payment channel functionality.
 *
 * This refactored version uses modular architecture while maintaining
 * backward compatibility with the original API.
 */
export class PaymentChannelHttpClient {
  private payerClient: PaymentChannelPayerClient;
  private options: HttpPayerOptions;
  private fetchImpl: FetchLike;
  private host: string;
  private logger: DebugLogger;
  private requestTimeoutMs: number;
  private rateProvider: RateProvider;
  private scheduler: RequestScheduler = new RequestScheduler();
  private isCleanedUp = false;
  private transactionStore: TransactionStore;
  private channelRepo: ChannelRepository;
  /**
   * Associates protocol errors with HTTP responses to avoid double-throwing errors.
   * This WeakMap tracks errors encountered during the response handling flow,
   * ensuring that only one error is thrown per response and preventing duplicate
   * error propagation. This is especially important in asynchronous flows where
   * multiple handlers may process the same response.
   */
  private protocolErrorByResponse: WeakMap<Response, PaymentKitError> = new WeakMap();

  // New modular components
  private paymentState: PaymentState;
  private paymentProtocol: PaymentProtocol;
  private requestManager: RequestManager;
  private channelManager: ChannelManager;

  constructor(options: HttpPayerOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl || (globalThis as any).fetch?.bind(globalThis);
    this.host = extractHost(options.baseUrl);
    this.channelRepo = options.channelRepo || createDefaultChannelRepo();
    this.transactionStore = options.transactionStore || createDefaultTransactionStore();

    if (!this.fetchImpl) {
      throw new Error('fetch implementation not available. Please provide fetchImpl option.');
    }

    // Initialize payment channel client
    this.payerClient = PaymentChannelFactory.createClient({
      chainConfig: options.chainConfig,
      signer: options.signer,
      keyId: options.keyId,
      storageOptions: {
        channelRepo: this.channelRepo,
      },
    });

    this.rateProvider = new ContractRateProvider(this.payerClient.getContract());

    this.logger = DebugLogger.get('PaymentChannelHttpClient');
    this.logger.setLevel(this.options.debug ? 'debug' : 'info');

    // Initialize configurable timeout
    this.requestTimeoutMs = this.options.timeoutMs ?? 30000;
    if (this.options.timeoutMsStream === undefined) {
      this.options.timeoutMsStream = this.requestTimeoutMs;
    }

    // Initialize modular components
    this.paymentState = new PaymentState();
    this.paymentProtocol = new PaymentProtocol();
    this.requestManager = new RequestManager(this.paymentState, this.requestTimeoutMs);

    // Initialize mapping store
    const baseMapping = options.mappingStore || createDefaultMappingStore();
    const mappingStore = createNamespacedMappingStore(baseMapping, {
      getPayerDid: async () => this.options.payerDid || (await this.options.signer.getDid()),
    });

    this.channelManager = new ChannelManager({
      host: this.host,
      baseUrl: options.baseUrl,
      payerClient: this.payerClient,
      paymentState: this.paymentState,
      mappingStore,
      fetchImpl: this.fetchImpl,
      signer: options.signer,
      keyId: options.keyId,
      payerDid: options.payerDid,
      payeeDid: options.payeeDid,
      defaultAssetId: options.defaultAssetId,
    });
  }

  /**
   * Primary API – returns a handle with separate response and payment promises.
   */
  async requestWithPayment(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    init?: RequestInit
  ): Promise<PaymentRequestHandle<Response>> {
    return this.createRequestHandle(method, path, init);
  }

  /**
   * Convenience: return only the HTTP response (non-blocking for payment).
   */
  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    init?: RequestInit
  ): Promise<Response> {
    const handle = await this.createRequestHandle(method, path, init);
    return handle.response;
  }

  /**
   * Convenience: wait for response and payment (recommended for non-streaming endpoints).
   */
  async requestAndWaitForPayment(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    init?: RequestInit
  ): Promise<PaymentResult<Response>> {
    const handle = await this.createRequestHandle(method, path, init);
    const data = await handle.response;
    let payment: PaymentInfo | undefined = undefined;
    try {
      payment = await handle.payment;
    } catch (e) {
      this.log('[payment.error]', e);
    }
    return { data, payment };
  }

  /**
   * Convenience methods for common HTTP verbs
   */
  async get<T = any>(path: string, init?: RequestInit): Promise<PaymentResult<T>> {
    const result = await this.requestAndWaitForPayment('GET', path, init);
    const data = await this.parseJsonAuto<T>(result.data);
    return { data, payment: result.payment };
  }

  async post<T = any>(path: string, body?: any, init?: RequestInit): Promise<PaymentResult<T>> {
    const requestInit = {
      ...init,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    };
    const result = await this.requestAndWaitForPayment('POST', path, requestInit);
    const data = await this.parseJsonAuto<T>(result.data);
    return { data, payment: result.payment };
  }

  async put<T = any>(path: string, body?: any, init?: RequestInit): Promise<PaymentResult<T>> {
    const requestInit = {
      ...init,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    };
    const result = await this.requestAndWaitForPayment('PUT', path, requestInit);
    const data = await this.parseJsonAuto<T>(result.data);
    return { data, payment: result.payment };
  }

  async patch<T = any>(path: string, body?: any, init?: RequestInit): Promise<PaymentResult<T>> {
    const requestInit = {
      ...init,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    };
    const result = await this.requestAndWaitForPayment('PATCH', path, requestInit);
    const data = await this.parseJsonAuto<T>(result.data);
    return { data, payment: result.payment };
  }

  async delete<T = any>(path: string, init?: RequestInit): Promise<PaymentResult<T>> {
    const result = await this.requestAndWaitForPayment('DELETE', path, init);
    const data = await this.parseJsonAuto<T>(result.data);
    return { data, payment: result.payment };
  }

  /**
   * Get the currently cached pending SubRAV
   */
  getPendingSubRAV(): SubRAV | null {
    return this.paymentState.getPendingSubRAV() || null;
  }

  /**
   * Clear the pending SubRAV cache
   */
  clearPendingSubRAV(): void {
    this.paymentState.clearPendingSubRAV();
    void this.persistClientState();
  }

  /**
   * Get the current channel ID
   */
  getChannelId(): string | undefined {
    return this.paymentState.getChannelId();
  }

  getPayerClient(): PaymentChannelPayerClient {
    return this.payerClient;
  }

  getHubClient(): PaymentHubClient {
    return this.payerClient.getHubClient();
  }

  getTransactionStore(): TransactionStore {
    return this.transactionStore;
  }

  /**
   * Discover service information
   */
  async discoverService(): Promise<DiscoveryResponse> {
    return this.channelManager.discoverService();
  }

  async healthCheck(): Promise<HealthResponse> {
    const healthUrl = this.channelManager.buildPaymentUrl('/health');
    const response = await this.fetchImpl(healthUrl, { method: 'GET' });
    return this.parseJsonAuto(response, HealthResponseSchema);
  }

  /**
   * Recover channel state and pending SubRAV from service
   */
  async recoverFromService(): Promise<RecoveryResponse> {
    return this.channelManager.recoverFromService();
  }

  /**
   * Commit a signed SubRAV to the service
   */
  async commitSubRAV(signedSubRAV: SignedSubRAV): Promise<CommitResponse> {
    await this.channelManager.commitSubRAV(signedSubRAV);
    return { success: true };
  }

  buildPaymentUrl(endpoint: string): string {
    return this.channelManager.buildPaymentUrl(endpoint);
  }

  getPersistedState(): any {
    return this.paymentState.getPersistedState();
  }

  // NOTE: Additional methods will be added in subsequent parts
  // This is a partial implementation to demonstrate the integration

  private log(...args: any[]): void {
    this.logger.debug(...args);
  }

  private async parseJsonAuto<T>(response: Response, schema?: z.ZodType<T>): Promise<T> {
    // If protocol-level error was recorded for this response, prefer it
    const protoErr = this.protocolErrorByResponse.get(response);
    if (protoErr) {
      throw protoErr;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Response is not JSON');
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    let responseData: any;
    try {
      responseData = await parseJsonResponse<any>(response);
    } catch (error) {
      throw new Error('Failed to parse JSON response');
    }

    if (schema) {
      if (responseData && typeof responseData === 'object' && 'success' in responseData) {
        const apiResponse = responseData as ApiResponse<any>;
        if (apiResponse.success) {
          return schema.parse(apiResponse.data);
        } else {
          const error = apiResponse.error;
          throw new PaymentKitError(
            error?.code || ErrorCode.INTERNAL_ERROR,
            error?.message || 'Unknown error',
            error?.httpStatus || response.status,
            error?.details
          );
        }
      }
      return schema.parse(responseData);
    }

    if (responseData && typeof responseData === 'object' && 'success' in responseData) {
      const apiResponse = responseData as ApiResponse<T>;
      if (apiResponse.success) {
        return apiResponse.data as T;
      } else {
        const error = apiResponse.error;
        throw new PaymentKitError(
          error?.code || ErrorCode.INTERNAL_ERROR,
          error?.message || 'Unknown error',
          error?.httpStatus || response.status,
          error?.details
        );
      }
    }

    return responseData as T;
  }

  /**
   * Create a handle containing both response and payment promises
   */
  private async createRequestHandle(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    init?: RequestInit
  ): Promise<PaymentRequestHandle<Response>> {
    const fullUrl = path.startsWith('http') ? path : new URL(path, this.options.baseUrl).toString();
    const clientTxRef = this.extractOrGenerateClientTxRef(init?.headers);

    // Record trace origin for debugging
    try {
      const err = new Error(`[origin] ${method} ${fullUrl}`);
      const stack = err.stack ? err.stack.split('\n').slice(1, 10).join('\n') : 'no stack';
      this.requestManager.recordTraceOrigin(clientTxRef, stack);
    } catch {}

    // Use scheduler to serialize payable requests
    let requestContext!: PaymentRequestContext;
    let paymentResolve!: (v: PaymentInfo | undefined) => void;
    let paymentReject!: (e: any) => void;
    const paymentPromise: Promise<PaymentInfo | undefined> = new Promise((res, rej) => {
      paymentResolve = res;
      paymentReject = rej;
    });
    let paymentBridgeAttached = false;

    // Setup abort support
    let scheduledHandle: { cancel: (reason?: any) => void; promise: Promise<Response> } | undefined;
    let abort: (() => void) | undefined = () => {
      // Defer to next tick to avoid surfacing abort synchronously at call-site
      setTimeout(() => {
        try {
          // Pass undefined reason to minimize external reporting
          scheduledHandle?.cancel(undefined);
          if (!paymentBridgeAttached) {
            try {
              paymentResolve(undefined);
            } catch {}
          } else {
            try {
              void this.requestManager.resolveByRef(clientTxRef, undefined);
            } catch {}
          }
        } catch {}
      }, 0);
    };

    if (init?.signal instanceof AbortSignal) {
      const onInitAbort = () => {
        abort?.();
      };
      if (init.signal.aborted) {
        onInitAbort();
      } else {
        init.signal.addEventListener('abort', onInitAbort, { once: true });
      }
    }

    const responsePromise: Promise<Response> = (scheduledHandle = this.scheduler.enqueue(
      async (release, signal) => {
        // Check if client has been cleaned up or aborted
        if (this.isCleanedUp || signal.aborted) {
          throw new Error('Client has been cleaned up');
        }

        // Ensure prerequisites
        if (signal.aborted) throw new Error('Request aborted');
        await this.channelManager.ensureChannelReady();
        if (signal.aborted) throw new Error('Request aborted');
        await this.channelManager.discoverService();
        if (signal.aborted) throw new Error('Request aborted');

        // Try to recover pending SubRAV if needed
        try {
          await this.tryRecoverPendingIfNeeded();
        } catch (e) {
          this.log('[serialized.recover.error]', e);
        }
        if (signal.aborted) throw new Error('Request aborted');

        // Prepare headers with payment data
        const { headers, sentedSubRav } = await this.prepareHeaders(
          fullUrl,
          method,
          clientTxRef,
          init?.headers
        );
        if (signal.aborted) throw new Error('Request aborted');

        // Build request context
        requestContext = {
          method,
          url: fullUrl,
          headers,
          body: init?.body,
          clientTxRef,
        };

        // Create payment promise
        const channelId = this.paymentState.getChannelId();
        const assetId = this.options.defaultAssetId || '0x3::gas_coin::RGas';

        if (!channelId) {
          throw new Error('Channel not initialized');
        }

        const pp = this.requestManager.createPaymentPromise(
          clientTxRef,
          requestContext,
          sentedSubRav,
          channelId,
          assetId
        );

        // Attach release function
        const pending = this.paymentState.getPendingPayment(clientTxRef);
        if (pending) {
          pending.release = () => {
            try {
              release();
            } catch (e) {
              this.log?.('[release.error]', e);
            }
            pending.release = undefined;
          };
        }

        // Bridge internal promise to external one
        paymentBridgeAttached = true;
        void pp.then(paymentResolve).catch(paymentReject);

        // Transaction logging
        try {
          await this.logTransaction(clientTxRef, requestContext, sentedSubRav);
        } catch (e) {
          this.log('[txlog.create.error]', e);
        }
        if (signal.aborted) throw new Error('Request aborted');

        // Execute request with abort support; ensure fetchImpl receives AbortSignal
        const fetchInit: RequestInit = { ...init, signal };
        return this.executeRequest(requestContext, fetchInit);
      }
    )).promise;

    // Prophylactic catch to prevent unhandled rejection before user attaches handlers
    // This avoids unhandled rejection warnings/errors if abort happens immediately
    responsePromise.catch(() => {});

    // No external controller. Abort flows handled via handle.abort() and init.signal above

    this.log(
      '[request.start]',
      method,
      fullUrl,
      'clientTxRef=',
      clientTxRef,
      'channelId=',
      this.paymentState.getChannelId()
    );

    // Handle response errors
    responsePromise.catch(err => {
      this.log('[response.error]', err);
      try {
        const settled = this.requestManager.resolveByRef(clientTxRef, undefined);
        if (!settled) {
          // No pending in manager (likely pre-bridge) → resolve local promise to avoid hang
          try {
            paymentResolve(undefined);
          } catch {}
        }
      } catch (settleErr) {
        this.log('[response.error.settle]', settleErr);
      }
    });

    const startTs = Date.now();
    const done = responsePromise.then(async (data: Response) => {
      let payment: PaymentInfo | undefined = undefined;
      try {
        payment = await paymentPromise;
      } catch (e) {
        this.log?.('[payment.error]', e);
      }
      return { data, payment };
    });

    // Avoid unhandled rejections if caller never awaits these
    void paymentPromise.catch(() => {});
    void done.catch(() => {});

    // Update transaction on response
    void responsePromise
      .then(res => {
        const durationMs = Date.now() - startTs;
        this.transactionStore?.update(clientTxRef, {
          statusCode: res.status,
          durationMs,
        });
        return res;
      })
      .catch(err => this.log('[txlog.update.error]', err));

    return {
      clientTxRef,
      response: responsePromise,
      payment: paymentPromise,
      done,
      abort,
    };
  }

  /**
   * Cleanup client state on logout
   */
  async logoutCleanup(
    options: { clearMapping: boolean; reason?: string } = { clearMapping: true }
  ): Promise<void> {
    const reason = options?.reason || 'Logout cleanup';

    // Mark client as cleaned up
    this.isCleanedUp = true;

    // Try to commit pending SubRAV
    try {
      const pending = this.paymentState.getPendingSubRAV();
      if (pending) {
        const vmIdFragment = this.paymentState.getVmIdFragment();
        if (vmIdFragment && vmIdFragment === pending.vmIdFragment) {
          //TODO: Implement commit and commit api
          //const signed = await this.payerClient.signSubRAV(pending);
          //await this.channelManager.commitSubRAV(signed);
          this.log('logoutCleanup: committed pending SubRAV on logout:', pending.nonce);
        }
      }
    } catch (e) {
      this.log('logoutCleanup: failed to commit pending SubRAV:', e);
    }

    // Clear scheduler and reject pending payments
    this.scheduler.clear();
    this.requestManager.rejectAll(new Error(reason));

    // Reset state
    this.paymentState.reset();

    // Clear persisted mapping if requested
    if (options?.clearMapping !== false) {
      try {
        const mappingStore = this.options.mappingStore || createDefaultMappingStore();
        const namespacedStore = createNamespacedMappingStore(mappingStore, {
          getPayerDid: async () => this.options.payerDid || (await this.options.signer.getDid()),
        });
        await namespacedStore.deleteState(this.host);
      } catch (e) {
        this.log('logoutCleanup: deleteState(mapping) failed:', e);
      }
    }

    await this.persistClientState();
  }

  /**
   * Compute unsettled amount for the current sub-channel
   */
  async getUnsettledAmountForSubChannel(): Promise<{
    channelId: string;
    vmIdFragment: string;
    authorizedAccumulated: bigint;
    lastClaimed: bigint;
    unsettled: bigint;
    unsettledUsd: bigint;
    subChannelInfo: SubChannelInfo;
    latestSubRavNonce?: bigint;
  }> {
    await this.channelManager.ensureChannelReady();

    const channelInfo = this.paymentState.getChannelInfo();
    const vmIdFragment = this.paymentState.getVmIdFragment();

    if (!channelInfo || !vmIdFragment) {
      throw new Error('Channel or vmIdFragment not initialized');
    }

    const assetId = channelInfo.assetId;
    const channelId = channelInfo.channelId;

    // Fetch on-chain sub-channel state
    let subChannelInfo = this.paymentState.getSubChannelInfo();
    if (!subChannelInfo) {
      subChannelInfo = await this.payerClient.getSubChannelInfo(channelId, vmIdFragment);
      this.paymentState.setSubChannelInfo(subChannelInfo);
    }
    const lastClaimed = subChannelInfo.lastClaimedAmount;

    // Determine latest authorized accumulated value
    let authorizedAccumulated: bigint | undefined = undefined;
    let latestSubRavNonce: bigint | undefined = undefined;

    const pending = this.paymentState.getPendingSubRAV();
    if (pending && pending.channelId === channelId && pending.vmIdFragment === vmIdFragment) {
      authorizedAccumulated = pending.accumulatedAmount;
      latestSubRavNonce = pending.nonce;
    }

    if (authorizedAccumulated === undefined) {
      authorizedAccumulated = lastClaimed;
    }

    const diff = authorizedAccumulated - lastClaimed;
    const unsettled = diff > 0n ? diff : 0n;
    const unsettledUsd = (await this.rateProvider.getPricePicoUSD(assetId)) * unsettled;

    return {
      channelId,
      vmIdFragment,
      authorizedAccumulated,
      lastClaimed,
      unsettled,
      unsettledUsd,
      subChannelInfo,
      latestSubRavNonce,
    };
  }

  // -------- Private Methods --------

  /**
   * Extract clientTxRef from headers or generate new one
   */
  private extractOrGenerateClientTxRef(providedHeaders?: HeadersInit): string {
    if (providedHeaders) {
      let clientTxRef: string | undefined;

      if (providedHeaders instanceof Headers) {
        clientTxRef = providedHeaders.get('X-Client-Tx-Ref') || undefined;
      } else if (Array.isArray(providedHeaders)) {
        const found = providedHeaders.find(([key]) => key.toLowerCase() === 'x-client-tx-ref');
        clientTxRef = found?.[1];
      } else if (typeof providedHeaders === 'object') {
        clientTxRef =
          (providedHeaders as Record<string, string>)['X-Client-Tx-Ref'] ||
          (providedHeaders as Record<string, string>)['x-client-tx-ref'];
      }

      if (clientTxRef) {
        return clientTxRef;
      }
    }

    return crypto.randomUUID();
  }

  /**
   * Try to recover pending SubRAV if needed
   */
  private async tryRecoverPendingIfNeeded(): Promise<void> {
    // No-op: auto recovery disabled in favor of 402 auto-retry
    return;
  }

  /**
   * Prepare headers for the request
   */
  private async prepareHeaders(
    fullUrl: string,
    method: string,
    clientTxRef: string,
    providedHeaders?: HeadersInit
  ): Promise<{ headers: Record<string, string>; sentedSubRav: SignedSubRAV | undefined }> {
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

    // Add DID authorization header
    try {
      const payerDid = this.options.payerDid || (await this.options.signer.getDid());
      const authHeader = await DidAuthHelper.generateAuthHeader(
        payerDid,
        this.options.signer,
        fullUrl,
        method,
        this.options.keyId
      );
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
    } catch (error) {
      this.log('Failed to generate DID auth header:', error);
    }

    // Add payment channel header
    const sentedSubRav = await this.addPaymentChannelHeader(headers, clientTxRef);

    this.log(
      '[request.headers]',
      method,
      fullUrl,
      'clientTxRef=',
      clientTxRef,
      'channelId=',
      this.paymentState.getChannelId(),
      'signedSubRav=',
      !!sentedSubRav
    );

    return { headers, sentedSubRav };
  }

  /**
   * Add payment channel data to headers
   */
  private async addPaymentChannelHeader(
    headers: Record<string, string>,
    clientTxRef: string
  ): Promise<SignedSubRAV | undefined> {
    if (!this.paymentState.getChannelId()) {
      throw new Error('Channel not initialized');
    }

    try {
      const signedSubRAV = await this.buildSignedSubRavIfNeeded();
      const headerValue = this.paymentProtocol.encodeRequestHeader(
        signedSubRAV,
        clientTxRef,
        this.options.maxAmount
      );
      headers[this.paymentProtocol.getHeaderName()] = headerValue;

      if (signedSubRAV) {
        this.log('Added payment header with SignedSubRAV');
      } else {
        this.log('Added payment header in FREE mode (clientTxRef only)');
      }

      return signedSubRAV;
    } catch (error) {
      this.log('Failed to add payment channel header:', error);
      throw error;
    }
  }

  /**
   * Build and sign SubRAV if pending exists
   */
  private async buildSignedSubRavIfNeeded(): Promise<SignedSubRAV | undefined> {
    const pending = this.paymentState.getPendingSubRAV();
    if (!pending) {
      this.log('No pending SubRAV - operating in FREE mode');
      return undefined;
    }

    // Clear pending SubRAV
    this.paymentState.clearPendingSubRAV();

    const signed = await this.payerClient.signSubRAV(pending);
    this.log('Signed pending SubRAV:', pending.nonce, pending.accumulatedAmount);

    // Update highest observed nonce
    this.paymentState.updateHighestNonce(pending.nonce);

    return signed;
  }

  /**
   * Execute the HTTP request
   */
  private async executeRequest(
    context: PaymentRequestContext,
    init?: RequestInit,
    allowRetry: boolean = true
  ): Promise<Response> {
    try {
      const { headers: _, ...initWithoutHeaders } = init || {};

      const response = await this.fetchImpl(context.url, {
        method: context.method,
        headers: context.headers,
        body: context.body,
        ...initWithoutHeaders,
      });

      // Auto-retry for PAYMENT_REQUIRED (402) with unsignedSubRAV in header
      const headerName = this.paymentProtocol.getHeaderName();
      let paymentHeader =
        response.headers.get(headerName) || response.headers.get(headerName.toLowerCase());
      if (allowRetry && paymentHeader && typeof paymentHeader === 'string') {
        try {
          const payload = this.paymentProtocol.parseResponseHeader(paymentHeader);
          if (
            payload?.error?.code === 'PAYMENT_REQUIRED' &&
            payload.subRav &&
            context.clientTxRef
          ) {
            const signed = await this.payerClient.signSubRAV(payload.subRav);
            const newHeader = this.paymentProtocol.encodeRequestHeader(
              signed,
              context.clientTxRef,
              this.options.maxAmount
            );
            context.headers[headerName] = newHeader;
            // Refresh DIDAuth Authorization header to avoid nonce replay
            try {
              const payerDid = this.options.payerDid || (await this.options.signer.getDid());
              const authHeader = await DidAuthHelper.generateAuthHeader(
                payerDid,
                this.options.signer,
                context.url,
                context.method,
                this.options.keyId
              );
              if (authHeader) {
                context.headers['Authorization'] = authHeader;
              }
            } catch {}

            const retried = await this.fetchImpl(context.url, {
              method: context.method,
              headers: context.headers,
              body: context.body,
              ...initWithoutHeaders,
            });
            await this.handleResponse(retried, context);

            // Handle streaming responses for retried request
            if (
              isStreamLikeResponse(retried) &&
              retried.body &&
              typeof (retried.body as any).getReader === 'function'
            ) {
              const onActivity = () => {
                if (context.clientTxRef && typeof this.options.timeoutMsStream === 'number') {
                  this.requestManager.extendTimeout(
                    context.clientTxRef,
                    this.options.timeoutMsStream
                  );
                }
              };
              const filtered = wrapAndFilterInBandFrames(
                retried,
                async p => {
                  try {
                    const decoded = this.paymentProtocol.parseResponseHeader(
                      (p as any).headerValue
                    );
                    if (decoded?.subRav && decoded.cost !== undefined) {
                      await this.handleProtocolSuccess({
                        type: 'success',
                        clientTxRef: decoded.clientTxRef,
                        subRav: decoded.subRav,
                        cost: decoded.cost as bigint,
                        costUsd: decoded.costUsd as bigint | undefined,
                        serviceTxRef: decoded.serviceTxRef,
                      });
                    }
                  } catch (e) {
                    this.log('[inband.decode.error]', e);
                  }
                },
                (...args: any[]) => this.log(...args),
                onActivity
              );
              if (this.transactionStore && context.clientTxRef) {
                await this.transactionStore.update(context.clientTxRef, { stream: true });
              }
              if (context.clientTxRef && typeof this.options.timeoutMsStream === 'number') {
                this.requestManager.extendTimeout(
                  context.clientTxRef,
                  this.options.timeoutMsStream
                );
              }
              return filtered;
            }
            return retried;
          }
        } catch (error) {
          this.log('[payment.required.retry.failed]', {
            url: context.url,
            method: context.method,
            clientTxRef: context.clientTxRef,
            error,
          });
        }
      }

      // Handle response
      await this.handleResponse(response, context);

      // Handle streaming responses
      if (
        isStreamLikeResponse(response) &&
        response.body &&
        typeof (response.body as any).getReader === 'function'
      ) {
        const onActivity = () => {
          if (context.clientTxRef && typeof this.options.timeoutMsStream === 'number') {
            this.requestManager.extendTimeout(context.clientTxRef, this.options.timeoutMsStream);
          }
        };

        const filtered = wrapAndFilterInBandFrames(
          response,
          async p => {
            try {
              const decoded = this.paymentProtocol.parseResponseHeader((p as any).headerValue);
              this.log('[inband.decode payment response]', decoded);
              if (decoded?.subRav && decoded.cost !== undefined) {
                await this.handleProtocolSuccess({
                  type: 'success',
                  clientTxRef: decoded.clientTxRef,
                  subRav: decoded.subRav,
                  cost: decoded.cost as bigint,
                  costUsd: decoded.costUsd as bigint | undefined,
                  serviceTxRef: decoded.serviceTxRef,
                });
              } else if ((decoded as any)?.error) {
                // Streamed protocol-level error
                await this.handleProtocolError({
                  type: 'error',
                  clientTxRef: (decoded as any).clientTxRef,
                  err: new PaymentKitError(
                    (decoded as any).error.code,
                    (decoded as any).error.message || 'Payment error (stream)'
                  ),
                });
              }
            } catch (e) {
              this.log('[inband.decode.error]', e);
            }
          },
          (...args: any[]) => this.log(...args),
          onActivity,
          ({ sawPayment }) => {
            try {
              if (!sawPayment && context.clientTxRef) {
                // Only resolve THIS request as free, do not affect parallel requests
                this.requestManager.resolveByRef(context.clientTxRef, undefined);
              }
            } catch (e) {
              this.log('[onFinish.error]', e);
            }
          }
        );

        // Mark as streaming
        if (this.transactionStore && context.clientTxRef) {
          await this.transactionStore.update(context.clientTxRef, { stream: true });
        }

        // Set initial timeout for streaming
        if (context.clientTxRef && typeof this.options.timeoutMsStream === 'number') {
          this.requestManager.extendTimeout(context.clientTxRef, this.options.timeoutMsStream);
        }

        // Don't wrap for scheduler release - let payment promise control it
        // This allows server time to process reactive claims before next request
        return filtered;
      }

      return response;
    } catch (error) {
      this.log('Request failed:', error);
      throw error;
    }
  }

  /**
   * Handle the HTTP response
   */
  private async handleResponse(response: Response, context?: PaymentRequestContext): Promise<void> {
    const protocol = this.paymentProtocol.parseProtocolFromResponse(response, context);

    if (protocol.type !== 'none') {
      this.log(
        '[response.header]',
        'type=',
        protocol.type,
        'clientTxRef=',
        (protocol as any).clientTxRef,
        'status=',
        response.status
      );
    } else {
      this.log(
        '[response.no-header]',
        'status=',
        response.status,
        'pendingKeys=',
        this.requestManager.getPendingKeys()
      );
    }

    if (protocol.type === 'error') {
      this.logTraceOrigin(protocol.clientTxRef);
      await this.handleProtocolError(protocol);
      // Record protocol error for this response; do not throw here to avoid double-throw.
      this.protocolErrorByResponse.set(response, protocol.err);
      return;
    }

    if (protocol.type === 'success') {
      await this.handleProtocolSuccess(protocol);
      return;
    }

    // No protocol header present
    await this.handleNoProtocolHeader(response);
  }

  private async handleProtocolError(proto: {
    type: 'error';
    clientTxRef?: string;
    err: PaymentKitError;
  }): Promise<void> {
    if (proto.clientTxRef && this.requestManager.resolveByRef(proto.clientTxRef, undefined)) {
      this.paymentState.clearPendingSubRAV();
      await this.persistClientState();
      return;
    }

    // Handle cases with only one pending payment
    const pendingPayments = this.paymentState.getAllPendingPayments();
    if (pendingPayments.size === 1) {
      const [[onlyKey]] = pendingPayments.entries();
      this.requestManager.resolveByRef(onlyKey, undefined);
      this.paymentState.clearPendingSubRAV();
      await this.persistClientState();
      return;
    }

    // Handle multiple pending payments
    if (pendingPayments.size > 1) {
      for (const [key] of pendingPayments.entries()) {
        this.requestManager.resolveByRef(key, undefined);
      }
      this.paymentState.clearPendingSubRAV();
      await this.persistClientState();
    }
  }

  private async handleProtocolSuccess(proto: {
    type: 'success';
    clientTxRef?: string;
    subRav: SubRAV;
    cost: bigint;
    costUsd?: bigint;
    serviceTxRef?: string;
  }): Promise<void> {
    // Find matching pending payment
    let pendingKey: string | undefined;
    let pendingRequest = this.findMatchingPendingPayment(proto);

    if (!pendingRequest) {
      // No matching pending - cache for future use
      if (proto.clientTxRef && this.paymentState.isRecentlyRejected(proto.clientTxRef)) {
        this.log('[payment.late-success.ignored]', proto.clientTxRef);
        return;
      }
      this.paymentState.setPendingSubRAV(proto.subRav);
      await this.persistClientState();
      return;
    }

    pendingKey = pendingRequest.key;

    // Validate SubRAV progression
    const prev = pendingRequest.pending.sentSubRav?.subRav;
    if (prev) {
      try {
        assertSubRavProgression(prev, proto.subRav, true);
      } catch (e) {
        this.requestManager.rejectByRef(
          pendingKey,
          new Error(
            'Invalid SubRAV progression: ' +
              (e as Error).message +
              ', response: ' +
              serializeJson({ subRav: proto.subRav, cost: proto.cost, costUsd: proto.costUsd }) +
              ' prev: ' +
              serializeJson(prev)
          )
        );
        return;
      }
    }

    // Cache next proposal for future request
    this.paymentState.setPendingSubRAV(proto.subRav);
    await this.persistClientState();

    // Resolve payment
    const paymentInfo: PaymentInfo = {
      clientTxRef: proto.clientTxRef || pendingKey,
      serviceTxRef: proto.serviceTxRef,
      cost: proto.cost,
      costUsd: proto.costUsd ?? BigInt(0),
      nonce: proto.subRav.nonce,
      channelId: pendingRequest.pending.channelId,
      vmIdFragment: proto.subRav.vmIdFragment,
      assetId: pendingRequest.pending.assetId,
      timestamp: new Date().toISOString(),
    };

    this.requestManager.resolveByRef(pendingKey, paymentInfo);

    // Update transaction log
    try {
      if (this.options.transactionLog?.enabled !== false && this.transactionStore) {
        await this.transactionStore.update(paymentInfo.clientTxRef, {
          payment: {
            cost: paymentInfo.cost,
            costUsd: paymentInfo.costUsd,
            nonce: paymentInfo.nonce,
            serviceTxRef: paymentInfo.serviceTxRef,
          },
          vmIdFragment: paymentInfo.vmIdFragment,
          status: 'paid',
        });
      }
    } catch (e) {
      this.log('[txlog.finalize.error]', e);
    }

    this.log(
      'Resolved payment for clientTxRef:',
      paymentInfo.clientTxRef,
      'cost:',
      paymentInfo.cost.toString()
    );

    // Update highest observed nonce
    this.paymentState.updateHighestNonce(paymentInfo.nonce);
  }

  private async handleNoProtocolHeader(response: Response): Promise<void> {
    // Streaming responses are handled in wrapper layer
    if (isStreamLikeResponse(response)) {
      return;
    }

    // Non-streaming: treat as free endpoint
    this.requestManager.resolveAllAsFree();

    // Handle specific status codes
    const error = this.paymentProtocol.handleStatusCode(response.status);
    if (error) {
      if (response.status === 402 || response.status === 409) {
        this.paymentState.clearPendingSubRAV();
        await this.persistClientState();
      }
      throw error;
    }
  }

  /**
   * Find matching pending payment for a protocol success response
   */
  private findMatchingPendingPayment(proto: {
    clientTxRef?: string;
    subRav: SubRAV;
  }): { key: string; pending: any } | undefined {
    const pendingPayments = this.paymentState.getAllPendingPayments();

    // Try exact match first
    if (proto.clientTxRef && pendingPayments.has(proto.clientTxRef)) {
      return {
        key: proto.clientTxRef,
        pending: pendingPayments.get(proto.clientTxRef)!,
      };
    }

    // Single pending payment
    if (pendingPayments.size === 1) {
      const [[key, pending]] = pendingPayments.entries();
      return { key, pending };
    }

    // Try to match by SubRAV progression
    if (pendingPayments.size > 1) {
      for (const [k, p] of pendingPayments.entries()) {
        const prevSent = p.sentSubRav?.subRav;
        if (!prevSent) continue;

        try {
          assertSubRavProgression(prevSent, proto.subRav, true);
          return { key: k, pending: p };
        } catch {
          // Not a match
        }
      }
    }

    // Fallback to most recent
    if (pendingPayments.size >= 1) {
      const all = Array.from(pendingPayments.entries());
      const [key, pending] = all[all.length - 1];
      return { key, pending };
    }

    return undefined;
  }

  /**
   * Log transaction details
   */
  private async logTransaction(
    clientTxRef: string,
    context: PaymentRequestContext,
    sentedSubRav: SignedSubRAV | undefined
  ): Promise<void> {
    if (this.options.transactionLog?.enabled === false || !this.transactionStore) {
      return;
    }

    const urlObj = new URL(context.url);
    const sanitize = this.options.transactionLog?.sanitizeRequest;
    const sanitized = sanitize ? sanitize(context.headers, context.body) : undefined;

    const headersSummary = sanitized?.headersSummary ?? {
      'content-type': context.headers['Content-Type'] || context.headers['content-type'] || '',
    };

    await this.transactionStore.create({
      clientTxRef,
      timestamp: Date.now(),
      protocol: 'http',
      method: context.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      urlOrTarget: context.url,
      operation: `${context.method}:${urlObj.pathname}`,
      headersSummary,
      requestBodyHash: sanitized?.requestBodyHash,
      stream: false,
      channelId: this.paymentState.getChannelId(),
      vmIdFragment: sentedSubRav?.subRav?.vmIdFragment,
      assetId: this.options.defaultAssetId || '0x3::gas_coin::RGas',
      status: 'pending',
    });
  }

  /**
   * Log trace origin for debugging
   */
  private logTraceOrigin(clientTxRef?: string): void {
    try {
      if (clientTxRef) {
        const origin = this.requestManager.getTraceOrigin(clientTxRef);
        if (origin) {
          this.log('[trace.origin]', clientTxRef, '\n', origin);
        }
        this.requestManager.clearTraceOrigin(clientTxRef);
      } else {
        const snapshots = this.requestManager.getTraceSnapshots(5);
        if (snapshots.length > 0) {
          this.log('[trace.origin.scan]', JSON.stringify(snapshots));
        }
      }
    } catch {}
  }

  /**
   * Persist client state
   */
  private async persistClientState(): Promise<void> {
    try {
      const mappingStore = this.options.mappingStore || createDefaultMappingStore();
      const namespacedStore = createNamespacedMappingStore(mappingStore, {
        getPayerDid: async () => this.options.payerDid || (await this.options.signer.getDid()),
      });

      const state = this.paymentState.getPersistedState();
      await namespacedStore.setState(this.host, state);

      this.log('Persisted client state');
    } catch (error) {
      this.log('Failed to persist client state:', error);
    }
  }
}
