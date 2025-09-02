import { PaymentProcessor } from '../../core/PaymentProcessor';
import type { BillingContext } from '../../billing';
import type { BillingRule, RuleProvider } from '../../billing';
import { findRule } from '../../billing/core/rule-matcher';
import type {
  PaymentHeaderPayload,
  PaymentResponsePayload,
  SerializableResponsePayload,
} from '../../core/types';
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
  __nuwa_payment?: SerializableResponsePayload | undefined;
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
    const didInfo = await this.extractDidInfo(params?.__nuwa_auth);
    const ctx = this.buildBillingContext(method, paymentData || undefined, rule, {
      ...(meta || {}),
      didInfo,
    });
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
    let structured: SerializableResponsePayload | undefined;

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
    // Match BillableRouter's HTTP-style rules
    const meta = { method: 'POST', path: `/tool/${toolName}` } as any;
    return findRule(meta, this.ruleProvider.getRules());
  }

  private extractPaymentData(params: any): PaymentHeaderPayload | null {
    const p = params?.__nuwa_payment;
    if (!p) return null;
    const signed = p.signedSubRav
      ? ((HttpPaymentCodec as any).deserializeSignedSubRAV?.(p.signedSubRav) ?? p.signedSubRav)
      : undefined;
    return {
      version: p.version || 1,
      clientTxRef: p.clientTxRef,
      maxAmount: p.maxAmount ? BigInt(p.maxAmount) : BigInt(0),
      signedSubRav: signed,
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

  private buildStructuredPaymentResult(
    decoded: PaymentResponsePayload
  ): SerializableResponsePayload {
    return HttpPaymentCodec.toJSONResponse(decoded);
  }
}

// Import here to avoid circular deps at top
import { DIDAuth } from '@nuwa-ai/identity-kit';

// Extend class with method implementation
export interface McpBillingMiddleware {
  extractDidInfo: (authHeader?: string) => Promise<{ did: string; keyId: string } | undefined>;
}

McpBillingMiddleware.prototype.extractDidInfo = async function (
  authHeader?: string
): Promise<{ did: string; keyId: string } | undefined> {
  if (!authHeader) return undefined;
  try {
    // Verify and parse DIDAuthV1 header
    const resolver = (this as any).processor?.['config']?.didResolver;
    if (!resolver) return undefined;
    const verify = await DIDAuth.v1.verifyAuthHeader(authHeader, resolver);
    if (!verify.ok || !verify.signedObject) return undefined;
    const sig = verify.signedObject.signature;
    if (!sig?.signer_did || !sig?.key_id) return undefined;
    return { did: sig.signer_did, keyId: sig.key_id };
  } catch {
    return undefined;
  }
};

// serializeSubRAV helper removed; HttpPaymentCodec handles JSON serialization
