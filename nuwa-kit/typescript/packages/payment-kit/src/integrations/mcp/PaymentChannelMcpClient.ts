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
import {
  createDefaultChannelRepo,
  createDefaultTransactionStore,
  createDefaultMappingStore,
  createNamespacedMappingStore,
  extractHost,
} from '../http/internal/LocalStore';
import type { HostChannelMappingStore } from '../http/types';
import { RequestScheduler } from '../http/internal/RequestScheduler';
import { deriveChannelId } from '../../rooch/ChannelUtils';
import { serializeJson } from '../../utils/json';
import { McpChannelManager } from './McpChannelManager';
import { PaymentKitError } from '../../errors/PaymentKitError';
import type { ZodTypeAny } from 'zod';
import type { Tool, ToolCallOptions, ToolSet } from 'ai';

/**
 * CallToolResult type compatible with AI SDK's MCP implementation
 * This matches the exact structure used by AI SDK's createMCPClient
 * Based on: https://github.com/vercel/ai/blob/main/packages/ai/core/tool/mcp/types.ts
 */
type CallToolResult = {
  content: Array<{
    type: 'text';
    text: string;
  } | {
    type: 'image';
    data: string; // base64 encoded
    mimeType: string;
  } | {
    type: 'resource';
    resource: {
      uri: string;
      name?: string;
      description?: string;
      mimeType?: string;
    } & ({
      text: string;
    } | {
      blob: string; // base64 encoded
    });
  }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
} | {
  toolResult: unknown;
  _meta?: Record<string, unknown>;
};
import {
  HealthResponseSchema,
  RecoveryResponse,
  RecoveryResponseSchema,
  type HealthResponse,
} from '../../schema';
import type { ChainConfig } from '../../factory/chainFactory';
import type { TransactionStore } from '../../storage';

export interface McpPayerOptions {
  baseUrl: string; // MCP server endpoint (e.g., http://localhost:8080/mcp)
  signer: SignerInterface;
  keyId: string;
  debug?: boolean;
  /** Chain configuration - required for payment channel operations */
  chainConfig: ChainConfig;
  /** Optional storage configuration. If not provided, uses in-memory storage */
  storageOptions?: {
    channelRepo?: any; // ChannelRepository interface
    /** Namespace for storage keys (useful for multi-service scenarios) */
    namespace?: string;
  };
  maxAmount: bigint;
  /** Transaction logging */
  transactionStore?: TransactionStore;
  transactionLog?: {
    enabled?: boolean;
    persist?: 'memory' | 'indexeddb' | 'custom';
    maxRecords?: number;
    sanitizeRequest?: (
      headers: Record<string, string>,
      body?: any
    ) => { headersSummary?: Record<string, string>; requestBodyHash?: string };
  };
  /** Optional mapping store for state persistence. If not provided, uses default store */
  mappingStore?: HostChannelMappingStore;
}

export interface ListToolsOptions {
  /** Whether to include nuwa built-in tools (default: false) */
  includeBuiltinTools?: boolean;
}

export class PaymentChannelMcpClient {
  private payerClient: PaymentChannelPayerClient;
  private options: McpPayerOptions;
  private logger: DebugLogger;
  private paymentState: PaymentState;
  private mcpClient: McpClient | undefined;
  private notificationsSubscribed = false;
  private lastContents: any[] | undefined;
  private lastPaymentPayload: SerializableResponsePayload | undefined;
  private scheduler: RequestScheduler = new RequestScheduler();
  private channelManager: McpChannelManager;
  private transactionStore: TransactionStore;
  private host: string;
  private mappingStore: HostChannelMappingStore;

