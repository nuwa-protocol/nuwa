import { PaymentProcessor } from '../../core/PaymentProcessor';
import type { BillingContext } from '../../billing';
import type { BillingRule, RuleProvider } from '../../billing';
import { findRule } from '../../billing/core/rule-matcher';
import type { PaymentHeaderPayload, PaymentResponsePayload } from '../../core/types';
import { HttpPaymentCodec } from '../http/HttpPaymentCodec';
import { DebugLogger } from '@nuwa-ai/identity-kit';

export interface McpBillingMiddlewareConfig {
  processor: PaymentProcessor;
  ruleProvider: RuleProvider;
  debug?: boolean;
}

export interface McpRequestContext {
  method: string; // tool name, e.g., 'nuwa.health' or business tool
  params: Record<string, any> & {
    __nuwa_auth?: string;
    __nuwa_payment?: {
      version?: number;
      clientTxRef?: string;
      maxAmount?: string;
      signedSubRav?: any;
    };
  };
  meta?: Record<string, any>;
}

export interface McpResponseContext<T = any> {
  data: T;
  __nuwa_payment?: ReturnType<McpBillingMiddleware['buildStructuredPaymentResult']> | undefined;
}

export class McpBillingMiddleware {
  private readonly processor: PaymentProcessor;
  private readonly ruleProvider: RuleProvider;
  private readonly logger: DebugLogger;

  constructor(cfg: McpBillingMiddlewareConfig) {
    this.processor = cfg.processor;
    this.ruleProvider = cfg.ruleProvider;
    this.logger = DebugLogger.get('McpBillingMiddleware');
    this.logger.setLevel(cfg.debug ? 'debug' : 'info');
  }

  /** Pre-process to build BillingContext (align with HTTP new API) */
  async handleWithNewAPI(method: string, params: any, meta?: any): Promise<BillingContext | null> {
    const rule = this.findBillingRule(method);
    if (!rule) return null;

    const paymentData = this.extractPaymentData(params);
    const ctx = this.buildBillingContext(method, paymentData || undefined, rule, meta);
    const processed = await this.processor.preProcess(ctx);
    return processed;
  }

  /** After business handler returns, settle and inject payment data */
  async settle<T = any>(
    ctx: BillingContext,
    businessResult: T,
    usage?: number
  ): Promise<McpResponseContext<T>> {
    const settled = this.processor.settle(ctx, usage);
    let structured: McpResponseContext<T>['__nuwa_payment'];

    if (settled.state?.headerValue) {
      const decoded = HttpPaymentCodec.parseResponseHeader(settled.state.headerValue);
      structured = this.buildStructuredPaymentResult(decoded);
    }

    // Persist if needed
    if (settled.state?.unsignedSubRav) {
      await this.processor.persist(settled);
    }

    return { data: businessResult, __nuwa_payment: structured };
  }

  private findBillingRule(toolName: string): BillingRule | undefined {
    const meta = { method: 'MCP', path: `/tool/${toolName}` };
    return findRule(meta, this.ruleProvider.getRules());
  }

  private extractPaymentData(params: any): PaymentHeaderPayload | null {
    const p = params?.__nuwa_payment;
    if (!p) return null;
    return {
      version: p.version || 1,
      clientTxRef: p.clientTxRef,
      maxAmount: p.maxAmount ? BigInt(p.maxAmount) : BigInt(0),
      signedSubRav: p.signedSubRav,
    } as PaymentHeaderPayload;
  }

  private buildBillingContext(
    toolName: string,
    paymentData: PaymentHeaderPayload | undefined,
    billingRule: BillingRule | undefined,
    meta?: any
  ): BillingContext {
    return {
      serviceId: this.processor.getServiceId(),
      meta: {
        operation: `MCP:tool/${toolName}`,
        billingRule,
        maxAmount: paymentData?.maxAmount,
        signedSubRav: paymentData?.signedSubRav,
        clientTxRef: paymentData?.clientTxRef || crypto.randomUUID(),
        didInfo: meta?.didInfo,
        mcpMethod: toolName,
      },
    };
  }

  private buildStructuredPaymentResult(decoded: PaymentResponsePayload) {
    return {
      version: decoded.version,
      clientTxRef: decoded.clientTxRef,
      serviceTxRef: decoded.serviceTxRef,
      subRav: decoded.subRav
        ? ((HttpPaymentCodec as any).serializeSubRAV?.(decoded.subRav) ??
          serializeSubRAV(decoded.subRav))
        : undefined,
      cost: decoded.cost !== undefined ? decoded.cost.toString() : undefined,
      costUsd: decoded.costUsd !== undefined ? decoded.costUsd.toString() : undefined,
      error: decoded.error,
    } as any;
  }
}

function serializeSubRAV(subRav: any): Record<string, string> {
  return {
    version: String(subRav.version),
    chainId: String(subRav.chainId),
    channelId: subRav.channelId,
    channelEpoch: String(subRav.channelEpoch),
    vmIdFragment: subRav.vmIdFragment,
    accumulatedAmount: String(subRav.accumulatedAmount),
    nonce: String(subRav.nonce),
  };
}
