import type { BillingContext, BillingRule, RuleProvider } from '../../billing';
import { findRule } from '../../billing';
import { PaymentProcessor } from '../../core/PaymentProcessor';
import type { McpPaymentRequestParams } from '../../integrations/mcp/internal/codecAdapter';
import { extractPaymentFromParams, buildResponseMetaFromHeader } from '../../integrations/mcp/internal/codecAdapter';
import { HttpPaymentCodec } from '../http/HttpPaymentCodec';
import { DebugLogger } from '@nuwa-ai/identity-kit';

export interface McpBillingMiddlewareConfig {
  processor: PaymentProcessor;
  ruleProvider: RuleProvider;
  debug?: boolean;
}

export interface McpCallContext {
  method: string;
  params: McpPaymentRequestParams;
  meta?: any;
}

export type McpExecuteHandler = (params: any, meta?: any) => Promise<any>;

export class McpBillingMiddleware {
  private readonly processor: PaymentProcessor;
  private readonly rules: RuleProvider;
  private readonly logger: DebugLogger;

  constructor(cfg: McpBillingMiddlewareConfig) {
    this.processor = cfg.processor;
    this.rules = cfg.ruleProvider;
    this.logger = DebugLogger.get('McpBillingMiddleware');
    this.logger.setLevel(cfg.debug ? 'debug' : 'info');
  }

  async preProcess(call: McpCallContext): Promise<BillingContext | null> {
    const rule = this.findRule(call);
    if (!rule) return null;

    const payment = extractPaymentFromParams(call.params) || undefined;
    const didInfo = (call.meta as any)?.didInfo; // FastMCP authenticate can attach

    const ctx: BillingContext = {
      serviceId: this.processor.getServiceId(),
      meta: {
        operation: `MCP:${call.method}`,
        billingRule: rule,
        maxAmount: payment?.maxAmount,
        signedSubRav: payment?.signedSubRav,
        clientTxRef: payment?.clientTxRef || crypto.randomUUID(),
        didInfo,
        mcpMethod: call.method,
        mcpParams: call.params,
      },
    };

    return await this.processor.preProcess(ctx);
  }

  settle(ctx: BillingContext, usage?: number): BillingContext {
    return this.processor.settle(ctx, usage);
  }

  async persist(ctx: BillingContext): Promise<void> {
    await this.processor.persist(ctx);
  }

  attachResponseMeta(result: any, settled: BillingContext): any {
    const headerValue = settled.state?.headerValue as string | undefined;
    const meta = buildResponseMetaFromHeader(headerValue);
    if (meta) {
      if (result && typeof result === 'object') {
        (result as any).__nuwa_payment = meta;
      } else {
        return { data: result, __nuwa_payment: meta };
      }
    }
    return result;
  }

  private findRule(call: McpCallContext): BillingRule | undefined {
    // Map MCP tool name to a synthetic HTTP path used by BillableRouter
    const meta = { method: 'GET', path: `/mcp/${call.method}` };
    return findRule(meta, this.rules.getRules());
  }
}