  constructor(options: McpPayerOptions) {
    this.options = options;
    this.logger = DebugLogger.get('PaymentChannelMcpClient');
    this.logger.setLevel(options.debug ? 'debug' : 'info');
    this.paymentState = new PaymentState();

    // Extract host for state persistence
    this.host = extractHost(options.baseUrl);

    // Setup mapping store for state persistence
    const baseMapping = options.mappingStore || createDefaultMappingStore();
    this.mappingStore = createNamespacedMappingStore(baseMapping, {
      getPayerDid: async () => await options.signer.getDid(),
    });

    // Setup storage - use provided storage or default in-memory
    let channelRepo;
    if (options.storageOptions?.channelRepo) {
      channelRepo = options.storageOptions.channelRepo;
    } else {
      // Use in-memory channel repo by default for MCP client
      channelRepo = createDefaultChannelRepo();
    }

    this.payerClient = PaymentChannelFactory.createClient({
      chainConfig: options.chainConfig,
      signer: options.signer,
      keyId: options.keyId,
      storageOptions: {
        channelRepo,
      },
    });
    // Initialize transaction store (shared across HTTP/MCP if provided)
    this.transactionStore = options.transactionStore || createDefaultTransactionStore();
    // Initialize MCP ChannelManager
    this.channelManager = new McpChannelManager({
      baseUrl: options.baseUrl,
      payerClient: this.payerClient,
      paymentState: this.paymentState,
      signer: options.signer,
      keyId: options.keyId,
      fetchImpl: (globalThis as any).fetch?.bind(globalThis),
      mcpCall: async (name: string, params?: any) => {
        const client = await this.ensureClient();
        const res = await client.callTool({ name, arguments: params || {} });
        return res;
      },
      autoRecover: false,
    });

    // Load persisted state asynchronously (don't block constructor)
    void this.loadPersistedState();
  }

  /**
   * Call a tool with payment processing and optional result validation
   * @param method - The method to call
   * @param params - The parameters to pass to the tool
   * @param schema - Schema for validation
   * @returns The result of the tool call
   */
  async call<T = any>(
    method: string,
    params?: any,
    schema?: ZodTypeAny
  ): Promise<PaymentResult<T>>;

  /**
   * Call a tool with payment processing, custom clientTxRef, and optional result validation
   * @param method - The method to call
   * @param params - The parameters to pass to the tool
   * @param options - Call options including clientTxRef and schema
   * @returns The result of the tool call
   */
  async call<T = any>(
    method: string,
    params: any,
    options: { clientTxRef: string; schema?: ZodTypeAny }
  ): Promise<PaymentResult<T>>;

  async call<T = any>(
    method: string,
    params?: any,
    schemaOrOptions?: ZodTypeAny | { clientTxRef: string; schema?: ZodTypeAny }
  ): Promise<PaymentResult<T>> {
    let schema: ZodTypeAny | undefined;
    let clientTxRef: string | undefined;
    
    // Type-safe parameter parsing with proper type guards
    if (
      schemaOrOptions &&
      typeof schemaOrOptions === 'object' &&
      // Ensure it's not a Zod schema (Zod schemas have a 'safeParse' function)
      !(
        typeof (schemaOrOptions as any).safeParse === 'function' ||
        typeof (schemaOrOptions as any).parse === 'function'
      ) &&
      'clientTxRef' in schemaOrOptions
    ) {
      // Options object pattern: call(method, params, { clientTxRef: 'xxx', schema: ... })
      clientTxRef = schemaOrOptions.clientTxRef;
      schema = schemaOrOptions.schema;
    } else {
      // Simple schema pattern: call(method, params, schema)
      schema = schemaOrOptions as ZodTypeAny | undefined;
    }

    const { content, payment } = await this.callToolWithPayment(method, params, clientTxRef);
    const raw = this.parseFirstJsonText<any>(content);
    let data = undefined;
    if (schema) {
      try {
        data = schema.parse(raw);
      } catch (e) {
        this.logger.warn('Failed to parse response', {
          cause: e,
          raw,
          schema,
        });
        throw new PaymentKitError('RESPONSE_PARSE_ERROR', 'Failed to parse response', 500, {
          cause: e,
          raw,
          schema,
        });
      }
    } else {
      data = raw as T;
    }
    return { data, payment };
  }

  /**
   * Call a tool and return the content of the tool call
   * @param name - The name of the tool to call
   * @param args - The parameters to pass to the tool
   * @returns The content of the tool call
   */
  async callTool(name: string, args?: any): Promise<{ content: any[] }>;

