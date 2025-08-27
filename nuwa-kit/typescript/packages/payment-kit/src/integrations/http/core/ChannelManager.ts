import type { HostChannelMappingStore } from '../types';
import type { RecoveryResponse, DiscoveryResponse } from '../../../schema';
import { RecoveryResponseSchema } from '../../../schema';
import type { FetchLike } from '../types';
import { PaymentChannelPayerClient } from '../../../client/PaymentChannelPayerClient';
import { PaymentState } from './PaymentState';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import { DidAuthHelper } from '../internal/DidAuthHelper';
import { serializeJson } from '../../../utils/json';
import type { SignedSubRAV } from '../../../core/types';

export interface ChannelManagerOptions {
  host: string;
  baseUrl: string;
  payerClient: PaymentChannelPayerClient;
  paymentState: PaymentState;
  mappingStore: HostChannelMappingStore;
  fetchImpl: FetchLike;
  signer: any;
  keyId?: string;
  payerDid?: string;
  payeeDid?: string;
  defaultAssetId?: string;
}

/**
 * ChannelManager handles channel lifecycle operations including:
 * - Channel creation and restoration
 * - Service discovery
 * - Channel recovery
 * - SubRAV commits
 */
export class ChannelManager {
  private logger: DebugLogger;
  private options: ChannelManagerOptions;
  private discoveredBasePath?: string;
  private cachedDiscoveryInfo?: DiscoveryResponse;
  private ensureReadyPromise?: Promise<void>;

  constructor(options: ChannelManagerOptions) {
    this.options = options;
    this.logger = DebugLogger.get('ChannelManager');
  }

  /**
   * Ensure channel is ready for use
   */
  async ensureChannelReady(): Promise<void> {
    const channelId = this.options.paymentState.getChannelId();

    if (channelId) {
      this.logger.debug('Channel already ready:', channelId);
      return;
    }

    if (!this.ensureReadyPromise) {
      this.ensureReadyPromise = this.doEnsureChannelReady().finally(() => {
        this.ensureReadyPromise = undefined;
      });
    }

    await this.ensureReadyPromise;
  }

  private async doEnsureChannelReady(): Promise<void> {
    // Try to load persisted state first
    await this.loadPersistedState();

    // If we still don't have a channel, initialize it
    if (!this.options.paymentState.getChannelId()) {
      await this.initializeChannel();
    }
  }

  /**
   * Initialize or restore payment channel
   */
  private async initializeChannel(): Promise<void> {
    this.logger.debug('Initializing channel for host:', this.options.host);

    try {
      // First, try to recover existing channel from server
      try {
        const recoveryData = await this.recoverFromService();
        if (recoveryData.channel) {
          await this.applyRecovery(recoveryData, {
            authorizeIfMissing: true,
            requireVmFragment: true,
          });
          this.logger.debug(
            'Recovered active channel from server:',
            recoveryData.channel.channelId
          );

          // Update mapping store
          await this.persistState();
          return;
        }
      } catch (error) {
        this.logger.debug('Server recovery failed, will create new channel:', error);
      }

      // Create new channel
      await this.createNewChannel();
    } catch (error) {
      this.logger.error('Failed to initialize channel:', error);
      throw error;
    }
  }

