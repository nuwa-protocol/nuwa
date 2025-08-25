import type { SubRAV, SignedSubRAV, PaymentInfo, PaymentResult } from '../../core/types';
import { PaymentChannelPayerClient } from '../../client/PaymentChannelPayerClient';
import { PaymentChannelFactory, type ChainConfig } from '../../factory/chainFactory';
import type { SignerInterface } from '@nuwa-ai/identity-kit';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import { DidAuthHelper } from '../http/internal/DidAuthHelper';
import type { HostChannelMappingStore } from '../http/types';
import { MemoryChannelRepository, type ChannelRepository } from '../../storage';
import type { DiscoveryResponse, RecoveryResponse, CommitResponse } from '../../schema';
import { HttpPaymentCodec } from '../http/internal/codec';

export interface McpTransport {
  call(method: string, params?: any, meta?: any): Promise<any>;
  notify?(method: string, params?: any, meta?: any): Promise<void>;
}

export interface McpPayerOptions {
  transport: McpTransport;
  chainConfig: ChainConfig;
  signer: SignerInterface;
  keyId?: string;
  channelId?: string;
  payerDid?: string;
  payeeDid?: string;
  defaultAssetId?: string;
  maxAmount?: bigint;
  debug?: boolean;
  mappingStore?: HostChannelMappingStore;
  channelRepo?: ChannelRepository;
}

export class PaymentChannelMcpClient {
  private payerClient: PaymentChannelPayerClient;
  private transport: McpTransport;
  private opts: McpPayerOptions;
  private logger: DebugLogger;
  private channelId?: string;
  private pendingSubRAV?: SubRAV;
  private keyId?: string;
  private vmIdFragment?: string;

  constructor(options: McpPayerOptions) {
    this.opts = options;
    this.transport = options.transport;
    this.payerClient = PaymentChannelFactory.createClient({
      chainConfig: options.chainConfig,
      signer: options.signer,
      keyId: options.keyId,
      storageOptions: {
        channelRepo: options.channelRepo || new MemoryChannelRepository(),
      },
    });
    this.logger = DebugLogger.get('PaymentChannelMcpClient');
    this.logger.setLevel(options.debug ? 'debug' : 'info');
  }

  async call<T = any>(method: string, params?: any, meta?: any): Promise<PaymentResult<T>> {
    await this.ensureKeyFragment();
    await this.ensureChannelReady();
    const clientTxRef = crypto.randomUUID();

    // Build MCP params with auth + payment meta
    const did = this.opts.payerDid || (await this.opts.signer.getDid());
    // Reuse HTTP helper to produce a DIDAuthV1 header token; for MCP we only need the header string value
    const didAuth = await DidAuthHelper.generateAuthHeader(did, this.opts.signer, 'mcp://call', 'POST', this.opts.keyId);

    let signedSubRav: SignedSubRAV | undefined;
    if (this.pendingSubRAV) {
      signedSubRav = await this.payerClient.signSubRAV(this.pendingSubRAV);
      this.pendingSubRAV = undefined;
    }

    const paymentParams = {
      version: 1 as const,
      clientTxRef,
      maxAmount: this.opts.maxAmount?.toString(),
      signedSubRav: signedSubRav
        ? (HttpPaymentCodec as any).serializeSignedSubRAV?.(signedSubRav) || {
            subRav: {
              version: signedSubRav.subRav.version.toString(),
              chainId: signedSubRav.subRav.chainId.toString(),
              channelId: signedSubRav.subRav.channelId,
              channelEpoch: signedSubRav.subRav.channelEpoch.toString(),
              vmIdFragment: signedSubRav.subRav.vmIdFragment,
              accumulatedAmount: signedSubRav.subRav.accumulatedAmount.toString(),
              nonce: signedSubRav.subRav.nonce.toString(),
            },
            signature: Buffer.from(signedSubRav.signature).toString('base64url'),
          }
        : undefined,
    };

    const merged = { ...(params || {}), __nuwa_auth: didAuth, __nuwa_payment: paymentParams };

    const result = await this.transport.call(method, merged, meta);
    let payment: PaymentInfo | undefined;
    const metaResp = result?.__nuwa_payment;
    if (metaResp?.subRav && metaResp.cost !== undefined) {
      const parsed = HttpPaymentCodec.parseResponseHeader(
        HttpPaymentCodec.buildResponseHeader({
          version: 1,
          subRav: (HttpPaymentCodec as any).deserializeSubRAV
            ? (HttpPaymentCodec as any).deserializeSubRAV(metaResp.subRav)
            : {
                version: parseInt(metaResp.subRav.version),
                chainId: BigInt(metaResp.subRav.chainId),
                channelId: metaResp.subRav.channelId,
                channelEpoch: BigInt(metaResp.subRav.channelEpoch),
                vmIdFragment: metaResp.subRav.vmIdFragment,
                accumulatedAmount: BigInt(metaResp.subRav.accumulatedAmount),
                nonce: BigInt(metaResp.subRav.nonce),
              },
          cost: BigInt(metaResp.cost),
          clientTxRef: metaResp.clientTxRef || clientTxRef,
          serviceTxRef: metaResp.serviceTxRef,
        })
      );
      // Cache next proposal for deferred billing
      this.pendingSubRAV = parsed.subRav;
      payment = {
        clientTxRef: parsed.clientTxRef || clientTxRef,
        serviceTxRef: parsed.serviceTxRef,
        cost: parsed.cost!,
        costUsd: parsed.costUsd ?? 0n,
        nonce: parsed.subRav!.nonce,
        channelId: parsed.subRav!.channelId,
        vmIdFragment: parsed.subRav!.vmIdFragment,
        assetId: this.opts.defaultAssetId || '0x3::gas_coin::RGas',
        timestamp: new Date().toISOString(),
      } as PaymentInfo;
    }
    return { data: (result?.data ?? result) as T, payment };
  }