  /**
   * Call a tool with custom clientTxRef and return the content of the tool call
   * @param name - The name of the tool to call
   * @param args - The parameters to pass to the tool
   * @param options - Call options including clientTxRef
   * @returns The content of the tool call
   */
  async callTool(name: string, args: any, options: { clientTxRef: string }): Promise<{ content: any[] }>;

  async callTool(
    name: string, 
    args?: any, 
    optionsOrClientTxRef?: { clientTxRef: string } | string
  ): Promise<{ content: any[] }> {
    let clientTxRef: string | undefined;
    
    // Type-safe parameter parsing
    if (typeof optionsOrClientTxRef === 'string') {
      // Backward compatibility: support callTool(name, args, clientTxRef) usage pattern
      clientTxRef = optionsOrClientTxRef;
    } else if (optionsOrClientTxRef && typeof optionsOrClientTxRef === 'object' && 'clientTxRef' in optionsOrClientTxRef) {
      // New pattern: callTool(name, args, { clientTxRef: 'xxx' })
      clientTxRef = optionsOrClientTxRef.clientTxRef;
    }
    
    const { content } = await this.callToolWithPayment(name, args, clientTxRef);
    return { content };
  }

  /**
   * List prompts exposed by the server (FREE, no payment).
   */
  async listPrompts(): Promise<any> {
    const client = await this.ensureClient();
    if (typeof client.listPrompts === 'function') {
      return await client.listPrompts();
    }
    // Fallback: some clients expose prompts()
    if (typeof client.prompts === 'function') {
      return await client.prompts();
    }
    return {};
  }

  /**
   * Load a prompt by name and return string content (FREE, no payment).
   */
  async loadPrompt(name: string, args?: any): Promise<string> {
    const client = await this.ensureClient();
    if (typeof client.getPrompt === 'function') {
      const res = await client.getPrompt({ name, arguments: args || {} });
      return this.extractStringFromPromptResult(res);
    }
    // Fallback shape (AI-SDK style): tools().prompt.execute
    if (typeof client.prompts === 'function') {
      const prompts = await client.prompts();
      const p = prompts?.[name];
      if (p && typeof p.load === 'function') {
        const out = await p.load(args || {});
        return typeof out === 'string' ? out : JSON.stringify(out);
      }
    }
    throw new Error(`Prompt '${name}' not available`);
  }

  /**
   * List resources (FREE, no payment).
   */
  async listResources(): Promise<any[]> {
    const client = await this.ensureClient();
    if (typeof client.listResources === 'function') {
      return await client.listResources();
    }
    return [];
  }

  /**
   * List resource templates (FREE, no payment).
   */
  async listResourceTemplates(): Promise<any[]> {
    const client = await this.ensureClient();
    if (typeof client.listResourceTemplates === 'function') {
      return await client.listResourceTemplates();
    }
    return [];
  }

  /**
   * Read a resource. Accepts either uri string or parameter object.
   */
  async readResource(params: string | { uri: string; [key: string]: any }): Promise<any> {
    const client = await this.ensureClient();
    const p = typeof params === 'string' ? { uri: params } : params;
    if (typeof client.readResource === 'function') {
      const res = await client.readResource(p);
      return this.normalizeResourceResult(res);
    }
    throw new Error('readResource not supported by underlying MCP client');
  }

  /**
   * Returns tools exposed by the server with internal parameters filtered out for public consumption.
   * @param options - Options for filtering tools, or boolean for backward compatibility
   */
  async listTools(options?: ListToolsOptions): Promise<Record<string, any>> {
    const raw = await this.listToolsInternal();
    const sanitized = this.sanitizeTools(raw);

    const { includeBuiltinTools = false } = options || {};
    return includeBuiltinTools ? sanitized : this.filterBuiltinTools(sanitized);
  }

  /**
   * Internal listTools that returns server's raw schemas (may include SDK-internal parameters like __nuwa_auth and __nuwa_payment).
   */
  private async listToolsInternal(): Promise<any> {
    const client = await this.ensureClient();
    if (typeof client.listTools === 'function') {
      return await client.listTools();
    }
    return {};
  }

