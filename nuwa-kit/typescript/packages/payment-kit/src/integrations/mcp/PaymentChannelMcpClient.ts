import type {
  PaymentResult,
  SubRAV,
  SignedSubRAV,
  PaymentInfo,
  SerializableResponsePayload,
  SerializableRequestPayload,
  PaymentRequestPayload,
} from '../../core/types';
import { PaymentChannelPayerClient } from '../../client/PaymentChannelPayerClient';
import { PaymentChannelFactory } from '../../factory/chainFactory';
import { DebugLogger, DIDAuth, type SignerInterface } from '@nuwa-ai/identity-kit';
import { PaymentState } from '../http/core/PaymentState';
import { HttpPaymentCodec } from '../../middlewares/http/HttpPaymentCodec';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createDefaultChannelRepo } from '../http/internal/LocalStore';
import { RequestScheduler } from '../http/internal/RequestScheduler';
import { deriveChannelId } from '../../rooch/ChannelUtils';
import { serializeJson } from '../../utils/json';
import { McpChannelManager } from './McpChannelManager';
import { PaymentKitError } from '../../errors/PaymentKitError';

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
  maxAmount: bigint;
}

export class PaymentChannelMcpClient {
  private payerClient: PaymentChannelPayerClient;
  private options: McpPayerOptions;
  private logger: DebugLogger;
  private paymentState: PaymentState;
  private mcpClient: any | undefined;
  private notificationsSubscribed = false;
  private lastContents: any[] | undefined;
  private scheduler: RequestScheduler = new RequestScheduler();
  private cachedDiscovery: any | undefined;
  private channelManager?: McpChannelManager;

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
    // Initialize MCP ChannelManager
    this.channelManager = new McpChannelManager({
      baseUrl: options.baseUrl,
      payerClient: this.payerClient,
      paymentState: this.paymentState,
      signer: options.signer,
      keyId: options.keyId,
      payerDid: options.payerDid,
      payeeDid: options.payeeDid,
      defaultAssetId: options.defaultAssetId,
      fetchImpl: (globalThis as any).fetch?.bind(globalThis),
      mcpCall: async (name: string, params?: any) => {
        const client = await this.ensureClient();
        const res = await client.callTool({ name, arguments: params || {} });
        return res;
      },
      autoRecover: false,
    });
  }

  /**
   * Call a tool with payment, this is a convenience method that returns the first text as data for convenience API
   * @param method - The method to call
   * @param params - The parameters to pass to the tool
   * @returns The result of the tool call
   */
  async call<T = any>(method: string, params?: any): Promise<PaymentResult<T>> {
    const { content, payment } = await this.callToolWithPayment(method, params);
    // Extract first text as data for convenience API
    let data: any = undefined;
    const dataItem = Array.isArray(content)
      ? content.find((c: any) => c?.type === 'text') || content[0]
      : undefined;
    if (dataItem && dataItem.type === 'text' && typeof dataItem.text === 'string') {
      try {
        data = JSON.parse(dataItem.text);
      } catch {
        data = dataItem.text as any;
      }
    }
    return { data, payment };
  }

  /**
   * Call a tool returns the content of the tool call
   * @param name - The name of the tool to call
   * @param args - The parameters to pass to the tool
   * @returns The content of the tool call
   */
  async callTool(name: string, args?: any): Promise<{ content: any[] }> {
    const { content } = await this.callToolWithPayment(name, args);
    return { content };
  }

  /**
   * Call a tool with payment
   * @param method - The name of the tool to call
   * @param params - The parameters to pass to the tool
   * @returns The content of the tool call and the payment info
   */
  async callToolWithPayment(
    method: string,
    params?: any
  ): Promise<{ content: any[]; payment?: PaymentInfo }> {
    const handle = this.scheduler.enqueue(async (_release, signal) => {
      if (signal.aborted) throw new Error('Request aborted');
      const clientTxRef = crypto.randomUUID();
      await this.ensureDiscovery();
      if (signal.aborted) throw new Error('Request aborted');
      const client = await this.ensureClient();
      await this.ensureNotificationSubscription();
      // Skip ensureChannelReady for info/free tools to avoid recursive recovery loops
      const infoTools = new Set([
        'nuwa.health',
        'nuwa.discovery',
        'nuwa.recovery',
        'nuwa.admin.status',
        'nuwa.subrav.query',
      ]);
      if (!infoTools.has(method)) {
        await this.ensureChannelReady();
      }
      if (signal.aborted) throw new Error('Request aborted');

      const reqParams = await this.buildParams(method, params, clientTxRef);
      let result = await client.callTool({ name: method, arguments: reqParams });

      let content: any[] = [];
      let paymentPayload: any | undefined;
      this.lastContents = undefined;
      if (
        result &&
        typeof result === 'object' &&
        (result as any).content &&
        Array.isArray((result as any).content)
      ) {
        content = (result as any).content as any[];
        this.lastContents = content;
        paymentPayload = HttpPaymentCodec.parseMcpPaymentFromContents(content);
      }

      const maybePayment = paymentPayload;
      // Unified retry: when server indicates PAYMENT_REQUIRED with unsignedSubRAV, sign and retry once
      if (maybePayment && maybePayment.error?.code === 'PAYMENT_REQUIRED' && maybePayment.subRav) {
        try {
          this.logger.debug('retry call', {
            method,
            clientTxRef,
          });
          const subRav = HttpPaymentCodec.deserializeSubRAV(maybePayment.subRav);
          const signed = await this.payerClient.signSubRAV(subRav);
          const retryParams = await this.buildParams(method, params, clientTxRef);
          const newReqPayload: PaymentRequestPayload = {
            version: 1,
            clientTxRef,
            maxAmount: this.options.maxAmount,
            signedSubRav: signed,
          };
          retryParams.__nuwa_payment = HttpPaymentCodec.toJSONRequest(newReqPayload);
          result = await client.callTool({ name: method, arguments: retryParams });
          if (
            result &&
            typeof result === 'object' &&
            (result as any).content &&
            Array.isArray((result as any).content)
          ) {
            content = (result as any).content as any[];
            this.lastContents = content;
            paymentPayload = HttpPaymentCodec.parseMcpPaymentFromContents(content);
          }
        } catch {
          this.logger.debug('retry call failed', {
            method,
            clientTxRef,
          });
        }
      }

      // If payment still indicates an error at this point, throw a structured error
      if (paymentPayload && (paymentPayload as any).error) {
        const err = (paymentPayload as any).error as { code?: string; message?: string };
        const svc = (paymentPayload as any).serviceTxRef;
        const cRef = (paymentPayload as any).clientTxRef ?? clientTxRef;
        const code = err?.code || 'PAYMENT_ERROR';
        const message = err?.message || 'Payment negotiation failed';
        const details = { code, message, clientTxRef: cRef, serviceTxRef: svc } as any;
        const errObj = new PaymentKitError(code, message, details);
        throw errObj;
      }

      const paymentInfo = await this.toPaymentInfoFromPayload(paymentPayload, clientTxRef);
      return { content, payment: paymentInfo } as { content: any[]; payment?: PaymentInfo };
    });
    return await handle.promise;
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
    const reqPayload: PaymentRequestPayload = {
      version: 1,
      clientTxRef,
      maxAmount: this.options.maxAmount,
      signedSubRav: signedSubRav || undefined,
    };
    const payment: SerializableRequestPayload = HttpPaymentCodec.toJSONRequest(reqPayload);
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
      await this.channelManager?.ensureChannelReady();
    } catch (e) {
      this.logger.debug('ensureChannelReady failed:', e);
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  private async ensureDiscovery(): Promise<any | undefined> {
    if (this.cachedDiscovery) return this.cachedDiscovery;
    try {
      const base = new URL(String(this.options.baseUrl));
      const origin = `${base.protocol}//${base.host}`;
      const url = `${origin}/.well-known/nuwa-payment/info`;
      const fetchImpl: any = (globalThis as any).fetch?.bind(globalThis);
      if (!fetchImpl) return undefined;
      const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!res.ok) return undefined;
      const json = await res.json();
      this.cachedDiscovery = json;
      return json;
    } catch {
      return undefined;
    }
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
    // Placeholder for future resources/subscribe implementation.
    // Tool streaming is not supported; do not subscribe to tool notifications.
    return;
  }

  private async toPaymentInfoFromPayload(
    payload: SerializableResponsePayload | undefined,
    clientTxRef: string
  ): Promise<PaymentInfo | undefined> {
    if (!payload) return undefined;
    try {
      const decoded = HttpPaymentCodec.fromJSONResponse(payload);
      if (decoded.subRav) {
        this.paymentState.setPendingSubRAV(decoded.subRav);
      }
      if (decoded.error || decoded.cost === undefined || !decoded.subRav) return undefined;
      return {
        clientTxRef: decoded.clientTxRef ?? clientTxRef,
        serviceTxRef: decoded.serviceTxRef,
        cost: decoded.cost,
        costUsd: decoded.costUsd ?? BigInt(0),
        nonce: decoded.subRav.nonce,
        channelId: decoded.subRav.channelId,
        vmIdFragment: decoded.subRav.vmIdFragment,
        //TODO get assetId from channelInfo
        assetId: this.options.defaultAssetId ?? '0x3::gas_coin::RGas',
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
    const res = await this.channelManager?.recoverFromService();
    return res as any;
  }

  async commitSubRAV(signedSubRAV: SignedSubRAV): Promise<{ success: true }> {
    await this.channelManager?.commitSubRAV(signedSubRAV);
    return { success: true };
  }
}
