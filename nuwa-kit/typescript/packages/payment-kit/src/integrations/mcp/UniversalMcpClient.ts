import type { PaymentResult, PaymentInfo } from '../../core/types';
import { PaymentChannelMcpClient } from './PaymentChannelMcpClient';
import type {
  McpPayerOptions,
  ListToolsOptions as PaymentListToolsOptions,
} from './PaymentChannelMcpClient';
import { ServerDetector } from './ServerDetector';
import type {
  EnhancedServerCapabilities,
  ServerDetectionResult,
  UniversalListToolsOptions,
} from './types';
import { McpServerType } from './types';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ZodTypeAny } from 'zod';
import type { ToolCallOptions, ToolSet } from 'ai';
import { McpToolConverter } from './McpToolConverter';
import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';

/**
 * CallToolResult type compatible with AI SDK's MCP implementation
 */
type CallToolResult =
  | {
      content: Array<
        | {
            type: 'text';
            text: string;
          }
        | {
            type: 'image';
            data: string; // base64 encoded
            mimeType: string;
          }
        | {
            type: 'resource';
            resource: {
              uri: string;
              name?: string;
              description?: string;
              mimeType?: string;
            } & (
              | {
                  text: string;
                }
              | {
                  blob: string; // base64 encoded
                }
            );
          }
      >;
      isError?: boolean;
      _meta?: Record<string, unknown>;
    }
  | {
      toolResult: unknown;
      _meta?: Record<string, unknown>;
    };

/**
 * Universal MCP client that automatically detects server type and adapts calling methods
 * Fully compatible with existing PaymentChannelMcpClient API
 */
export class UniversalMcpClient {
  private paymentClient?: PaymentChannelMcpClient;
  private standardClient?: McpClient;
  private capabilities?: EnhancedServerCapabilities;
  private serverType: McpServerType = McpServerType.UNKNOWN;
  private detector: ServerDetector;
  private logger: DebugLogger;
  private detectionResult?: ServerDetectionResult;

  constructor(
    private options: McpPayerOptions & {
      forceMode?: 'auto' | 'payment' | 'standard';
      detectionTimeout?: number;
      streamableTransport?: StreamableHTTPClientTransport;
    }
  ) {
    this.detector = new ServerDetector({
      timeout: options.detectionTimeout || 5000,
      cache: true,
      fetchImpl: (globalThis as any).fetch?.bind(globalThis),
    });
    this.logger = DebugLogger.get('UniversalMcpClient');
    this.logger.setLevel(options.debug ? 'debug' : 'info');
  }

  // ===== Fully compatible with existing API =====