  /** Remove SDK-internal parameters from tool schemas (e.g., __nuwa_auth, __nuwa_payment). */
  private sanitizeTools(tools: any): any {
    const sanitizeSchema = (schema: any) => {
      try {
        if (!schema || typeof schema !== 'object') return schema;
        const out: any = { ...schema };
        const props = (schema as any).properties;
        if (props && typeof props === 'object') {
          const filtered: Record<string, any> = {};
          for (const [k, v] of Object.entries(props)) {
            if (typeof k === 'string' && k.startsWith('__nuwa')) continue;
            filtered[k] = v;
          }
          out.properties = filtered;
          if (Array.isArray(out.required)) {
            out.required = out.required.filter(
              (k: any) => typeof k !== 'string' || !k.startsWith('__nuwa')
            );
          }
        }
        return out;
      } catch {
        return schema;
      }
    };

    const sanitizeTool = (t: any) => {
      const inputSchemaKey = t?.inputSchema
        ? 'inputSchema'
        : t?.parameters
          ? 'parameters'
          : t?.input_schema
            ? 'input_schema'
            : undefined;
      if (!inputSchemaKey) return t;
      const copy = { ...t };
      copy[inputSchemaKey] = sanitizeSchema(t[inputSchemaKey]);
      return copy;
    };

    try {
      if (tools && Array.isArray((tools as any).tools)) {
        return { tools: (tools as any).tools.map(sanitizeTool) };
      }
      if (Array.isArray(tools)) {
        return (tools as any).map(sanitizeTool);
      }
      if (tools && typeof tools === 'object') {
        const out: Record<string, any> = {};
        for (const [name, v] of Object.entries(tools as Record<string, any>)) {
          out[name] = sanitizeTool({ name, ...(v as any) });
        }
        return out;
      }
    } catch {}
    return tools;
  }

  /** Filter out nuwa built-in tools that are not useful for AI consumption */
  private filterBuiltinTools(tools: any): any {
    const isBuiltinTool = (toolName: string): boolean => {
      return typeof toolName === 'string' && toolName.startsWith('nuwa.');
    };

    try {
      if (tools && Array.isArray((tools as any).tools)) {
        // Handle { tools: [...] } format
        const filtered = (tools as any).tools.filter((tool: any) => {
          return !(tool && typeof tool === 'object' && tool.name && isBuiltinTool(tool.name));
        });
        return { tools: filtered };
      }
      if (Array.isArray(tools)) {
        // Handle [...] format
        return (tools as any).filter((tool: any) => {
          return !(tool && typeof tool === 'object' && tool.name && isBuiltinTool(tool.name));
        });
      }
      if (tools && typeof tools === 'object') {
        // Handle { toolName: toolDef, ... } format
        const filtered: Record<string, any> = {};
        for (const [name, toolDef] of Object.entries(tools as Record<string, any>)) {
          if (!isBuiltinTool(name)) {
            filtered[name] = toolDef;
          }
        }
        return filtered;
      }
    } catch {}
    return tools;
  }

