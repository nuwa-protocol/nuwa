import { PaymentProcessor } from '../../core/PaymentProcessor';
import type { BillingContext } from '../../billing';
import type { BillingRule, RuleProvider } from '../../billing';
import { findRule } from '../../billing/core/rule-matcher';
import type {
  PaymentRequestPayload,
  PaymentResponsePayload,
  SerializableResponsePayload,
  SerializableRequestPayload,
} from '../../core/types';
import { HttpPaymentCodec } from '../http/HttpPaymentCodec';
import { DebugLogger, type DIDResolver, DIDAuth } from '@nuwa-ai/identity-kit';

export interface McpBillingMiddlewareConfig {
  processor: PaymentProcessor;
  ruleProvider: RuleProvider;
  didResolver: DIDResolver;
  debug?: boolean;
}

export interface McpRequestContext {
  method: string; // tool name, e.g., 'nuwa.health' or business tool
  params: Record<string, any> & {
    __nuwa_auth?: string;
    __nuwa_payment?: SerializableRequestPayload;
  };
}

export interface McpResponseContext<T = any> {
  data: T;
  __nuwa_payment?: SerializableResponsePayload | undefined;
}

export class McpBillingMiddleware {
  private readonly processor: PaymentProcessor;
  private readonly ruleProvider: RuleProvider;
  private readonly didResolver: DIDResolver;
  private readonly logger: DebugLogger;

  constructor(cfg: McpBillingMiddlewareConfig) {
    this.processor = cfg.processor;
    this.ruleProvider = cfg.ruleProvider;
    this.didResolver = cfg.didResolver;
    this.logger = DebugLogger.get('McpBillingMiddleware');
    this.logger.setLevel(cfg.debug ? 'debug' : 'info');
  }

  /** Pre-process to build BillingContext (align with HTTP new API) */
  async handleWithNewAPI(method: string, params: any, meta?: any): Promise<BillingContext | null> {
    const rule = this.findBillingRule(method);
    if (!rule) return null;

    const paymentData = this.extractPaymentData(params);
    const didInfo = await this.extractDidInfo(params?.__nuwa_auth);
    this.logger.debug('extract paymentData and didInfo from params', {
      params,
      paymentData,
      didInfo,
    });
    // Enforce auth when rule requires it (note: recovery requires auth)
    if ((rule as any)?.authRequired && !params?.__nuwa_auth) {
      const unauthorizedCtx = this.buildBillingContext(method, paymentData || undefined, rule, {
        ...(meta || {}),
        didInfo,
      });
      (unauthorizedCtx as any).state = {
        error: { code: 'UNAUTHORIZED', message: 'Authorization required' },
      };
      return unauthorizedCtx;
    }
    // (no-op)
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

    // Prefer structured payload on state for protocol-agnostic rendering
    const payload = settled.state?.responsePayload;
    if (payload) {
      structured = HttpPaymentCodec.toJSONResponse(payload);
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

  private extractPaymentData(params: any): PaymentRequestPayload | null {
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
    } as PaymentRequestPayload;
  }

  private buildBillingContext(
    toolName: string,
    paymentData: PaymentRequestPayload | undefined,
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

  async extractDidInfo(authHeader?: string): Promise<{ did: string; keyId: string } | undefined> {
    if (!authHeader) {
      this.logger.debug('extractDidInfo: no authHeader provided');
      return undefined;
    }

    this.logger.debug('extractDidInfo: processing authHeader', {
      authHeaderLength: authHeader.length,
      authHeaderPrefix: authHeader.substring(0, 50) + '...',
    });

    try {
      // Verify and parse DIDAuthV1 header using the injected didResolver
      this.logger.debug('extractDidInfo: calling DIDAuth.v1.verifyAuthHeader');
      const verify = await DIDAuth.v1.verifyAuthHeader(authHeader, this.didResolver);

      this.logger.debug('extractDidInfo: verifyAuthHeader result', {
        ok: verify.ok,
        hasSignedObject: !!verify.signedObject,
        error: !verify.ok ? verify.error : undefined,
      });

      if (!verify.ok) {
        this.logger.warn('extractDidInfo: DIDAuth verification failed', { error: verify.error });
        return undefined;
      }

      if (!verify.signedObject) {
        this.logger.warn('extractDidInfo: no signedObject in verification result');
        return undefined;
      }

      const sig = verify.signedObject.signature;
      this.logger.debug('extractDidInfo: signature info', {
        hasSignature: !!sig,
        signerDid: sig?.signer_did,
        keyId: sig?.key_id,
      });

      if (!sig?.signer_did || !sig?.key_id) {
        this.logger.warn('extractDidInfo: missing signer_did or key_id in signature', {
          signerDid: sig?.signer_did,
          keyId: sig?.key_id,
        });
        return undefined;
      }

      const result = { did: sig.signer_did, keyId: sig.key_id };
      this.logger.debug('extractDidInfo: successfully extracted didInfo', result);
      return result;
    } catch (error) {
      this.logger.error('extractDidInfo: exception occurred', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
}
