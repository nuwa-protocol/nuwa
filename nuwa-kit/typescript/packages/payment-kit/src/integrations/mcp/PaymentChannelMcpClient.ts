import type { PaymentResult, SubRAV, SignedSubRAV, PaymentInfo } from '../../core/types';
import { PaymentChannelPayerClient } from '../../client/PaymentChannelPayerClient';
import { PaymentChannelFactory } from '../../factory/chainFactory';
import { DebugLogger, DIDAuth, type SignerInterface } from '@nuwa-ai/identity-kit';
import { PaymentState } from '../http/core/PaymentState';
import { HttpPaymentCodec } from '../../middlewares/http/HttpPaymentCodec';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createDefaultChannelRepo } from '../http/internal/LocalStore';
import { deriveChannelId } from '../../rooch/ChannelUtils';
import { serializeJson } from '../../utils/json';

export interface McpPayerOptions {
  baseUrl: string; // MCP server endpoint (e.g., http://localhost:8080/mcp)
  signer: SignerInterface;
  keyId?: string;
  payerDid?: string;
  payeeDid?: string;
  defaultAssetId?: string;
  debug?: boolean;
  /** Chain configuration - required for payment channel operations */
  chainConfig?: {
    chain: 'rooch';
    rpcUrl: string;
    [key: string]: any;
  };
  /** Optional storage configuration. If not provided, uses in-memory storage */
  storageOptions?: {
    channelRepo?: any; // ChannelRepository interface
    /** Namespace for storage keys (useful for multi-service scenarios) */
    namespace?: string;
  };
}

export class PaymentChannelMcpClient {
  private payerClient: PaymentChannelPayerClient;
  private options: McpPayerOptions;
  private logger: DebugLogger;
  private paymentState: PaymentState;
  private mcpClient: any | undefined;
  private notificationsSubscribed = false;
  private lastContents: any[] | undefined;

  constructor(options: McpPayerOptions) {
    this.options = options;
    this.logger = DebugLogger.get('PaymentChannelMcpClient');
    this.logger.setLevel(options.debug ? 'debug' : 'info');
    this.paymentState = new PaymentState();

    // Setup storage - use provided storage or default in-memory
    let channelRepo;
    if (options.storageOptions?.channelRepo) {
      channelRepo = options.storageOptions.channelRepo;
    } else {
      // Use in-memory channel repo by default for MCP client
      channelRepo = createDefaultChannelRepo();
    }

    this.payerClient = PaymentChannelFactory.createClient({
      chainConfig: options.chainConfig || {
        chain: 'rooch' as const,
        rpcUrl: 'http://localhost:6767',
      },
      signer: options.signer,
      keyId: options.keyId,
      storageOptions: {
        channelRepo,
      },
    });
  }