  /**
   * Call a tool with payment processing and optional result validation
   * @deprecated Use callTool instead, but still supported for backward compatibility
   */
  async call<T = any>(method: string, params?: any, schema?: ZodTypeAny): Promise<PaymentResult<T>>;
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
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return await this.paymentClient.call(method, params, schemaOrOptions as any);
    }

    // For standard MCP server, simulate PaymentResult structure
    const { content } = await this.callTool(method, params);
    const raw = this.parseFirstJsonText<any>(content);
    let data: T;

    // Handle schema validation if provided
    if (schemaOrOptions) {
      let schema: ZodTypeAny | undefined;

      if (
        typeof schemaOrOptions === 'object' &&
        'clientTxRef' in schemaOrOptions &&
        schemaOrOptions.schema
      ) {
        schema = schemaOrOptions.schema;
      } else if (
        typeof (schemaOrOptions as any).safeParse === 'function' ||
        typeof (schemaOrOptions as any).parse === 'function'
      ) {
        schema = schemaOrOptions as ZodTypeAny;
      }

      if (schema) {
        try {
          data = schema.parse(raw);
        } catch (e) {
          this.logger.warn('Failed to parse response', { cause: e, raw, schema });
          throw new Error('Failed to parse response');
        }
      } else {
        data = raw as T;
      }
    } else {
      data = raw as T;
    }

    return { data, payment: undefined };
  }

  /**
   * Call a tool and return the content of the tool call
   */
  async callTool(name: string, args?: any): Promise<{ content: any[] }>;
  async callTool(
    name: string,
    args: any,
    options: { clientTxRef: string }
  ): Promise<{ content: any[] }>;
  async callTool(
    name: string,
    args?: any,
    optionsOrClientTxRef?: { clientTxRef: string } | string
  ): Promise<{ content: any[] }> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return await this.paymentClient.callTool(name, args, optionsOrClientTxRef as any);
    }

    // Standard MCP call
    const result = await this.standardClient!.callTool({ name, arguments: args || {} });
    return { content: Array.isArray(result.content) ? result.content : [] };
  }

  /**
   * Call a tool with payment processing
   */
  async callToolWithPayment(
    method: string,
    params?: any,
    clientTxRef?: string
  ): Promise<{ content: any[]; payment?: PaymentInfo }> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return await this.paymentClient.callToolWithPayment(method, params, clientTxRef);
    }

    // For standard MCP server, no payment info
    const { content } = await this.callTool(method, params);
    return { content, payment: undefined };
  }

  /**
   * List tools exposed by the server
   */
  async listTools(options?: UniversalListToolsOptions): Promise<Record<string, any>> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      const paymentOptions: PaymentListToolsOptions = {
        includeBuiltinTools: options?.includeBuiltinTools,
      };
      return await this.paymentClient.listTools(paymentOptions);
    }

    // Standard MCP listTools
    const result = await this.standardClient!.listTools();
    return this.normalizeToolsFormat(result);
  }

  /**
   * Get tools in AI SDK compatible format
   */
  async tools(options?: UniversalListToolsOptions): Promise<ToolSet> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      const paymentOptions: PaymentListToolsOptions = {
        includeBuiltinTools: options?.includeBuiltinTools,
      };
      const result = await this.paymentClient.tools(paymentOptions);
      this.logger.debug('Payment client tools result:', result);
      return result;
    }

    // Create ToolSet for standard MCP
    const result = await this.createStandardToolSet(options);
    this.logger.debug('Standard MCP tools result:', result);
    return result;
  }

  /**
   * List prompts exposed by the server (FREE, no payment)
   */
  async listPrompts(): Promise<any> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return await this.paymentClient.listPrompts();
    }

    // Standard MCP prompts
    return await this.standardClient!.listPrompts();
  }

  /**
   * Load a prompt by name and return string content (FREE, no payment)
   */
  async loadPrompt(name: string, args?: any): Promise<string> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return await this.paymentClient.loadPrompt(name, args);
    }

    // Standard MCP prompt loading
    const result = await this.standardClient!.getPrompt({ name, arguments: args || {} });
    return this.extractStringFromPromptResult(result);
  }

  /**
   * List resources (FREE, no payment)
   */
  async listResources(): Promise<any[]> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return await this.paymentClient.listResources();
    }

    // Standard MCP resources
    const result = await this.standardClient!.listResources();
    return Array.isArray(result?.resources) ? result.resources : [];
  }

  /**
   * List resource templates (FREE, no payment)
   */
  async listResourceTemplates(): Promise<any[]> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return await this.paymentClient.listResourceTemplates();
    }

    // Standard MCP resource templates
    const result = await this.standardClient!.listResourceTemplates();
    return Array.isArray(result.resourceTemplates) ? result.resourceTemplates : [];
  }

  /**
   * Read a resource
   */
  async readResource(params: string | { uri: string; [key: string]: any }): Promise<any> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return await this.paymentClient.readResource(params);
    }

    // Standard MCP resource reading
    const p = typeof params === 'string' ? { uri: params } : params;
    const result = await this.standardClient!.readResource(p);
    return this.normalizeResourceResult(result);
  }

  // ===== New methods =====

  /**
   * Get detected server type
   */
  getServerType(): McpServerType {
    return this.serverType;
  }

  /**
   * Get enhanced server capabilities
   */
  getCapabilities(): EnhancedServerCapabilities | undefined {
    return this.capabilities;
  }

  /**
   * Get standard MCP capabilities (without Nuwa extensions)
   */
  getStandardCapabilities(): ServerCapabilities {
    if (!this.capabilities) return {};
    const { nuwa, ...standard } = this.capabilities;
    return standard;
  }

  /**
   * Check if server supports payment protocol
   */
  supportsPayment(): boolean {
    return this.capabilities?.nuwa?.payment?.supported === true;
  }

  /**
   * Check if server supports DID authentication
   */
  supportsAuth(): boolean {
    return this.capabilities?.nuwa?.auth?.supported === true;
  }

  /**
   * Check if server has Nuwa built-in tools
   */
  hasBuiltinTools(): boolean {
    return this.capabilities?.nuwa?.builtinTools?.supported === true;
  }

  /**
   * Get detection result with timestamp
   */
  getDetectionResult(): ServerDetectionResult | undefined {
    return this.detectionResult;
  }

  /**
   * Force re-detection of server capabilities
   */
  async redetect(): Promise<ServerDetectionResult> {
    this.detector.clearCache();
    this.serverType = McpServerType.UNKNOWN;
    this.capabilities = undefined;
    this.detectionResult = undefined;

    // Close existing clients
    if (this.paymentClient) {
      await this.paymentClient.close();
      this.paymentClient = undefined;
    }
    if (this.standardClient) {
      await this.standardClient.close();
      this.standardClient = undefined;
    }

    await this.ensureInitialized();
    return this.detectionResult!;
  }

  // ===== Lifecycle Management =====

  /**
   * Close the client and clean up resources
   */
  async close(): Promise<void> {
    try {
      if (this.paymentClient) {
        await this.paymentClient.close();
        this.paymentClient = undefined;
      }
      if (this.standardClient) {
        await this.standardClient.close();
        this.standardClient = undefined;
      }

      this.serverType = McpServerType.UNKNOWN;
      this.capabilities = undefined;
      this.detectionResult = undefined;

      this.logger.debug('UniversalMcpClient closed successfully');
    } catch (error) {
      this.logger.warn('Error during close:', error);
      throw error;
    }
  }

  // ===== Internal Implementation =====

  /**
   * Ensure client is initialized and server type is detected
   */
  private async ensureInitialized(): Promise<void> {
    if (this.serverType !== McpServerType.UNKNOWN) return;

    // Handle force mode
    if (this.options.forceMode === 'payment') {
      this.serverType = McpServerType.PAYMENT_ENABLED;
      // Create clean options without Universal-specific properties
      const { forceMode, detectionTimeout, ...cleanOptions } = this.options;
      this.paymentClient = new PaymentChannelMcpClient(cleanOptions);
      this.capabilities = { nuwa: { payment: { supported: true } } };
      this.logger.debug('Forced payment mode');
      return;
    }

    if (this.options.forceMode === 'standard') {
      this.serverType = McpServerType.STANDARD;
      this.standardClient = await this.createStandardMcpClient();
      this.capabilities = {};
      this.logger.debug('Forced standard mode');
      return;
    }

    // Auto-detect server capabilities
    this.detectionResult = await this.detector.detectCapabilities(this.options.baseUrl);
    this.serverType = this.detectionResult.type;
    this.capabilities = this.detectionResult.capabilities;

    // Create appropriate client
    if (this.serverType === McpServerType.PAYMENT_ENABLED) {
      // Create clean options without Universal-specific properties
      const { forceMode, detectionTimeout, ...cleanOptions } = this.options;
      this.paymentClient = new PaymentChannelMcpClient(cleanOptions);
      this.logger.debug('Created payment-enabled client');
    } else {
      this.standardClient = await this.createStandardMcpClient();
      this.logger.debug('Created standard MCP client');
    }
  }

  /**
   * Create standard MCP client
   */
  private async createStandardMcpClient(): Promise<McpClient> {
    // Use custom transport if provided, otherwise use HTTP transport
    let transport: Transport;
    if (this.options.customTransport) {
      transport = this.options.customTransport;
    } else {
      transport = new StreamableHTTPClientTransport(new URL(this.options.baseUrl), this.options.streamableTransport);
    }

    const client = new McpClient({
      name: 'nuwa-universal-mcp-client',
      version: '1.0.0',
    });
    await client.connect(transport);
    return client;
  }

  /**
   * Normalize tools format for consistency
   */
  private normalizeToolsFormat(result: any): Record<string, any> {
    if (!result || !result.tools) return {};

    const normalized: Record<string, any> = {};
    for (const tool of result.tools) {
      if (tool && tool.name) {
        normalized[tool.name] = tool;
      }
    }
    return normalized;
  }

  /**
   * Create AI SDK compatible ToolSet for standard MCP
   */
  private async createStandardToolSet(options?: UniversalListToolsOptions): Promise<ToolSet> {
    const rawTools = await this.listTools(options);
    const toolSet: ToolSet = {};

    for (const [name, toolDef] of Object.entries(rawTools)) {
      if (toolDef && typeof toolDef === 'object') {
        toolSet[name] = McpToolConverter.convertToAiSdkFormat(
          { name, ...(toolDef as any) },
          async (args: any, options?: ToolCallOptions) => {
            const { content } = await this.callTool(name, args);
            return { content };
          }
        );
      }
    }

    return toolSet;
  }

  /**
   * Parse first JSON text from content array
   */
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

  /**
   * Extract string from prompt result
   */
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

  /**
   * Normalize resource result
   */
  private normalizeResourceResult(
    res: any
  ): { text?: string; blob?: any; mimeType?: string } | any {
    try {
      if (typeof res === 'string') return { text: res };
      if (res && typeof res === 'object') {
        if (typeof res.text === 'string') {
          return { text: res.text, mimeType: res.mimeType };
        }
        if (res.type === 'text' && typeof res.text === 'string') {
          return { text: res.text };
        }
        const contents = res.contents || res.content;
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

  // ===== Compatibility method proxies =====

  /**
   * Get underlying payment client (if available)
   */
  getPayerClient() {
    // Ensure initialization before checking
    if (this.serverType === McpServerType.UNKNOWN) {
      // Return undefined for now, will be available after first call
      return undefined;
    }

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return this.paymentClient.getPayerClient();
    }
    return undefined;
  }

  /**
   * Get transaction store (if available)
   */
  getTransactionStore() {
    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return this.paymentClient.getTransactionStore();
    }
    return undefined;
  }

  /**
   * Get last contents (if available)
   */
  getLastContents() {
    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return this.paymentClient.getLastContents();
    }
    return undefined;
  }

  /**
   * Get last payment payload (if available)
   */
  getLastPaymentPayload() {
    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return this.paymentClient.getLastPaymentPayload();
    }
    return undefined;
  }

  /**
   * Get pending SubRAV (if available)
   */
  getPendingSubRAV() {
    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return this.paymentClient.getPendingSubRAV();
    }
    return null;
  }

  /**
   * Clear pending SubRAV (if available)
   */
  clearPendingSubRAV(): void {
    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      this.paymentClient.clearPendingSubRAV();
    }
  }

  /**
   * Commit a signed SubRAV (if available)
   */
  async commitSubRAV(signedSubRAV: any): Promise<{ success: true }> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return await (this.paymentClient as any).commitSubRAV(signedSubRAV);
    }

    throw new Error('commitSubRAV is only available for payment-enabled servers');
  }

  /**
   * Health check (if available)
   */
  async healthCheck(): Promise<any> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return await (this.paymentClient as any).healthCheck();
    }

    // For standard MCP, we can try a basic tool call
    try {
      await this.callTool('ping', {});
      return { status: 'healthy' };
    } catch {
      return { status: 'unknown' };
    }
  }

  /**
   * Recover from service (if available)
   */
  async recoverFromService(): Promise<any> {
    await this.ensureInitialized();

    if (this.serverType === McpServerType.PAYMENT_ENABLED && this.paymentClient) {
      return await (this.paymentClient as any).recoverFromService();
    }

    throw new Error('recoverFromService is only available for payment-enabled servers');
  }
}