  /**
   * Call a tool with payment
   * @param method - The name of the tool to call
   * @param params - The parameters to pass to the tool
   * @param clientTxRef - Optional custom client transaction reference. If not provided, a UUID will be generated
   * @returns The content of the tool call and the payment info
   */
  async callToolWithPayment(
    method: string,
    params?: any,
    clientTxRef?: string
  ): Promise<{ content: any[]; payment?: PaymentInfo }> {
    const handle = this.scheduler.enqueue(async (_release, signal) => {
      const startTs = Date.now();
      let createdLog = false;
      const txEnabled = this.options.transactionLog?.enabled !== false;
      if (signal.aborted) throw new Error('Request aborted');
      const txRef = clientTxRef || crypto.randomUUID();
      const client = await this.ensureClient();
      if (signal.aborted) throw new Error('Request aborted');
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

      const reqParams = await this.buildParams(method, params, txRef);

      // Create transaction log entry
      if (txEnabled) {
        try {
          await this.logTransactionCreate(txRef, method, reqParams);
          createdLog = true;
        } catch (e) {
          this.logger.debug('txlog.create.failed', e);
        }
      }
      let result = await client.callTool({ name: method, arguments: reqParams });

      let content: any[] = [];
      let paymentPayload: SerializableResponsePayload | undefined;
      this.lastContents = undefined;
      if (
        result &&
        typeof result === 'object' &&
        (result as any).content &&
        Array.isArray((result as any).content)
      ) {
        const parsed = this.extractPaymentFromContents((result as any).content as any[]);
        content = parsed.clean;
        paymentPayload = parsed.payload;
      }

      const maybePayment = paymentPayload;
      // Unified retry: when server indicates PAYMENT_REQUIRED with unsignedSubRAV, sign and retry once
      if (maybePayment && maybePayment.error?.code === 'PAYMENT_REQUIRED' && maybePayment.subRav) {
        try {
          this.logger.debug('retry call', {
            method,
            clientTxRef: txRef,
          });
          const subRav = HttpPaymentCodec.deserializeSubRAV(maybePayment.subRav);
          const signed = await this.payerClient.signSubRAV(subRav);
          const retryParams = await this.buildParams(method, params, txRef);
          const newReqPayload: PaymentRequestPayload = {
            version: 1,
            clientTxRef: txRef,
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
            const parsed2 = this.extractPaymentFromContents((result as any).content as any[]);
            content = parsed2.clean;
            paymentPayload = parsed2.payload;
          }
        } catch {
          this.logger.debug('retry call failed', {
            method,
            clientTxRef: txRef,
          });
        }
      }

      // If payment still indicates an error at this point, throw a structured error
      if (paymentPayload && paymentPayload.error) {
        const err = paymentPayload.error as { code?: string; message?: string };
        const svc = paymentPayload.serviceTxRef;
        const cRef = paymentPayload.clientTxRef ?? txRef;
        const code = err?.code || 'PAYMENT_ERROR';
        const message = err?.message || 'Payment negotiation failed';
        const details = { code, message, clientTxRef: cRef, serviceTxRef: svc } as any;
        this.logger.debug('payment error', {
          method,
          clientTxRef: cRef,
          serviceTxRef: svc,
          paymentPayload,
        });
        const errObj = new PaymentKitError(code, message, 402, details);
        if (txEnabled && createdLog) {
          try {
            const durationMs = Date.now() - startTs;
            await this.transactionStore.update(cRef, {
              durationMs,
              status: 'error',
              errorCode: code,
              errorMessage: message,
            });
          } catch (e) {
            this.logger.debug('txlog.update.error', e);
          }
        }
        throw errObj;
      }

      const paymentInfo = await this.toPaymentInfoFromPayload(paymentPayload, txRef);
      if (txEnabled && createdLog) {
        try {
          const durationMs = Date.now() - startTs;
          if (paymentInfo) {
            await this.transactionStore.update(paymentInfo.clientTxRef, {
              durationMs,
              status: 'paid',
              payment: {
                cost: paymentInfo.cost,
                costUsd: paymentInfo.costUsd,
                nonce: paymentInfo.nonce,
                serviceTxRef: paymentInfo.serviceTxRef,
              },
              vmIdFragment: paymentInfo.vmIdFragment,
            });
          } else {
            await this.transactionStore.update(txRef, {
              durationMs,
              status: 'free',
            });
          }
        } catch (e) {
          this.logger.debug('txlog.update.error', e);
        }
      }
      return { content, payment: paymentInfo } as { content: any[]; payment?: PaymentInfo };
    });
    return await handle.promise;
  }

  getLastContents(): any[] | undefined {
    return this.lastContents;
  }

  getLastPaymentPayload(): SerializableResponsePayload | undefined {
    return this.lastPaymentPayload;
  }

  getPendingSubRAV(): SubRAV | null {
    return this.paymentState.getPendingSubRAV() || null;
  }

  clearPendingSubRAV(): void {
    this.paymentState.clearPendingSubRAV();
    // Persist state when SubRAV is cleared
    void this.persistClientState();
  }