  async call<T = any>(method: string, params?: any): Promise<PaymentResult<T>> {
    const clientTxRef = crypto.randomUUID();
    const client = await this.ensureClient();
    await this.ensureNotificationSubscription();
    await this.ensureChannelReady();
    const reqParams = await this.buildParams(method, params, clientTxRef);

    // Debug: list tools once for visibility
    try {
      const listed = await client.listTools();
      this.logger.debug(
        `listTools(): ${JSON.stringify(listed && listed.tools ? listed.tools.map((t: any) => t.name) : [])}`
      );
    } catch {}

    // Call the tool directly via MCP SDK
    let result = await client.callTool({ name: method, arguments: reqParams });

    // Inline frame fallback on result container
    if (result && typeof result === 'object' && (result as any).__nuwa_payment_header__) {
      try {
        const decoded = HttpPaymentCodec.parseResponseHeader(
          (result as any).__nuwa_payment_header__
        );
        if (decoded?.subRav) {
          this.paymentState.setPendingSubRAV(decoded.subRav);
        }
      } catch {}
    }
    let data: any = result as any;
    let container: any = undefined;
    // If server returns MCP content envelope, unwrap JSON text and payment resource
    this.lastContents = undefined;
    if (
      result &&
      typeof result === 'object' &&
      (result as any).content &&
      Array.isArray((result as any).content)
    ) {
      const contents = (result as any).content as any[];
      this.lastContents = contents;
      // Prefer explicit data content if present; fallback to first text
      const dataItem = contents.find(c => c?.type === 'text') || contents[0];
      if (dataItem && dataItem.type === 'text' && typeof dataItem.text === 'string') {
        try {
          data = JSON.parse(dataItem.text);
        } catch {
          data = dataItem.text as any;
        }
      }
      // Extract payment resource via codec helper
      const payment = HttpPaymentCodec.parseMcpPaymentFromContents(contents);
      if (payment) {
        container = { __nuwa_payment: payment };
      }
    } else if (result && typeof result === 'object' && 'data' in result) {
      data = (result as any).data;
    }
    // Handle 402: pending proposal requires signature → sign and retry once
    const containerOrResult: any = container ?? result;
    const maybePayment = containerOrResult?.__nuwa_payment;
    if (maybePayment && maybePayment.error?.code === 'PAYMENT_REQUIRED' && maybePayment.subRav) {
      try {
        const subRav =
          (HttpPaymentCodec as any).deserializeSubRAV?.(maybePayment.subRav) ?? maybePayment.subRav;
        const signed = await this.payerClient.signSubRAV(subRav);
        // retry with signedSubRav
        const retryParams = await this.buildParams(method, params, clientTxRef);
        retryParams.__nuwa_payment = retryParams.__nuwa_payment || {};
        retryParams.__nuwa_payment.signedSubRav =
          (HttpPaymentCodec as any).serializeSignedSubRAV?.(signed) ?? signed;
        result = await client.callTool({ name: method, arguments: retryParams });
        // unwrap again
        if (
          result &&
          typeof result === 'object' &&
          (result as any).content &&
          Array.isArray((result as any).content)
        ) {
          const first = (result as any).content[0];
          this.lastContents = (result as any).content as any[];
          if (first && first.type === 'text' && typeof first.text === 'string') {
            try {
              const parsed = JSON.parse(first.text);
              container = parsed;
              data =
                parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
            } catch {}
          }
        } else if (result && typeof result === 'object' && 'data' in result) {
          data = (result as any).data;
        }
      } catch {}
    }

    const paymentInfo = await this.handlePaymentFromResult(container ?? result, clientTxRef);
    return { data, payment: paymentInfo };
  }

  getLastContents(): any[] | undefined {
    return this.lastContents;
  }

  getPendingSubRAV(): SubRAV | null {
    return this.paymentState.getPendingSubRAV() || null;
  }

  clearPendingSubRAV(): void {
    this.paymentState.clearPendingSubRAV();
  }

  private async buildParams(method: string, userParams: any, clientTxRef: string) {
    const payerDid = this.options.payerDid || (await this.options.signer.getDid());
    const signedSubRav = await this.buildSignedSubRavIfNeeded();
    const payment = {
      version: 1,
      clientTxRef,
      maxAmount: undefined as any,
      signedSubRav: signedSubRav
        ? ((HttpPaymentCodec as any).serializeSignedSubRAV?.(signedSubRav) ?? signedSubRav)
        : undefined,
    };
    const __nuwa_auth = await this.generateAuthToken(payerDid, method, clientTxRef);
    const params = { ...(userParams || {}), __nuwa_auth, __nuwa_payment: payment };
    // Normalize BigInt and other non-JSON-native types using lossless-json, then parse back
    return JSON.parse(serializeJson(params));
  }

  private async buildSignedSubRavIfNeeded(): Promise<SignedSubRAV | undefined> {
    const pending = this.paymentState.getPendingSubRAV();
    if (!pending) return undefined;
    this.paymentState.clearPendingSubRAV();
    return this.payerClient.signSubRAV(pending);
  }

  private async generateAuthToken(
    payerDid: string,
    method: string,
    clientTxRef: string
  ): Promise<string> {
    // Ensure we have a concrete keyId
    let keyId = this.options.keyId;
    if (!keyId) {
      const ids = await this.options.signer.listKeyIds();
      if (!ids || ids.length === 0) {
        throw new Error('No keyId available for DIDAuth signing');
      }
      keyId = ids[0];
    }
    const signedObject = await DIDAuth.v1.createSignature(
      {
        operation: 'mcp_tool_call',
        params: { tool: method, clientTxRef },
      },
      this.options.signer,
      keyId
    );
    return DIDAuth.v1.toAuthorizationHeader(signedObject);
  }