  /**
   * Create a new payment channel
   */
  private async createNewChannel(): Promise<void> {
    const defaultAssetId = this.options.defaultAssetId || '0x3::gas_coin::RGas';

    // Get payee DID from options or discover from service
    let payeeDid = this.options.payeeDid;

    if (!payeeDid) {
      const serviceInfo = await this.discoverService();
      payeeDid = serviceInfo.serviceDid;
      this.logger.debug('Discovered payeeDid from service:', payeeDid);
    }

    const channelInfo = await this.options.payerClient.openChannelWithSubChannel({
      payeeDid,
      assetId: defaultAssetId,
    });

    this.options.paymentState.setChannelId(channelInfo.channelId);

    try {
      const fullChannelInfo = await this.options.payerClient.getChannelInfo(channelInfo.channelId);
      this.options.paymentState.setChannelInfo(fullChannelInfo);

      const vmIdFragment = this.options.paymentState.getVmIdFragment();
      if (vmIdFragment) {
        const subChannelInfo = await this.options.payerClient.getSubChannelInfo(
          channelInfo.channelId,
          vmIdFragment
        );
        this.options.paymentState.setSubChannelInfo(subChannelInfo);
      }
    } catch (e) {
      this.logger.debug('Failed to get channel/subchannel info:', e);
    }

    await this.persistState();
    this.logger.debug('Created new channel:', channelInfo.channelId);
  }

  /**
   * Discover service information
   */
  async discoverService(): Promise<DiscoveryResponse> {
    if (!this.cachedDiscoveryInfo) {
      await this.performDiscovery();
    }

    if (this.cachedDiscoveryInfo) {
      return this.cachedDiscoveryInfo;
    }

    throw new Error('Service discovery failed: No discovery information available');
  }

  private async performDiscovery(): Promise<void> {
    const discoveryUrl = new URL('/.well-known/nuwa-payment/info', this.options.baseUrl);

    try {
      const response = await this.options.fetchImpl(discoveryUrl.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const serviceInfo = (await response.json()) as DiscoveryResponse;
        this.logger.debug('Service discovery successful:', serviceInfo);

        this.cachedDiscoveryInfo = serviceInfo;
        if (serviceInfo.basePath) {
          this.discoveredBasePath = serviceInfo.basePath;
        }
      }
    } catch (error) {
      this.logger.debug('Service discovery failed:', error);
    }

    // Set fallback basePath
    if (!this.discoveredBasePath) {
      this.discoveredBasePath = '/payment-channel';
    }
  }