  private parseFirstJsonText<T>(content: any[]): T | undefined {
    const dataItem = Array.isArray(content)
      ? content.find((c: any) => c?.type === 'text') || content[0]
      : undefined;
    if (dataItem && dataItem.type === 'text' && typeof dataItem.text === 'string') {
      try {
        return JSON.parse(dataItem.text) as T;
      } catch {
        return dataItem.text as any;
      }
    }
    return undefined;
  }

  // Schema should be provided by call sites for strong typing, no internal mapping

  private async buildParams(method: string, userParams: any, clientTxRef: string) {
    const payerDid = await this.options.signer.getDid();
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
    try {
      this.logger.debug?.('mcp.buildParams', {
        method,
        clientTxRef,
        hasAuth: typeof __nuwa_auth === 'string' && __nuwa_auth.length > 0,
        hasPayment: !!payment,
        signedSubRav,
      } as any);
    } catch {}
    // Normalize BigInt and other non-JSON-native types using lossless-json, then parse back
    return JSON.parse(serializeJson(params));
  }

  private async buildSignedSubRavIfNeeded(): Promise<SignedSubRAV | undefined> {
    const pending = this.paymentState.getPendingSubRAV();
    if (!pending) return undefined;
    this.paymentState.clearPendingSubRAV();
    // Persist state when SubRAV is cleared for signing
    void this.persistClientState();
    return this.payerClient.signSubRAV(pending);
  }