  private async ensureChannelReady(): Promise<void> {
    try {
      const payerDid = this.options.payerDid || (await this.options.signer.getDid());
      const payeeDid = this.options.payeeDid;
      const assetId = this.options.defaultAssetId || '0x3::gas_coin::RGas';
      if (!payeeDid) return;
      const channelId = deriveChannelId(payerDid, payeeDid, assetId);
      try {
        await this.payerClient.getChannelInfo(channelId);
        return; // exists
      } catch {
        // open if missing
        await this.payerClient.openChannelWithSubChannel({ payeeDid, assetId });
      }
    } catch {}
  }

  private async ensureClient(): Promise<any> {
    if (this.mcpClient) return this.mcpClient;
    if (!this.options.baseUrl) {
      throw new Error('MCP baseUrl is required to create client');
    }
    const base = String(this.options.baseUrl);
    const transport = new StreamableHTTPClientTransport(new URL(base));
    this.mcpClient = new McpClient({
      name: 'nuwa-payment-kit-client',
      version: '1.0.0',
    });
    await this.mcpClient.connect(transport);
    return this.mcpClient;
  }

  private async ensureNotificationSubscription(): Promise<void> {
    if (this.notificationsSubscribed) return;
    const client = await this.ensureClient();
    try {
      const subscribe = (client as any).on?.bind?.(client);
      if (typeof subscribe === 'function') {
        subscribe('notification', (msg: any) => {
          try {
            if (!msg || typeof msg !== 'object') return;
            if (msg.method === 'nuwa/payment' && msg.params?.headerValue) {
              const decoded = HttpPaymentCodec.parseResponseHeader(msg.params.headerValue);
              if (decoded?.subRav) {
                this.paymentState.setPendingSubRAV(decoded.subRav);
              }
            }
          } catch {}
        });
        this.notificationsSubscribed = true;
      }
    } catch {}
  }

  private async handlePaymentFromResult(
    result: any,
    clientTxRef: string
  ): Promise<PaymentInfo | undefined> {
    const p = result?.__nuwa_payment;
    if (!p) return undefined;
    try {
      const decoded = {
        version: p.version || 1,
        clientTxRef: p.clientTxRef || clientTxRef,
        serviceTxRef: p.serviceTxRef,
        subRav: p.subRav
          ? ((HttpPaymentCodec as any).deserializeSubRAV?.(p.subRav) ?? p.subRav)
          : undefined,
        cost: p.cost !== undefined ? BigInt(p.cost) : undefined,
        costUsd: p.costUsd !== undefined ? BigInt(p.costUsd) : undefined,
        error: p.error,
      };
      if (decoded.subRav) {
        this.paymentState.setPendingSubRAV(decoded.subRav);
      }
      if (decoded.error || decoded.cost === undefined || !decoded.subRav) return undefined;
      return {
        clientTxRef: decoded.clientTxRef,
        serviceTxRef: decoded.serviceTxRef,
        cost: decoded.cost,
        costUsd: decoded.costUsd ?? BigInt(0),
        nonce: decoded.subRav.nonce,
        channelId: decoded.subRav.channelId,
        vmIdFragment: decoded.subRav.vmIdFragment,
        assetId: this.options.defaultAssetId || '0x3::gas_coin::RGas',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return undefined;
    }
  }

  getPayerClient(): PaymentChannelPayerClient {
    return this.payerClient;
  }

  async healthCheck(): Promise<any> {
    const res = await this.call<any>('nuwa.health');
    return res.data;
  }

  async recoverFromService(): Promise<any> {
    const res = await this.call<any>('nuwa.recovery');
    return res.data;
  }

  async commitSubRAV(signedSubRAV: SignedSubRAV): Promise<{ success: true }> {
    const res = await this.call<any>('nuwa.commit', {
      signedSubRav: (HttpPaymentCodec as any).serializeSignedSubRAV?.(signedSubRAV) ?? signedSubRAV,
    });
    return { success: true };
  }
}
