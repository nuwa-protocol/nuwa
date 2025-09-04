import { DebugLogger, DIDAuth } from '@nuwa-ai/identity-kit';
import type { PaymentChannelPayerClient } from '../../client/PaymentChannelPayerClient';
import { PaymentState } from '../http/core/PaymentState';
import type { SignedSubRAV } from '../../core/types';
import { HttpPaymentCodec } from '../../middlewares/http/HttpPaymentCodec';
import type { RecoveryResponse, DiscoveryResponse } from '../../schema';

export interface McpChannelManagerOptions {
  baseUrl: string;
  payerClient: PaymentChannelPayerClient;
  paymentState: PaymentState;
  signer: any;
  keyId?: string;
  payerDid?: string;
  payeeDid?: string;
  defaultAssetId?: string;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Minimal MCP caller used for service-side operations */
  mcpCall: (name: string, params?: any) => Promise<any>;
  /** Whether to attempt server-side recovery inside ensureChannelReady */
  autoRecover?: boolean;
}

/**
 * McpChannelManager replicates the lifecycle logic of the HTTP ChannelManager
 * but uses MCP tools for recovery/commit, and HTTP well-known for discovery.
 */
export class McpChannelManager {
  private readonly options: McpChannelManagerOptions;
  private readonly logger: DebugLogger;
  private cachedDiscovery?: DiscoveryResponse;
  private discoveredBasePath?: string;
  private ensureReadyPromise?: Promise<void>;
  private recoveringPromise?: Promise<RecoveryResponse>;
  private inRecovery: boolean = false;
  private lastRecoveryAt: number = 0;
  private readonly minRecoveryIntervalMs: number = 1000;

  constructor(options: McpChannelManagerOptions) {
    this.options = options;
    this.logger = DebugLogger.get('McpChannelManager');
  }

  async ensureChannelReady(): Promise<void> {
    if (!this.ensureReadyPromise) {
      this.ensureReadyPromise = this.doEnsureChannelReady().finally(() => {
        this.ensureReadyPromise = undefined;
      });
    }
    await this.ensureReadyPromise;
  }

  private async doEnsureChannelReady(): Promise<void> {
    // 1) Ensure key fragment present
    await this.ensureKeyFragmentPresent();

    // 2) Validate existing channel or recover
    let channelId = this.options.paymentState.getChannelId();
    if (channelId) {
      try {
        const info = await this.options.payerClient.getChannelInfo(channelId);
        this.options.paymentState.setChannelInfo(info);
      } catch (e) {
        this.logger.debug('Persisted channel not found, clearing and recovering:', e);
        this.options.paymentState.setChannelId(undefined);
        this.options.paymentState.setChannelInfo(undefined);
        channelId = undefined;
      }
    }

    if (!channelId) {
      // Do not auto-recover here; directly create a new channel
      await this.createNewChannel();
      channelId = this.options.paymentState.getChannelId();
    }

    // 3) Ensure sub-channel exists/authorized
    const vmIdFragment = this.options.paymentState.getVmIdFragment();
    if (channelId && vmIdFragment) {
      try {
        const subInfo = await this.options.payerClient.getSubChannelInfo(channelId, vmIdFragment);
        this.options.paymentState.setSubChannelInfo(subInfo);
      } catch {
        // Do not auto-recover here; directly attempt authorization
        this.logger.debug('ensureChannelReady: subChannel missing, authorizing directly');
        await this.directAuthorizeSubChannel();
      }
    }
  }

  private async createNewChannel(): Promise<void> {
    const defaultAssetId = this.options.defaultAssetId || '0x3::gas_coin::RGas';
    let payeeDid = this.options.payeeDid;
    if (!payeeDid) {
      const service = await this.discoverService().catch(() => undefined);
      payeeDid = service?.serviceDid;
    }
    if (!payeeDid) {
      this.logger.debug('createNewChannel: missing payeeDid, cannot create channel');
      throw new Error('payeeDid missing for channel creation');
    }
    this.logger.debug('createNewChannel: opening new channel', { payeeDid, defaultAssetId } as any);
    try {
      const opened = await this.options.payerClient.openChannelWithSubChannel({
        payeeDid,
        assetId: defaultAssetId,
      });
      this.options.paymentState.setChannelId(opened.channelId);
      if (opened.channelInfo) this.options.paymentState.setChannelInfo(opened.channelInfo);
      if (opened.subChannelInfo) this.options.paymentState.setSubChannelInfo(opened.subChannelInfo);
      this.logger.debug('createNewChannel: channel opened', { channelId: opened.channelId } as any);
    } catch (err) {
      this.logger.debug('createNewChannel: openChannelWithSubChannel failed', err);
      throw err;
    }
  }

  private async ensureKeyFragmentPresent(): Promise<void> {
    if (this.options.paymentState.getKeyId() && this.options.paymentState.getVmIdFragment()) return;
    let keyId = this.options.keyId;
    if (!keyId && this.options.signer?.listKeyIds) {
      try {
        const ids: string[] = await this.options.signer.listKeyIds();
        keyId = Array.isArray(ids) && ids.length > 0 ? ids[0] : undefined;
      } catch {}
    }
    if (keyId) {
      const parts = keyId.split('#');
      const frag = parts.length > 1 ? parts[1] : undefined;
      if (frag) this.options.paymentState.setKeyInfo(keyId, frag);
    }
    if (!this.options.paymentState.getKeyId() || !this.options.paymentState.getVmIdFragment()) {
      throw new Error('No keyId found');
    }
  }

  async discoverService(): Promise<DiscoveryResponse> {
    if (!this.cachedDiscovery) {
      await this.performDiscovery();
    }
    if (this.cachedDiscovery) return this.cachedDiscovery;
    throw new Error('Service discovery failed');
  }