  async notify(method: string, params?: any, meta?: any): Promise<void> {
    if (!this.transport.notify) {
      await this.call(method, params, meta);
      return;
    }
    await this.transport.notify(method, params, meta);
  }

  getPendingSubRAV(): SubRAV | null {
    return this.pendingSubRAV || null;
  }
  clearPendingSubRAV(): void {
    this.pendingSubRAV = undefined;
  }
  getChannelId(): string | undefined {
    return this.channelId;
  }
  getPayerClient(): PaymentChannelPayerClient {
    return this.payerClient;
  }

  async recoverFromService(): Promise<RecoveryResponse> {
    const res = await this.call<RecoveryResponse>('nuwa.recovery', {});
    if (res.data?.pendingSubRav) this.pendingSubRAV = res.data.pendingSubRav;
    if (res.data?.channel?.channelId) this.channelId = res.data.channel.channelId;
    return res.data;
  }

  async discoverService(): Promise<DiscoveryResponse> {
    const res = await this.call<DiscoveryResponse>('nuwa.discover', {});
    return res.data;
  }

  async commitSubRAV(signedSubRAV: SignedSubRAV): Promise<CommitResponse> {
    const res = await this.call<CommitResponse>('nuwa.commit', { subRav: signedSubRAV });
    return res.data;
  }

  private async ensureKeyFragment(): Promise<void> {
    if (this.keyId && this.vmIdFragment) return;
    let keyId = this.opts.keyId;
    if (!keyId) {
      if (this.opts.signer && typeof this.opts.signer.listKeyIds === 'function') {
        try {
          const ids: string[] = await this.opts.signer.listKeyIds();
          keyId = Array.isArray(ids) && ids.length > 0 ? ids[0] : undefined;
        } catch (e) {
          this.logger.debug('listKeyIds failed:', e);
        }
      }
    }
    if (keyId) {
      this.keyId = keyId;
      const parts = keyId.split('#');
      this.vmIdFragment = parts.length > 1 ? parts[1] : undefined;
    }
    if (!this.keyId || !this.vmIdFragment) {
      throw new Error('No keyId found');
    }
  }

  private async ensureChannelReady(): Promise<void> {
    if (this.channelId) return;
    const payeeDid = this.opts.payeeDid || (await this.discoverService()).serviceDid;
    const defaultAssetId = this.opts.defaultAssetId || '0x3::gas_coin::RGas';
    const channelInfo = await this.payerClient.openChannelWithSubChannel({
      payeeDid,
      assetId: defaultAssetId,
    });
    this.channelId = channelInfo.channelId;
  }
}