  private async generateAuthToken(
    payerDid: string,
    method: string,
    clientTxRef: string
  ): Promise<string> {
    // Ensure we have a concrete keyId
    const keyId = this.options.keyId;
    this.logger.debug('generateAuthToken', {
      payerDid,
      method,
      clientTxRef,
      keyId,
    });
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
      await this.channelManager.ensureChannelReady();
    } catch (e) {
      this.logger.debug('ensureChannelReady failed:', e);
      throw e instanceof Error ? e : new Error(String(e));
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
    const tools = await this.mcpClient.listTools();
    this.logger.debug('mcp.ensureClient', {
      baseUrl: this.options.baseUrl,
      tools,
    });
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
        // Persist state when SubRAV is updated
        void this.persistClientState();
      }
      if (decoded.error || decoded.cost === undefined || !decoded.subRav) return undefined;
      const channelInfo = this.paymentState.getChannelInfo();
      const assetId = channelInfo?.assetId ?? 'unknown';
      return {
        clientTxRef: decoded.clientTxRef ?? clientTxRef,
        serviceTxRef: decoded.serviceTxRef,
        cost: decoded.cost,
        costUsd: decoded.costUsd ?? BigInt(0),
        nonce: decoded.subRav.nonce,
        channelId: decoded.subRav.channelId,
        vmIdFragment: decoded.subRav.vmIdFragment,
        assetId: assetId,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return undefined;
    }
  }

  /** Single-pass extractor: separates payment resource and returns clean contents */
  private extractPaymentFromContents(contents: any[]): {
    clean: any[];
    payload?: SerializableResponsePayload;
  } {
    if (!Array.isArray(contents)) return { clean: [], payload: undefined };
    let payload: SerializableResponsePayload | undefined;
    const clean: any[] = [];
    for (const c of contents) {
      const isPayment =
        c &&
        c.type === 'resource' &&
        c.resource &&
        (c.resource.uri === HttpPaymentCodec.MCP_PAYMENT_URI ||
          c.resource.mimeType === HttpPaymentCodec.MCP_PAYMENT_MIME);
      if (isPayment) {
        try {
          const text = c?.resource?.text;
          if (typeof text === 'string') payload = JSON.parse(text) as SerializableResponsePayload;
        } catch {}
        continue;
      }
      clean.push(c);
    }
    // Track last payment payload and last contents (clean) for debugging/tests
    this.lastPaymentPayload = payload;
    this.lastContents = clean;
    return { clean, payload };
  }

  getPayerClient(): PaymentChannelPayerClient {
    return this.payerClient;
  }

  getTransactionStore(): TransactionStore {
    return this.transactionStore;
  }

  private extractStringFromPromptResult(res: any): string {
    if (typeof res === 'string') return res;
    if (res && typeof res === 'object') {
      // Try common shapes
      if (Array.isArray(res.content)) {
        const textItem = res.content.find((c: any) => c?.type === 'text');
        if (textItem?.text) return String(textItem.text);
      }
      if (typeof res.text === 'string') return res.text;
    }
    try {
      return JSON.stringify(res);
    } catch {
      return String(res);
    }
  }

  private normalizeResourceResult(
    res: any
  ): { text?: string; blob?: any; mimeType?: string } | any {
    try {
      if (typeof res === 'string') return { text: res };
      if (res && typeof res === 'object') {
        if (typeof res.text === 'string')
          return { text: res.text, mimeType: (res as any).mimeType };
        if (res.type === 'text' && typeof res.text === 'string') return { text: res.text };
        const contents = (res as any).contents || (res as any).content;
        if (Array.isArray(contents)) {
          const textItem = contents.find(
            (c: any) => c?.type === 'text' && typeof c.text === 'string'
          );
          if (textItem) return { text: String(textItem.text), mimeType: textItem.mimeType };
          const anyItem = contents[0];
          if (anyItem && (anyItem.blob || anyItem.data)) {
            return { blob: anyItem.blob || anyItem.data, mimeType: anyItem.mimeType };
          }
        }
      }
    } catch {}
    return res;
  }

  private async logTransactionCreate(
    clientTxRef: string,
    method: string,
    reqParams?: any
  ): Promise<void> {
    if (this.options.transactionLog?.enabled === false) return;
    const headersSummary: Record<string, string> = {
      tool: String(method),
    };
    try {
      const hasAuth = !!reqParams?.__nuwa_auth;
      const hasPayment = !!reqParams?.__nuwa_payment;
      const hasSignedSubRav = !!reqParams?.__nuwa_payment?.signedSubRav;
      headersSummary['hasAuth'] = String(hasAuth);
      headersSummary['hasPayment'] = String(hasPayment);
      headersSummary['hasSignedSubRav'] = String(hasSignedSubRav);
    } catch {}

    let requestBodyHash: string | undefined = undefined;
    try {
      const sanitize = this.options.transactionLog?.sanitizeRequest;
      if (sanitize) {
        const sanitized = sanitize(headersSummary, reqParams);
        if (sanitized?.headersSummary) {
          Object.assign(headersSummary, sanitized.headersSummary);
        }
        requestBodyHash = sanitized?.requestBodyHash;
      }
    } catch {}

    const channelId = this.paymentState.getChannelId();
    const vmIdFragment = this.paymentState.getVmIdFragment();
    const assetId = this.channelManager.getDefaultAssetId() || 'unknown';

    await this.transactionStore.create({
      clientTxRef,
      timestamp: Date.now(),
      protocol: 'mcp',
      urlOrTarget: this.options.baseUrl,
      operation: `tool:${method}`,
      headersSummary,
      requestBodyHash,
      stream: false,
      channelId: channelId,
      vmIdFragment: vmIdFragment,
      assetId: assetId,
      status: 'pending',
    });
  }

  async healthCheck(): Promise<HealthResponse> {
    const res = await this.call<HealthResponse>('nuwa.health', undefined, HealthResponseSchema);
    return res.data;
  }

  async recoverFromService(): Promise<RecoveryResponse> {
    const res = await this.call<RecoveryResponse>(
      'nuwa.recovery',
      undefined,
      RecoveryResponseSchema
    );
    return res.data;
  }

  async commitSubRAV(signedSubRAV: SignedSubRAV): Promise<{ success: true }> {
    await this.channelManager.commitSubRAV(signedSubRAV);
    return { success: true };
  }

  /**
   * Get tools in AI SDK compatible format
   * This method provides compatibility with AI SDK's streamText function
   * @param options - Options for filtering tools, or boolean for backward compatibility
   * @returns A record of tool definitions compatible with AI SDK
   */
  async tools(options?: ListToolsOptions): Promise<ToolSet> {
    const rawTools = await this.listTools(options);
    const aiSdkTools: ToolSet = {};

    // Convert MCP tool format to AI SDK tool format
    if (rawTools && typeof rawTools === 'object') {
      if (Array.isArray(rawTools.tools)) {
        // Handle { tools: [...] } format
        for (const tool of rawTools.tools) {
          if (tool && typeof tool === 'object' && tool.name) {
            aiSdkTools[tool.name] = this.convertToolToAiSdkFormat(tool);
          }
        }
      } else if (Array.isArray(rawTools)) {
        // Handle [...] format
        for (const tool of rawTools) {
          if (tool && typeof tool === 'object' && tool.name) {
            aiSdkTools[tool.name] = this.convertToolToAiSdkFormat(tool);
          }
        }
      } else {
        // Handle { toolName: toolDef, ... } format
        for (const [name, toolDef] of Object.entries(rawTools)) {
          if (toolDef && typeof toolDef === 'object') {
            const tool = { name, ...(toolDef as any) };
            aiSdkTools[name] = this.convertToolToAiSdkFormat(tool);
          }
        }
      }
    }

    return aiSdkTools;
  }

  /**
   * Convert MCP tool definition to AI SDK compatible format
   * @param tool - MCP tool definition
   * @returns AI SDK compatible tool with proper typing
   */
  private convertToolToAiSdkFormat(tool: {
    name: string;
    description?: string;
    inputSchema?: any;
    parameters?: any;
    input_schema?: any;
  }): Tool<Record<string, any>, CallToolResult> {
    // Extract schema from various possible locations
    // Note: tool should already be sanitized by listTools() -> sanitizeTools()
    const schema = tool.inputSchema || tool.parameters || tool.input_schema || {};

    return {
      description: tool.description || `Tool: ${tool.name}`,
      inputSchema: schema,
      // Add execute method that uses callToolWithPayment
      execute: async (args: any, options?: ToolCallOptions) => {
        // Use AI SDK's toolCallId as clientTxRef
        const clientTxRef = options?.toolCallId;
        const { content, payment: _ } = await this.callToolWithPayment(tool.name, args, clientTxRef);
        // We don't return the payment here, because the AI do not need to know about it
        return { content };
      },
    } as Tool<Record<string, any>, CallToolResult>;
  }

  /**
   * Close the MCP client connection and clean up resources
   */
  async close(): Promise<void> {
    try {
      // Persist final state before closing
      await this.persistClientState();

      // Close the underlying MCP client connection
      if (this.mcpClient) {
        await this.mcpClient.close();
        this.mcpClient = undefined;
      }

      // Note: RequestScheduler doesn't have a cancelAll method
      // Individual requests will be cancelled when the MCP client closes

      // Clear cached data
      this.lastContents = undefined;
      this.lastPaymentPayload = undefined;

      // Reset notification subscription state
      this.notificationsSubscribed = false;

      this.logger.debug('PaymentChannelMcpClient closed successfully');
    } catch (error) {
      this.logger.warn('Error during close:', error);
      throw error;
    }
  }

  /**
   * Load persisted state from storage
   */
  private async loadPersistedState(): Promise<void> {
    try {
      const state = await this.mappingStore.getState(this.host);
      if (state) {
        this.paymentState.loadPersistedState(state);
        this.logger.debug('Loaded persisted state for host:', this.host);
      }
    } catch (error) {
      this.logger.debug('Failed to load persisted state:', error);
    }
  }

  /**
   * Persist current client state to storage
   */
  private async persistClientState(): Promise<void> {
    try {
      const state = this.paymentState.getPersistedState();
      await this.mappingStore.setState(this.host, state);
      this.logger.debug('Persisted client state for host:', this.host);
    } catch (error) {
      this.logger.debug('Failed to persist client state:', error);
    }
  }

  /**
   * Clear persisted state (useful for logout/cleanup)
   */
  async clearPersistedState(): Promise<void> {
    try {
      await this.mappingStore.deleteState(this.host);
      this.paymentState.reset();
      this.logger.debug('Cleared persisted state for host:', this.host);
    } catch (error) {
      this.logger.debug('Failed to clear persisted state:', error);
    }
  }
}
