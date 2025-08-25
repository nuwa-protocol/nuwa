import type {
  HttpPayerOptions,
  FetchLike,
  HttpClientState,
  PersistedHttpClientState,
  PaymentRequestContext,
  HostChannelMappingStore,
  PendingPaymentRequest,
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
import { assertSubRavProgression } from '../../core/SubRavValidator';
import { PaymentChannelFactory } from '../../factory/chainFactory';
import { DidAuthHelper } from './internal/DidAuthHelper';
import { HttpPaymentCodec } from './internal/codec';
import {
  createDefaultMappingStore,
  extractHost,
  createDefaultChannelRepo,
  MemoryHostChannelMappingStore,
  createDefaultTransactionStore,
} from './internal/LocalStore';
import { parseJsonResponse, serializeJson } from '../../utils/json';
import {
  RecoveryResponseSchema,
  HealthResponseSchema,
  DiscoveryResponseSchema,
  // Also import core schemas for direct use
  ServiceDiscoverySchema,
  HealthCheckSchema,
} from '../../schema';
import type { z } from 'zod';
import { PaymentHubClient } from '../../client/PaymentHubClient';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import { MemoryChannelRepository, TransactionStore, type ChannelRepository } from '../../storage';
import { PaymentErrorCode } from '../../errors/codes';
import { wrapAndFilterInBandFrames } from './internal/StreamPaymentFilter';
import { isStreamLikeResponse } from './internal/utils';
import { createNamespacedMappingStore } from './internal/LocalStore';
import { RateProvider } from '../../billing/rate/types';
import { ContractRateProvider } from '../../billing/rate/contract';
import { RequestScheduler } from './internal/RequestScheduler';

/**
 * HTTP Client State enum for internal state management
 */
enum ClientState {
  INIT = 'INIT',
  OPENING = 'OPENING',
  READY = 'READY',
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
  private channelRepo: ChannelRepository;
  private transactionStore: TransactionStore;
  private host: string;
  private state: ClientState = ClientState.INIT;
  private clientState: HttpClientState;
  private discoveredBasePath?: string;
  private cachedDiscoveryInfo?: DiscoveryResponse;
  private logger: DebugLogger;
  // Ensure channel initialization is executed once across concurrent requests
  private ensureReadyPromise?: Promise<void>;
  // Mutex for SubRAV proposal consume/sign to avoid races under concurrency
  private subRavMutex: Promise<void> = Promise.resolve();
  // Configurable timeout for pending payment resolution
  private requestTimeoutMs: number;
  private rateProvider: RateProvider;
  private scheduler: RequestScheduler = new RequestScheduler();

  constructor(options: HttpPayerOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl || (globalThis as any).fetch?.bind(globalThis);
    const baseMapping = options.mappingStore || createDefaultMappingStore();
    this.mappingStore = createNamespacedMappingStore(baseMapping, {
      getPayerDid: async () => this.options.payerDid || (await this.options.signer.getDid()),
    });
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

    this.clientState = {
      pendingPayments: new Map(),
    };

    this.logger = DebugLogger.get('PaymentChannelHttpClient');
    this.logger.setLevel(this.options.debug ? 'debug' : 'info');
    const mappingStoreType =
      this.mappingStore instanceof MemoryHostChannelMappingStore ? 'Memory' : 'LocalStorage';
    const channelRepoType =
      this.channelRepo instanceof MemoryChannelRepository ? 'Memory' : 'IndexedDB';
    this.logger.debug(
      'PaymentChannelHttpClient initialized for host:',
      this.host,
      'using',
      mappingStoreType,
      'mapping store',
      'and',
      channelRepoType,
      'channel repo'
    );

    // Initialize configurable timeout
    this.requestTimeoutMs = this.options.timeoutMs ?? 30000;
    // Streaming timeout defaults to non-streaming timeout and is applied per-frame (idle between frames)
    if (this.options.timeoutMsStream === undefined) {
      this.options.timeoutMsStream = this.requestTimeoutMs; // per-frame idle timeout
    }
  }

  /**
   * Primary API – returns a handle with separate response and payment promises.
   * Callers can choose to await `response`, `payment`, or `done` depending on needs.
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
      // swallow payment wait errors here; callers still have the response
      this.log('[payment.error]', e);
    }
    return { data, payment };
  }

  /**
   * Create a handle containing both response and payment promises, correlated by clientTxRef.
   * Advanced callers can use this for fine-grained tracking or cancellation without changing the existing API.
   */
  private async createRequestHandle(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    init?: RequestInit
  ): Promise<PaymentRequestHandle<Response>> {
    await this.ensureKeyFragment();
    // First perform discovery if not done yet
    if (!this.cachedDiscoveryInfo) {
      await this.performDiscovery();
    }

    // Build URL - use direct construction for all paths except relative ones
    const fullUrl = path.startsWith('http') ? path : new URL(path, this.options.baseUrl).toString();

    // Ensure channel is ready
    await this.ensureChannelReady();

    // Generate or extract clientTxRef
    const clientTxRef = this.extractOrGenerateClientTxRef(init?.headers);

    // Use scheduler to serialize payable requests until next proposal is available
    let requestContext!: PaymentRequestContext;
    let paymentResolve!: (v: PaymentInfo | undefined) => void;
    let paymentReject!: (e: any) => void;
    const paymentPromise: Promise<PaymentInfo | undefined> = new Promise((res, rej) => {
      paymentResolve = res;
      paymentReject = rej;
    });

    // Setup abort support: create internal controller and bind external signal if provided
    const controller = new AbortController();
    let abort: (() => void) | undefined = () => {
      controller.abort('aborted by PaymentRequestHandle');
      try {
        this.rejectByRef(clientTxRef, new Error('Request aborted by caller'));
      } catch (e) {
        this.log('[abort.reject.error]', e);
      }
    };
    if (init?.signal instanceof AbortSignal) {
      if (init.signal.aborted) {
        controller.abort(init.signal.reason);
      } else {
        const onAbort = () => controller.abort(init.signal!.reason);
        init.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    const responsePromise: Promise<Response> = this.scheduler.enqueue(async release => {
      // Prepare headers with clientTxRef (may sign and consume pending SubRAV)
      const { headers, sentedSubRav } = await this.prepareHeaders(
        fullUrl,
        method,
        clientTxRef,
        init?.headers
      );

      // Build request context
      requestContext = {
        method,
        url: fullUrl,
        headers,
        body: init?.body,
        clientTxRef,
      };

      // Create payment promise and attach release
      const pp = this.createPaymentPromise(clientTxRef, requestContext, sentedSubRav);
      const pending = this.clientState.pendingPayments?.get(clientTxRef);
      if (pending)
        pending.release = () => {
          try {
            release();
          } catch (e) {
            this.log?.('[release.error]', e);
          }
          pending.release = undefined;
        };
      // Bridge internal promise to external one
      pp.then(paymentResolve).catch(paymentReject);

      // Transaction logging: create pending record
      try {
        if (this.options.transactionLog?.enabled !== false) {
          const store = this.transactionStore;
          if (store) {
            const urlObj = new URL(fullUrl);
            const sanitize = this.options.transactionLog?.sanitizeRequest;
            const sanitized = sanitize ? sanitize(headers, init?.body) : undefined;
            const headersSummary = sanitized?.headersSummary ?? {
              'content-type': headers['Content-Type'] || headers['content-type'] || '',
            };
            const requestBodyHash = sanitized?.requestBodyHash;
            await store.create({
              clientTxRef,
              timestamp: Date.now(),
              protocol: 'http',
              method,
              urlOrTarget: fullUrl,
              operation: `${method}:${urlObj.pathname}`,
              headersSummary,
              requestBodyHash,
              stream: false,
              channelId: this.clientState.channelId,
              vmIdFragment: sentedSubRav?.subRav?.vmIdFragment,
              assetId: this.options.defaultAssetId || '0x3::gas_coin::RGas',
              status: 'pending',
            });
          }
        }
      } catch (e) {
        this.log('[txlog.create.error]', e);
      }

      // Execute request (headers processing will happen inside executeRequest)
      // Ensure our internal AbortController's signal is used so handle.abort() cancels fetch/stream
      return this.executeRequest(requestContext, { ...init, signal: controller.signal });
    });

    // Transaction logging: create pending record
    // Note: transaction record creation moved inside scheduler before executeRequest

    this.log(
      '[request.start]',
      method,
      fullUrl,
      'clientTxRef=',
      clientTxRef,
      'channelId=',
      this.clientState.channelId
    );

    // Couple: when response promise rejects, reject the corresponding pending payment to avoid dangling
    responsePromise.catch(err => {
      this.log('[response.error]', err);
      try {
        this.rejectByRef(clientTxRef, err instanceof Error ? err : new Error(String(err)));
      } catch (rejectErr) {
        this.log('[rejectByRef.error]', rejectErr);
      }
      // In case there was no pending (e.g., FREE or already resolved), nothing to release here
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

    // Abort support configured above; responsePromise will be cancellable by abort()

    // Update transaction on response headers arrival
    responsePromise
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
   * Convenience methods for common HTTP verbs with payment info
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

  getPayerClient(): PaymentChannelPayerClient {
    return this.payerClient;
  }

  getHubClient(): PaymentHubClient {
    return this.payerClient.getHubClient();
  }

  /**
   * Compute unsettled amount for the current sub-channel (bound to this client).
   * Logic: use the latest authorized SubRAV (pending/proposed) accumulatedAmount
   * minus on-chain sub-channel lastClaimedAmount. If no pending SubRAV available,
   * falls back to on-chain state (unsettled = 0).
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
    await this.ensureChannelReady();
    await this.ensureKeyFragment();

    const channelInfo = this.clientState.channelInfo;
    const vmIdFragment = this.clientState.vmIdFragment;

    if (!channelInfo || !vmIdFragment) {
      throw new Error('Channel or vmIdFragment not initialized');
    }
    const assetId = channelInfo!.assetId;

    // Fetch on-chain sub-channel state
    let subChannelInfo = this.clientState.subChannelInfo;
    if (!subChannelInfo) {
      subChannelInfo = await this.payerClient.getSubChannelInfo(
        channelInfo.channelId,
        vmIdFragment
      );
      this.clientState.subChannelInfo = subChannelInfo;
    }
    const lastClaimed = subChannelInfo.lastClaimedAmount;

    // Determine latest authorized accumulated value
    let authorizedAccumulated: bigint | undefined = undefined;
    let latestSubRavNonce: bigint | undefined = undefined;

    const pending = this.clientState.pendingSubRAV;
    if (
      pending &&
      pending.channelId === channelInfo.channelId &&
      pending.vmIdFragment === vmIdFragment
    ) {
      authorizedAccumulated = pending.accumulatedAmount;
      latestSubRavNonce = pending.nonce;
    } else {
      // Try to recover from service to get the latest proposal
      try {
        const recovery = await this.recoverFromService();
        if (
          recovery.pendingSubRav &&
          recovery.pendingSubRav.channelId === channelInfo.channelId &&
          recovery.pendingSubRav.vmIdFragment === vmIdFragment
        ) {
          authorizedAccumulated = recovery.pendingSubRav.accumulatedAmount;
          latestSubRavNonce = recovery.pendingSubRav.nonce;
        }
      } catch (e) {
        this.log('[unsettled.recover.error]', e);
      }
      //TODO we should also get the latest signed sub-rav from the service
    }

    if (authorizedAccumulated === undefined) {
      // No local/recovered proposal; treat as fully settled
      authorizedAccumulated = lastClaimed;
    }

    const diff = authorizedAccumulated - lastClaimed;
    const unsettled = diff > 0n ? diff : 0n;
    const unsettledUsd = (await this.rateProvider.getPricePicoUSD(assetId)) * unsettled;

    return {
      channelId: channelInfo.channelId,
      vmIdFragment,
      authorizedAccumulated,
      lastClaimed,
      unsettled,
      unsettledUsd,
      subChannelInfo,
      latestSubRavNonce,
    };
  }

  getTransactionStore(): TransactionStore {
    return this.transactionStore;
  }

  /**
   * Discover service information and get service DID
   */
  async discoverService(): Promise<DiscoveryResponse> {
    // Perform discovery using the well-known endpoint if not done yet
    if (!this.cachedDiscoveryInfo) {
      await this.performDiscovery();
    }

    // Check if we have cached discovery results
    if (this.cachedDiscoveryInfo) {
      this.log('Using cached service discovery:', this.cachedDiscoveryInfo);
      return this.cachedDiscoveryInfo;
    }

    // If discovery failed, we can't proceed
    throw new Error('Service discovery failed: No discovery information available');
  }

  async healthCheck(): Promise<HealthResponse> {
    const healthUrl = this.buildPaymentUrl('/health');
    const response = await this.fetchImpl(healthUrl, { method: 'GET' });
    return this.parseJsonAuto(response, HealthResponseSchema);
  }

  /**
   * Recover channel state and pending SubRAV from service
   * This requires DID authentication
   */
  async recoverFromService(): Promise<RecoveryResponse> {
    const recoveryUrl = this.buildPaymentUrl('/recovery');

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
        Accept: 'application/json',
      };

      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const response = await this.fetchImpl(recoveryUrl, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to recover from service: HTTP ${response.status}`);
      }

      const recoveryData = (await this.parseJsonAuto(
        response,
        RecoveryResponseSchema
      )) as RecoveryResponse;
      // No side effects here; callers will apply recovery
      this.log('Recovery completed successfully (no side effects)');
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
  async commitSubRAV(signedSubRAV: SignedSubRAV): Promise<CommitResponse> {
    const commitUrl = this.buildPaymentUrl('/commit');

    try {
      // Generate DID auth header for authentication
      const payerDid = this.options.payerDid || (await this.options.signer.getDid());
      const authHeader = await DidAuthHelper.generateAuthHeader(
        payerDid,
        this.options.signer,
        commitUrl,
        'POST',
        this.options.keyId
      );

      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const response = await this.fetchImpl(commitUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ subRav: signedSubRAV }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to commit SubRAV: HTTP ${response.status} - ${errorBody}`);
      }

      const result = await this.parseJsonAuto<CommitResponse>(response);

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
    this.log(
      '🔧 ensureChannelReady called, state:',
      this.state,
      'channelId:',
      this.clientState.channelId
    );

    if (this.state === ClientState.READY && this.clientState.channelId) {
      await this.tryRecoverPendingIfNeeded();
      return;
    }

    if (!this.ensureReadyPromise) {
      this.ensureReadyPromise = this.doEnsureChannelReady().finally(() => {
        this.ensureReadyPromise = undefined;
      });
    }

    await this.ensureReadyPromise;

    // After initialization (including loading persisted state), ensure sub-channel/pending are recovered
    if (this.state === ClientState.READY && this.clientState.channelId) {
      await this.tryRecoverPendingIfNeeded();
    }
  }

  private async tryRecoverPendingIfNeeded(): Promise<void> {
    this.log('🔧 Channel already ready, checking for pending SubRAV recovery');
    if (!this.clientState.pendingSubRAV) {
      this.log('🔧 No pending SubRAV, attempting recovery from service');
      try {
        const recoveryData = await this.recoverFromService();
        this.log('🔧 Recovery response:', recoveryData);
        await this.applyRecovery(recoveryData, { authorizeIfMissing: true });
      } catch (error) {
        this.log('❌ Recovery failed in ensureChannelReady, continuing anyway:', error);
      }
    } else {
      this.log(
        '🔧 Already have pending SubRAV, no recovery needed:',
        this.clientState.pendingSubRAV.nonce
      );
      // Even if we have pending, verify sub-channel exists; if not, authorize it using vmIdFragment from pending
      try {
        if (this.clientState.channelId && this.clientState.pendingSubRAV) {
          const vmIdFragment = this.clientState.pendingSubRAV.vmIdFragment;
          await this.payerClient.getSubChannelInfo(this.clientState.channelId, vmIdFragment);
        }
      } catch {
        try {
          const vmIdFragment = this.clientState.pendingSubRAV!.vmIdFragment;
          this.log('🔧 Sub-channel not found while pending exists, authorizing:', vmIdFragment);
          await this.payerClient.authorizeSubChannel({
            channelId: this.clientState.channelId!,
            vmIdFragment,
          });
          await this.waitForSubChannelAuthorization(this.clientState.channelId!, vmIdFragment);
          this.log('✅ Sub-channel authorized while pending existed');
        } catch (e) {
          this.log('❌ Sub-channel authorization failed while pending existed:', e);
        }
      }
    }
  }

  private async doEnsureChannelReady(): Promise<void> {
    // Try to load persisted state first
    this.log('🔧 Loading persisted state for host:', this.host);
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
      // First, try to recover existing channel from server
      // This works even if we don't have channelId cached locally
      try {
        this.log('🔧 Attempting to recover channel from server');
        const recoveryData = await this.recoverFromService();
        if (recoveryData.channel) {
          await this.applyRecovery(recoveryData, {
            authorizeIfMissing: true,
            requireVmFragment: true,
          });
          this.state = ClientState.READY;
          this.log('✅ Recovered active channel from server:', recoveryData.channel.channelId);
          // Update mapping store
          await this.mappingStore.set(this.host, recoveryData.channel.channelId);
          await this.persistClientState();
          return;
        } else {
          this.log('🔧 No existing channel found on server, will create new one');
        }
      } catch (error) {
        this.log('🔧 Server recovery failed, will create new channel:', error);
      }

      this.log('Try to discover service and open channel');

      // First, ensure the payer has sufficient funds in the hub
      const defaultAssetId = this.options.defaultAssetId || '0x3::gas_coin::RGas';

      // Get payee DID from options or discover from service
      let payeeDid = this.options.payeeDid;

      if (!payeeDid) {
        try {
          this.log('PayeeDid not provided, discovering from service...');
          const serviceInfo = await this.discoverService();
          payeeDid = serviceInfo.serviceDid;
          this.log('Discovered payeeDid from service:', payeeDid);
        } catch (error) {
          throw new Error(
            `PayeeDid not provided and service discovery failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      const channelInfo = await this.payerClient.openChannelWithSubChannel({
        payeeDid,
        assetId: defaultAssetId,
      });

      this.clientState.channelId = channelInfo.channelId;
      try {
        this.clientState.channelInfo = await this.payerClient.getChannelInfo(channelInfo.channelId);
        const vm = this.clientState.vmIdFragment;
        if (vm) {
          this.clientState.subChannelInfo = await this.payerClient.getSubChannelInfo(
            channelInfo.channelId,
            vm
          );
        }
      } catch (e) {
        this.log('GetChannelInfo or GetSubChannelInfo failed:', e);
      }

      // Store the mapping (legacy compatibility)
      await this.mappingStore.set(this.host, channelInfo.channelId);

      this.state = ClientState.READY;
      this.log('Created new channel:', channelInfo.channelId);

      // Persist the new state
      this.log('🔧 Persisting client state after channel creation');
      await this.persistClientState();
    } catch (error) {
      this.handleError('Failed to initialize channel', error);
      throw error;
    }
  }

  /**
   * Extract clientTxRef from headers or generate a new one
   */
  private extractOrGenerateClientTxRef(providedHeaders?: HeadersInit): string {
    // Check if clientTxRef is provided in headers
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

    // Generate new UUID if not provided
    return crypto.randomUUID();
  }

  /**
   * Lazily resolve keyId and vmIdFragment from options or signer.listKeyIds()
   */
  private async ensureKeyFragment(): Promise<void> {
    if (this.clientState.keyId && this.clientState.vmIdFragment) return;
    let keyId = this.options.keyId;
    if (!keyId) {
      if (this.options.signer && typeof this.options.signer.listKeyIds === 'function') {
        try {
          const ids: string[] = await this.options.signer.listKeyIds();
          keyId = Array.isArray(ids) && ids.length > 0 ? ids[0] : undefined;
        } catch (e) {
          this.log('listKeyIds failed:', e);
        }
      }
    }
    if (keyId) {
      this.clientState.keyId = keyId;
      const parts = keyId.split('#');
      this.clientState.vmIdFragment = parts.length > 1 ? parts[1] : undefined;
    }
    if (!this.clientState.keyId || !this.clientState.vmIdFragment) {
      throw new Error('No keyId found');
    }
  }

  /**
   * Create a payment promise for tracking request payment info
   */
  private createPaymentPromise(
    clientTxRef: string,
    requestContext: PaymentRequestContext,
    sentedSubRav: SignedSubRAV | undefined
  ): Promise<PaymentInfo | undefined> {
    if (!this.clientState.pendingPayments) {
      this.clientState.pendingPayments = new Map();
    }

    return new Promise((resolve, reject) => {
      const defaultAssetId = this.options.defaultAssetId || '0x3::gas_coin::RGas';

      // Set timeout for cleanup (configurable)
      const timeoutId = setTimeout(() => {
        const pending = this.clientState.pendingPayments?.get(clientTxRef);
        if (pending) {
          // Ensure the scheduler queue is released on timeout to avoid deadlock
          try {
            pending.release?.();
          } catch (e) {
            this.log('[release.error]', e);
          }
          this.clientState.pendingPayments?.delete(clientTxRef);
          this.log('[payment.timeout]', 'clientTxRef=', clientTxRef, 'url=', requestContext.url);
          reject(new Error('Payment resolution timeout'));
        }
      }, this.requestTimeoutMs);

      this.clientState.pendingPayments!.set(clientTxRef, {
        resolve,
        reject,
        timestamp: new Date(),
        channelId: this.clientState.channelId!,
        assetId: defaultAssetId,
        timeoutId,
        // Bind the RAV we are about to send with this specific pending request
        sendedSubRav: sentedSubRav,
        requestContext,
      });

      this.log(
        '[payment.pending.create]',
        'clientTxRef=',
        clientTxRef,
        'url=',
        requestContext.url,
        'channelId=',
        this.clientState.channelId,
        'signedSubRav=',
        !!sentedSubRav
      );
    });
  }

  /**
   * Extend timeout for a specific pending payment (used for streaming responses)
   */
  private extendPendingTimeout(clientTxRef: string, newTimeoutMs: number): void {
    const pending = this.clientState.pendingPayments?.get(clientTxRef);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    pending.timeoutId = setTimeout(() => {
      if (this.clientState.pendingPayments?.has(clientTxRef)) {
        // Ensure the scheduler queue is released on stream idle timeout
        try {
          pending.release?.();
        } catch (e) {
          this.log('[release.error]', e);
        }
        this.clientState.pendingPayments.delete(clientTxRef);
        this.log(
          '[payment.timeout.stream]',
          'clientTxRef=',
          clientTxRef,
          'url=',
          pending.requestContext.url
        );
        pending.reject(new Error('Payment resolution timeout'));
      }
    }, newTimeoutMs);
    this.log('[payment.timeout.extend.one]', 'clientTxRef=', clientTxRef, 'ms=', newTimeoutMs);
  }

  private resolveByRef(clientTxRef: string, info: PaymentInfo | undefined): boolean {
    const pending = this.clientState.pendingPayments?.get(clientTxRef);
    if (!pending) return false;
    clearTimeout(pending.timeoutId);
    pending.resolve(info);
    this.clientState.pendingPayments?.delete(clientTxRef);
    this.log('[payment.pending.resolve]', 'clientTxRef=', clientTxRef, 'info=', info);
    return true;
  }

  private rejectByRef(clientTxRef: string, err: Error): boolean {
    const pending = this.clientState.pendingPayments?.get(clientTxRef);
    if (!pending) return false;
    clearTimeout(pending.timeoutId);
    try {
      pending.release?.();
    } catch (e) {
      this.log('[release.error]', e);
    }
    pending.reject(err);
    this.clientState.pendingPayments?.delete(clientTxRef);
    this.log('[payment.pending.reject]', 'clientTxRef=', clientTxRef, 'error=', err.message);
    return true;
  }

  private resolveAllPendingAsFree(): void {
    if (!this.clientState.pendingPayments) return;
    const keys: string[] = [];
    for (const [key, pending] of this.clientState.pendingPayments.entries()) {
      clearTimeout(pending.timeoutId);
      try {
        pending.release?.();
      } catch (e) {
        this.log('[release.error]', e);
      }
      pending.resolve(undefined);
      this.clientState.pendingPayments.delete(key);
      keys.push(key);
    }
    if (keys.length > 0) {
      this.log(
        '[payment.pending.free]',
        'resolved',
        keys.length,
        'requests as free',
        'keys=',
        keys
      );
    }
  }

  private pendingKeys(): string[] {
    return this.clientState.pendingPayments
      ? Array.from(this.clientState.pendingPayments.keys())
      : [];
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

    // Add DID authorization header if signer is available
    try {
      const payerDid = this.options.payerDid || (await this.options.signer.getDid());
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

    // Add payment channel header with clientTxRef and return the actual SubRAV used
    const sentedSubRav = await this.addPaymentChannelHeader(headers, clientTxRef);

    this.log(
      '[request.headers]',
      method,
      fullUrl,
      'clientTxRef=',
      clientTxRef,
      'channelId=',
      this.clientState.channelId,
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
    clientTxRef?: string
  ): Promise<SignedSubRAV | undefined> {
    if (!this.clientState.channelId) {
      throw new Error('Channel not initialized');
    }

    // clientTxRef is now required
    if (!clientTxRef) {
      throw new Error('clientTxRef is required for payment header');
    }

    try {
      const signedSubRAV = await this.buildSignedSubRavIfNeeded();

      // Always send payment header (with or without signedSubRAV) to include clientTxRef
      const headerValue = this.encodePaymentHeader(signedSubRAV, clientTxRef);
      headers[HttpPaymentCodec.getHeaderName()] = headerValue;

      if (signedSubRAV) {
        this.log('Added payment header with SignedSubRAV');
      } else {
        this.log('Added payment header in FREE mode (clientTxRef only)');
      }

      return signedSubRAV;
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
        ...initWithoutHeaders,
      });

      // Handle headers first
      await this.handleResponse(response);

      // For streaming responses, wrap and filter in-band frames so app sees clean business stream
      if (
        isStreamLikeResponse(response) &&
        response.body &&
        typeof (response.body as any).getReader === 'function'
      ) {
        // Track per-frame activity to extend timeout for streaming
        const onActivity = () => {
          if (context.clientTxRef && typeof this.options.timeoutMsStream === 'number') {
            this.extendPendingTimeout(context.clientTxRef, this.options.timeoutMsStream);
          }
        };

        const filtered = wrapAndFilterInBandFrames(
          response,
          async p => {
            try {
              const decoded = this.parsePaymentHeader((p as any).headerValue);
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
        // Mark as streaming in transaction log
        try {
          if (
            this.options.transactionLog?.enabled !== false &&
            this.transactionStore &&
            context.clientTxRef
          ) {
            await this.transactionStore.update(context.clientTxRef, { stream: true });
          }
        } catch (e) {
          this.log('[transaction.update.error]', e);
        }
        // Set initial per-frame timeout for streaming if configured
        if (context.clientTxRef && typeof this.options.timeoutMsStream === 'number') {
          this.extendPendingTimeout(context.clientTxRef, this.options.timeoutMsStream);
        }
        return filtered;
      }

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
    const protocol = this.parseProtocolFromHeaders(response);
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
      const visibleHeaderNames: string[] = [];
      try {
        response.headers.forEach((_, k) => visibleHeaderNames.push(k));
      } catch (e) {
        this.log('[response.no-header.error]', e);
      }
      this.log(
        '[response.no-header]',
        'status=',
        response.status,
        'pendingKeys=',
        this.pendingKeys(),
        'visibleHeaders=',
        visibleHeaderNames
      );
    }

    if (protocol.type === 'error') {
      await this.handleProtocolError(protocol);
      return;
    }

    if (protocol.type === 'success') {
      await this.handleProtocolSuccess(protocol);
      return;
    }

    // No protocol header present
    await this.handleNoProtocolHeader(response);
  }

  // ---- Response helpers to simplify branches ----
  private parseProtocolFromHeaders(response: Response):
    | { type: 'none' }
    | { type: 'error'; clientTxRef?: string; err: PaymentKitError }
    | {
        type: 'success';
        clientTxRef?: string;
        subRav: SubRAV;
        cost: bigint;
        costUsd?: bigint;
        serviceTxRef?: string;
      } {
    // Ensure case-insensitive lookup: try exact, then lowercase
    const headerName = HttpPaymentCodec.getHeaderName();
    let paymentHeader = response.headers.get(headerName);
    if (!paymentHeader) {
      paymentHeader = response.headers.get(headerName.toLowerCase());
    }
    if (!paymentHeader) return { type: 'none' };
    try {
      const payload = this.parsePaymentHeader(paymentHeader) as any;
      if (payload?.error) {
        const code = payload.error.code;
        const message = payload.error.message || response.statusText || 'Payment error';
        return {
          type: 'error',
          clientTxRef: payload.clientTxRef,
          err: new PaymentKitError(code, message, response.status),
        };
      }
      if (payload?.subRav && payload.cost !== undefined) {
        const costUsd = payload.costUsd as bigint | undefined;
        return {
          type: 'success',
          clientTxRef: payload.clientTxRef,
          subRav: payload.subRav,
          cost: payload.cost as bigint,
          costUsd,
          serviceTxRef: payload.serviceTxRef,
        };
      }
      return { type: 'none' };
    } catch (e) {
      this.log('Failed to parse payment response header:', e);
      return { type: 'none' };
    }
  }

  private async handleProtocolError(proto: {
    type: 'error';
    clientTxRef?: string;
    err: PaymentKitError;
  }): Promise<void> {
    if (proto.clientTxRef && this.rejectByRef(proto.clientTxRef, proto.err)) {
      this.clientState.pendingSubRAV = undefined;
      await this.persistClientState();
      return;
    }
    if (this.clientState.pendingPayments && this.clientState.pendingPayments.size === 1) {
      const [[onlyKey]] = this.clientState.pendingPayments.entries();
      this.rejectByRef(onlyKey, proto.err);
      this.clientState.pendingSubRAV = undefined;
      await this.persistClientState();
      return;
    }
    if (this.clientState.pendingPayments && this.clientState.pendingPayments.size >= 1) {
      for (const [key] of this.clientState.pendingPayments.entries()) {
        this.rejectByRef(key, proto.err);
      }
      this.clientState.pendingSubRAV = undefined;
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
    let pendingRequest: PendingPaymentRequest | undefined;
    let keyToDelete: string | undefined;

    if (proto.clientTxRef && this.clientState.pendingPayments?.has(proto.clientTxRef)) {
      pendingRequest = this.clientState.pendingPayments.get(proto.clientTxRef)!;
      keyToDelete = proto.clientTxRef;
    } else if (this.clientState.pendingPayments && this.clientState.pendingPayments.size === 1) {
      const [[onlyKey, onlyPending]] = this.clientState.pendingPayments.entries();
      pendingRequest = onlyPending;
      keyToDelete = onlyKey;
    }

    if (!pendingRequest || !keyToDelete) {
      // Attempt heuristic match under concurrency by checking SubRAV progression
      try {
        if (this.clientState.pendingPayments && this.clientState.pendingPayments.size > 1) {
          const candidates: Array<[string, PendingPaymentRequest]> = [];
          for (const [k, p] of this.clientState.pendingPayments.entries()) {
            const prevSent = p.sendedSubRav?.subRav;
            if (!prevSent) continue;
            try {
              assertSubRavProgression(prevSent, proto.subRav, true);
              candidates.push([k, p]);
            } catch (e) {
              this.log('assertSubRavProgression failed:', e);
            }
          }
          if (candidates.length === 1) {
            const [k, p] = candidates[0];
            pendingRequest = p;
            keyToDelete = k;
          }
        }
      } catch (e) {
        this.log('assertSubRavProgression failed:', e);
      }
    }

    // Final fallback: if still not matched but there are pendings, pick the most recent pending
    // This avoids deadlock when server omits clientTxRef and no prevSent exists (FREE mode).
    if (!pendingRequest || !keyToDelete) {
      if (this.clientState.pendingPayments && this.clientState.pendingPayments.size >= 1) {
        try {
          const all = Array.from(this.clientState.pendingPayments.entries());
          const [fallbackKey, fallbackPending] = all[all.length - 1]; // most recent
          pendingRequest = fallbackPending;
          keyToDelete = fallbackKey;
          this.log(
            '[payment.match.fallback]',
            'using-most-recent-pending',
            'candidateKey=',
            keyToDelete
          );
        } catch (e) {
          this.log('[payment.match.fallback.error]', e);
        }
      }
    }

    if (!pendingRequest || !keyToDelete) {
      // No matching pending: still cache SubRAV and return
      await this.cachePendingSubRAV(proto.subRav);
      if (proto.serviceTxRef) {
        this.log('Received service transaction reference:', proto.serviceTxRef);
      }
      return;
    }

    const prev = pendingRequest.sendedSubRav?.subRav;
    if (prev) {
      try {
        assertSubRavProgression(prev, proto.subRav, true);
      } catch (e) {
        this.rejectByRef(
          keyToDelete!,
          new Error(
            'Invalid SubRAV progression: ' +
              (e as Error).message +
              ', response: ' +
              serializeJson({ subRav: proto.subRav, cost: proto.cost, costUsd: proto.costUsd }) +
              ' prev: ' +
              serializeJson(prev) +
              ' requestContext: ' +
              serializeJson(pendingRequest.requestContext)
          )
        );
        return;
      }
    }

    // Cache next proposal for future request
    await this.cachePendingSubRAV(proto.subRav);

    const paymentInfo: PaymentInfo = {
      clientTxRef: proto.clientTxRef || keyToDelete!,
      serviceTxRef: proto.serviceTxRef,
      cost: proto.cost,
      costUsd: proto.costUsd ?? BigInt(0),
      nonce: proto.subRav.nonce,
      channelId: pendingRequest.channelId,
      vmIdFragment: proto.subRav.vmIdFragment,
      assetId: pendingRequest.assetId,
      timestamp: new Date().toISOString(),
    };

    this.resolveByRef(keyToDelete!, paymentInfo);
    try {
      pendingRequest.release?.();
    } catch (e) {
      this.log('[release.error]', e);
    }
    // Transaction logging: finalize payment snapshot and vmIdFragment
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
      paymentInfo.cost.toString(),
      'costUsd:',
      paymentInfo.costUsd.toString()
    );
  }

  private async handleNoProtocolHeader(response: Response): Promise<void> {
    // Streaming scenario: the actual parsing is done in the wrapper layer (wrapAndFilterInBandFrames).
    // Do not read response.body here to avoid competition.
    if (isStreamLikeResponse(response)) {
      return;
    }

    // Non-streaming or no pending: treat as free endpoint
    this.resolveAllPendingAsFree();
    // Release any queued request since no payment header is present (FREE)
    try {
      if (this.clientState.pendingPayments && this.clientState.pendingPayments.size === 0) {
        // no-op: release is attached per pending; nothing to release here
      }
    } catch (e) {
      this.log('[release.error]', e);
    }

    // Map known status codes when no protocol header present
    if (response.status === 402) {
      this.log('Payment required (402) - clearing cache and retrying');
      this.clientState.pendingSubRAV = undefined;
      await this.persistClientState();
      throw new PaymentKitError(
        PaymentErrorCode.PAYMENT_REQUIRED,
        'Payment required - insufficient balance or invalid proposal',
        402
      );
    }
    if (response.status === 409) {
      this.log('SubRAV conflict (409) - clearing pending proposal');
      this.clientState.pendingSubRAV = undefined;
      this.state = ClientState.READY;
      await this.persistClientState();
      throw new PaymentKitError(
        PaymentErrorCode.RAV_CONFLICT,
        'SubRAV conflict - cleared pending proposal',
        409
      );
    }
  }

  /**
   * Accept a pending SubRAV recovered from storage/service only if it matches current key fragment (if known).
   * If fragment is unknown, tentatively accept.
   */
  private acceptRecoveredPending(pending?: SubRAV | null): SubRAV | undefined {
    if (!pending) return undefined;
    const currentFragment = this.clientState.vmIdFragment;
    if (!currentFragment || pending.vmIdFragment === currentFragment) {
      this.clientState.pendingSubRAV = pending;
      this.log('Accepted recovered pending SubRAV:', pending.nonce);
      return pending;
    } else {
      this.log(
        'Ignoring recovered pending SubRAV due to fragment mismatch:',
        pending.vmIdFragment,
        '!=',
        currentFragment
      );
      return undefined;
    }
  }

  /**
   * Apply recovery response to client state with optional sub-channel authorization.
   * No network calls except optional authorization.
   */
  private async applyRecovery(
    recovery: RecoveryResponse,
    options?: { authorizeIfMissing?: boolean; requireVmFragment?: boolean }
  ): Promise<void> {
    // Update channel info if present
    if (recovery.channel) {
      this.clientState.channelId = recovery.channel.channelId;
      try {
        this.clientState.channelInfo = await this.payerClient.getChannelInfo(
          recovery.channel.channelId
        );
      } catch (e) {
        this.log('GetChannelInfo failed during applyRecovery:', e);
      }
    }

    // Accept pending proposal if matches
    this.acceptRecoveredPending(recovery.pendingSubRav);

    // Ensure sub-channel authorized if requested
    if (options?.authorizeIfMissing && this.clientState.channelId) {
      let vmIdFragment = recovery.subChannel?.vmIdFragment || this.clientState.vmIdFragment;

      if (!vmIdFragment && options?.requireVmFragment) {
        if (this.options.keyId) {
          const parts = this.options.keyId.split('#');
          vmIdFragment = parts.length > 1 ? parts[1] : '';
        }
        if (!vmIdFragment) {
          throw new Error(
            'Recovered channel but sub-channel cannot be verified/authorized: missing vmIdFragment.'
          );
        }
      }

      if (vmIdFragment && !recovery.subChannel) {
        try {
          this.log('Authorizing sub-channel for fragment during recovery:', vmIdFragment);
          await this.payerClient.authorizeSubChannel({
            channelId: this.clientState.channelId,
            vmIdFragment,
          });
          await this.waitForSubChannelAuthorization(this.clientState.channelId, vmIdFragment);
        } catch (e) {
          this.log('Sub-channel authorization failed during recovery:', e);
        }
        try {
          this.clientState.subChannelInfo = await this.payerClient.getSubChannelInfo(
            this.clientState.channelId,
            vmIdFragment
          );
        } catch (e) {
          this.log('GetSubChannelInfo failed during recovery:', e);
        }
      }
    }
  }

  /**
   * Parse JSON response with error handling
   * Smart auto mode:
   * - If schema provided: validate (supports ApiResponse or raw)
   * - No schema: if ApiResponse format, unwrap on success else throw PaymentKitError; otherwise return raw JSON
   */
  private async parseJsonAuto<T>(response: Response, schema?: z.ZodType<T>): Promise<T> {
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Response is not JSON');
    }

    // Handle non-ok HTTP status first
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    let responseData: any;
    try {
      // Use lossless-json for automatic BigInt handling
      responseData = await parseJsonResponse<any>(response);
    } catch (error) {
      throw new Error('Failed to parse JSON response');
    }

    // If schema provided, validate either ApiResponse.data or raw
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

    // No schema: honor ApiResponse if present
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

    // Raw JSON passthrough
    return responseData as T;
  }

  /**
   * Handle errors with optional custom error handler
   */
  private handleError(message: string, error: unknown): void {
    const errorMessage = `${message}: ${error instanceof Error ? error.message : String(error)}`;

    if (this.options.onError) {
      this.options.onError(new Error(errorMessage));
    }

    // Error is routed via onError; avoid console
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
        this.state = ClientState.READY;
        this.log('Loaded channelId from legacy storage:', channelId);
      }
      return;
    }

    try {
      const persistedState = await this.mappingStore.getState(this.host);
      if (persistedState) {
        this.clientState.channelId = persistedState.channelId;
        // Accept persisted pending via helper; if fragment未知则先暂存，等到后续 ensureKeyFragment 后也安全
        this.acceptRecoveredPending(persistedState.pendingSubRAV || undefined);

        // Set appropriate state based on persisted data
        if (persistedState.channelId) {
          this.state = ClientState.READY;
        }

        // Do not perform fragment filtering here; ensureKeyFragment will clean up once we know the fragment
        this.log('Loaded persisted client state:', {
          channelId: persistedState.channelId,
          hasPendingSubRAV: !!this.clientState.pendingSubRAV,
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
        lastUpdated: new Date().toISOString(),
      };

      await this.mappingStore.setState(this.host, stateToStore);
      this.log('Persisted client state');
    } catch (error) {
      this.log('Failed to persist client state:', error);
    }
  }

  /**
   * Perform discovery using the well-known endpoint
   */
  private async performDiscovery(): Promise<void> {
    const discoveryUrl = new URL('/.well-known/nuwa-payment/info', this.options.baseUrl);

    try {
      this.log('Attempting service discovery at:', discoveryUrl.toString());
      const response = await this.fetchImpl(discoveryUrl.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const serviceInfo = (await response.json()) as DiscoveryResponse;
        this.log('Service discovery successful:', serviceInfo);

        // Cache the discovery info for later use
        this.cachedDiscoveryInfo = serviceInfo;

        if (serviceInfo.basePath) {
          this.discoveredBasePath = serviceInfo.basePath;
        }
      } else {
        this.log('Service discovery failed with status:', response.status);
      }
    } catch (error) {
      this.log('Service discovery failed, using fallback:', error);
    }

    // Always set a fallback basePath if discovery failed
    if (!this.discoveredBasePath) {
      this.discoveredBasePath = '/payment-channel';
    }
  }

  /**
   * Get the effective base path for payment-related requests
   */
  private getBasePath(): string {
    return this.discoveredBasePath || '/payment-channel';
  }

  /**
   * Build URL for payment-related endpoints
   */
  public buildPaymentUrl(endpoint: string): string {
    const basePath = this.getBasePath();
    return new URL(`${basePath}${endpoint}`, this.options.baseUrl).toString();
  }

  /**
   * Debug logging
   */
  private log(...args: any[]): void {
    this.logger.debug(...args);
  }

  /**
   * Build and sign a SubRAV for the current request per rav-handling.md §3.
   * - If there is a pendingSubRAV, sign it and clear the pending cache.
   * - Otherwise, return undefined (FREE mode - no RAV sent per rav-handling.md §2.1)
   */
  private async buildSignedSubRavIfNeeded(): Promise<SignedSubRAV | undefined> {
    if (!this.clientState.channelId) {
      throw new Error('Channel not initialized');
    }

    return this.withSubRavLock(async () => {
      if (this.clientState.pendingSubRAV) {
        const pendingSubRAV = this.clientState.pendingSubRAV;
        // Clear after taking to keep existing semantics (under lock)
        this.clientState.pendingSubRAV = undefined;

        const signed = await this.payerClient.signSubRAV(pendingSubRAV);
        this.log('Signed pending SubRAV:', pendingSubRAV.nonce, pendingSubRAV.accumulatedAmount);
        return signed;
      }

      // No handshake RAV sent - FREE mode per rav-handling.md §3
      this.log('No pending SubRAV - operating in FREE mode without RAV');
      return undefined;
    });
  }

  private async withSubRavLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.subRavMutex;
    let release!: () => void;
    this.subRavMutex = new Promise<void>(resolve => (release = resolve));
    try {
      await previous.catch(e => {
        this.log('[subRavLock.error]', e);
      });
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Cache pending SubRAV and persist state (helper to avoid duplication)
   */
  private async cachePendingSubRAV(subRav: SubRAV): Promise<void> {
    this.clientState.pendingSubRAV = subRav;
    this.log('Cached new unsigned SubRAV:', subRav.nonce);
    await this.persistClientState();
  }

  /**
   * Encode payment header using HttpPaymentCodec (thin wrapper, no behavior change)
   */
  private encodePaymentHeader(signedSubRAV: SignedSubRAV | undefined, clientTxRef: string): string {
    const codec = new HttpPaymentCodec();
    return codec.encodePayload({
      signedSubRav: signedSubRAV, // Now optional
      maxAmount: this.options.maxAmount || BigInt(0),
      clientTxRef: clientTxRef, // Now required
      version: 1,
    });
  }

  /**
   * Parse payment header using HttpPaymentCodec (thin wrapper, no behavior change)
   */
  private parsePaymentHeader(headerValue: string) {
    return HttpPaymentCodec.parseResponseHeader(headerValue);
  }

  /**
   * Wait until sub-channel authorization is visible on-chain to avoid race conditions.
   */
  private async waitForSubChannelAuthorization(
    channelId: string,
    vmIdFragment: string,
    attempts: number = 10,
    delayMs: number = 500
  ): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        await this.payerClient.getSubChannelInfo(channelId, vmIdFragment);
        this.log('Sub-channel visible on-chain after authorization:', vmIdFragment);
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    throw new Error('Sub-channel authorization not visible on-chain within timeout');
  }
}