  /**
   * Recover channel state from service
   */
  async recoverFromService(): Promise<RecoveryResponse> {
    const recoveryUrl = this.buildPaymentUrl('/recovery');

    try {
      const payerDid = this.options.payerDid || (await this.options.signer.getDid());
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

      const response = await this.options.fetchImpl(recoveryUrl, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to recover from service: HTTP ${response.status}`);
      }

      const jsonData = await response.json();

      // Log the raw response for debugging
      this.logger.debug('Raw recovery response:', serializeJson(jsonData));

      // Check if response is in ApiResponse format
      let dataToValidate = jsonData;
      if (jsonData && typeof jsonData === 'object' && 'success' in jsonData) {
        if (jsonData.success && 'data' in jsonData) {
          dataToValidate = jsonData.data;
        } else if (!jsonData.success) {
          const error = jsonData.error || {};
          throw new Error(error.message || 'Recovery request failed');
        }
      }

      try {
        const recoveryData = RecoveryResponseSchema.parse(dataToValidate);
        this.logger.debug('Recovery completed successfully');
        return recoveryData;
      } catch (parseError) {
        // If parsing fails, log the error and return the raw data
        // This maintains backward compatibility
        this.logger.debug('Recovery response parsing failed:', parseError);
        this.logger.debug('Returning raw recovery data');
        return dataToValidate as RecoveryResponse;
      }
    } catch (error) {
      const errorMessage = `Recovery failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.debug(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Apply recovery response to client state
   */
  private async applyRecovery(
    recovery: RecoveryResponse,
    options?: { authorizeIfMissing?: boolean; requireVmFragment?: boolean }
  ): Promise<void> {
    // Update channel info
    if (recovery.channel) {
      this.options.paymentState.setChannelId(recovery.channel.channelId);

      try {
        const channelInfo = await this.options.payerClient.getChannelInfo(
          recovery.channel.channelId
        );
        this.options.paymentState.setChannelInfo(channelInfo);
      } catch (e) {
        this.logger.debug('GetChannelInfo failed during recovery:', e);
      }
    }

    // Accept pending proposal
    if (recovery.pendingSubRav) {
      this.options.paymentState.setPendingSubRAV(recovery.pendingSubRav);
    }

    // Handle sub-channel authorization if needed
    if (options?.authorizeIfMissing && recovery.channel) {
      await this.ensureSubChannelAuthorized(recovery, options.requireVmFragment);
    }
  }

  private async ensureSubChannelAuthorized(
    recovery: RecoveryResponse,
    requireVmFragment?: boolean
  ): Promise<void> {
    const channelId = this.options.paymentState.getChannelId();
    if (!channelId) return;

    let vmIdFragment =
      recovery.subChannel?.vmIdFragment || this.options.paymentState.getVmIdFragment();

    if (!vmIdFragment && requireVmFragment) {
      if (this.options.keyId) {
        const parts = this.options.keyId.split('#');
        vmIdFragment = parts.length > 1 ? parts[1] : '';
      }
      if (!vmIdFragment) {
        throw new Error(
          'Recovered channel but sub-channel cannot be authorized: missing vmIdFragment.'
        );
      }
    }

    if (vmIdFragment && !recovery.subChannel) {
      try {
        await this.options.payerClient.authorizeSubChannel({
          channelId,
          vmIdFragment,
        });
        await this.waitForSubChannelAuthorization(channelId, vmIdFragment);

        const subChannelInfo = await this.options.payerClient.getSubChannelInfo(
          channelId,
          vmIdFragment
        );
        this.options.paymentState.setSubChannelInfo(subChannelInfo);
      } catch (e) {
        this.logger.debug('Sub-channel authorization failed during recovery:', e);
      }
    }
  }

  /**
   * Wait for sub-channel authorization to be visible on-chain
   */
  private async waitForSubChannelAuthorization(
    channelId: string,
    vmIdFragment: string,
    attempts: number = 10,
    delayMs: number = 500
  ): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        await this.options.payerClient.getSubChannelInfo(channelId, vmIdFragment);
        this.logger.debug('Sub-channel visible on-chain:', vmIdFragment);
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    throw new Error('Sub-channel authorization not visible on-chain within timeout');
  }

  /**
   * Commit a signed SubRAV to the service
   */
  async commitSubRAV(signedSubRAV: SignedSubRAV): Promise<void> {
    const commitUrl = this.buildPaymentUrl('/commit');

    try {
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

      const response = await this.options.fetchImpl(commitUrl, {
        method: 'POST',
        headers,
        body: serializeJson({ subRav: signedSubRAV }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to commit SubRAV: HTTP ${response.status} - ${errorBody}`);
      }

      this.logger.debug('SubRAV committed successfully');
    } catch (error) {
      const errorMessage = `SubRAV commit failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.debug(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Load persisted state from storage
   */
  private async loadPersistedState(): Promise<void> {
    try {
      const persistedState = await this.options.mappingStore.getState(this.options.host);
      if (persistedState) {
        this.options.paymentState.loadPersistedState(persistedState);
        this.logger.debug('Loaded persisted state');
      }
    } catch (error) {
      this.logger.debug('Failed to load persisted state:', error);
    }
  }

  /**
   * Persist current state to storage
   */
  private async persistState(): Promise<void> {
    try {
      const state = this.options.paymentState.getPersistedState();
      await this.options.mappingStore.setState(this.options.host, state);
      this.logger.debug('Persisted state');
    } catch (error) {
      this.logger.debug('Failed to persist state:', error);
    }
  }

  /**
   * Build URL for payment-related endpoints
   */
  buildPaymentUrl(endpoint: string): string {
    const basePath = this.discoveredBasePath || '/payment-channel';
    return new URL(`${basePath}${endpoint}`, this.options.baseUrl).toString();
  }

  /**
   * Get the discovered base path
   */
  getBasePath(): string {
    return this.discoveredBasePath || '/payment-channel';
  }
}