  private async performDiscovery(): Promise<void> {
    const discoveryUrl = new URL('/.well-known/nuwa-payment/info', this.options.baseUrl);
    const fetchImpl = this.options.fetchImpl || (globalThis as any).fetch?.bind(globalThis);
    if (!fetchImpl) return;
    try {
      const res = await fetchImpl(discoveryUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const info = (await res.json()) as DiscoveryResponse;
        this.cachedDiscovery = info;
        if (info.basePath) this.discoveredBasePath = info.basePath;
      }
    } catch (e) {
      this.logger.debug('MCP discovery failed:', e);
    }
    if (!this.discoveredBasePath) this.discoveredBasePath = '/payment-channel';
  }

  async recoverFromService(): Promise<RecoveryResponse> {
    // singleflight to avoid recursion storms
    const now = Date.now();
    if (now - this.lastRecoveryAt < this.minRecoveryIntervalMs && this.recoveringPromise) {
      this.logger.debug('recoverFromService: returning existing promise (throttled)');
      return this.recoveringPromise;
    }
    if (!this.recoveringPromise) {
      this.inRecovery = true;
      this.lastRecoveryAt = now;
      this.recoveringPromise = this.doRecoverFromService()
        .catch(err => {
          throw err;
        })
        .finally(() => {
          this.inRecovery = false;
          this.recoveringPromise = undefined;
        });
    }
    return this.recoveringPromise;
  }

  private async doRecoverFromService(): Promise<RecoveryResponse> {
    // Use MCP tool `nuwa.recovery`; attach DIDAuth so server can authorize
    const clientTxRef = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const auth = await this.generateAuthToken('nuwa.recovery', clientTxRef).catch(() => undefined);
    const result = await this.options.mcpCall('nuwa.recovery', auth ? { __nuwa_auth: auth } : {});
    let payload: any = result;
    if (result && typeof result === 'object' && Array.isArray((result as any).content)) {
      // Try parse payment resource for pendingSubRAV side effects, but prefer data text for recovery JSON
      const contents = (result as any).content as any[];
      try {
        const payment = HttpPaymentCodec.parseMcpPaymentFromContents(contents);
        if (payment?.subRav) {
          const sub = HttpPaymentCodec.deserializeSubRAV(payment.subRav);
          this.options.paymentState.setPendingSubRAV(sub);
        }
      } catch {}
      const text = contents.find(c => c?.type === 'text');
      if (text?.text) {
        try {
          payload = JSON.parse(text.text);
        } catch {}
      }
    }
    return payload as RecoveryResponse;
  }

  async commitSubRAV(signedSubRAV: SignedSubRAV): Promise<void> {
    const clientTxRef = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const auth = await this.generateAuthToken('nuwa.commit', clientTxRef).catch(() => undefined);
    await this.options.mcpCall('nuwa.commit', {
      signedSubRav: HttpPaymentCodec.serializeSignedSubRAV(signedSubRAV),
      __nuwa_auth: auth,
    });
    //clear pending subrav
    this.options.paymentState.clearPendingSubRAV();
  }

  private async applyRecovery(
    recovery: RecoveryResponse,
    options?: { authorizeIfMissing?: boolean; requireVmFragment?: boolean }
  ): Promise<void> {
    if (recovery.channel) {
      this.options.paymentState.setChannelId(recovery.channel.channelId);
      try {
        const info = await this.options.payerClient.getChannelInfo(recovery.channel.channelId);
        this.options.paymentState.setChannelInfo(info);
      } catch (e) {
        this.logger.debug('GetChannelInfo failed during MCP recovery:', e);
      }
    }
    if (recovery.pendingSubRav) {
      try {
        const sub = HttpPaymentCodec.deserializeSubRAV(recovery.pendingSubRav as any);
        this.options.paymentState.setPendingSubRAV(sub);
      } catch {}
    }
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
      (recovery.subChannel as any)?.vmIdFragment || this.options.paymentState.getVmIdFragment();
    if (!vmIdFragment && requireVmFragment) {
      if (this.options.keyId) {
        const parts = this.options.keyId.split('#');
        vmIdFragment = parts.length > 1 ? parts[1] : '';
      }
      if (!vmIdFragment) throw new Error('Missing vmIdFragment for sub-channel authorization');
    }
    if (vmIdFragment && !(recovery as any).subChannel) {
      const auth = await this.options.payerClient.authorizeSubChannel({ channelId, vmIdFragment });
      this.options.paymentState.setSubChannelInfo(auth.subChannelInfo);
    }
  }

  private async directAuthorizeSubChannel(): Promise<void> {
    const channelId = this.options.paymentState.getChannelId();
    const vmIdFragment = this.options.paymentState.getVmIdFragment();
    if (!channelId || !vmIdFragment) return;
    const auth = await this.options.payerClient.authorizeSubChannel({ channelId, vmIdFragment });
    this.options.paymentState.setSubChannelInfo(auth.subChannelInfo);
  }

  private async generateAuthToken(method: string, clientTxRef: string): Promise<string> {
    let keyId = this.options.keyId;
    if (!keyId && this.options.signer?.listKeyIds) {
      try {
        const ids: string[] = await this.options.signer.listKeyIds();
        keyId = Array.isArray(ids) && ids.length > 0 ? ids[0] : undefined;
      } catch {}
    }
    if (!keyId) throw new Error('No keyId for DIDAuth');
    const signedObject = await DIDAuth.v1.createSignature(
      {
        operation: 'mcp_tool_call',
        params: { tool: method, clientTxRef },
      },
      this.options.signer as any,
      keyId
    );
    return DIDAuth.v1.toAuthorizationHeader(signedObject);
  }
}
