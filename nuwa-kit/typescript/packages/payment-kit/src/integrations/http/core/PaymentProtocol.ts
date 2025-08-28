import type { SubRAV, SignedSubRAV } from '../../../core/types';
import type { PaymentRequestContext } from '../types';
import { HttpPaymentCodec } from '../internal/codec';
import { PaymentKitError } from '../../../errors';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import { PaymentErrorCode } from '../../../errors/codes';

export interface PaymentHeaderData {
  subRav?: SubRAV;
  signedSubRav?: SignedSubRAV;
  cost?: bigint;
  costUsd?: bigint;
  clientTxRef?: string;
  serviceTxRef?: string;
  error?: {
    code: string;
    message?: string;
  };
}

export type ProtocolResult =
  | { type: 'none' }
  | { type: 'error'; clientTxRef?: string; err: PaymentKitError }
  | {
      type: 'success';
      clientTxRef?: string;
      subRav: SubRAV;
      cost: bigint;
      costUsd?: bigint;
      serviceTxRef?: string;
    };

/**
 * PaymentProtocol handles all protocol-specific logic including:
 * - SubRAV signing
 * - Header encoding/decoding
 * - Response parsing
 */
export class PaymentProtocol {
  private logger: DebugLogger;
  private codec: HttpPaymentCodec;

  constructor() {
    this.logger = DebugLogger.get('PaymentProtocol');
    this.codec = new HttpPaymentCodec();
  }

  /**
   * Encode payment header for requests
   */
  encodeRequestHeader(
    signedSubRAV: SignedSubRAV | undefined,
    clientTxRef: string,
    maxAmount: bigint = BigInt(0)
  ): string {
    return this.codec.encodePayload({
      signedSubRav: signedSubRAV,
      maxAmount,
      clientTxRef,
      version: 1,
    });
  }

  /**
   * Parse payment header from response
   */
  parseResponseHeader(headerValue: string): PaymentHeaderData {
    try {
      return HttpPaymentCodec.parseResponseHeader(headerValue);
    } catch (error) {
      this.logger.debug('Failed to parse payment header:', error);
      throw error;
    }
  }

  /**
   * Extract protocol information from response headers
   */
  parseProtocolFromResponse(response: Response, context?: PaymentRequestContext): ProtocolResult {
    const headerName = HttpPaymentCodec.getHeaderName();
    let paymentHeader = response.headers.get(headerName);

    if (!paymentHeader) {
      paymentHeader = response.headers.get(headerName.toLowerCase());
    }

    if (!paymentHeader) {
      return { type: 'none' };
    }

    try {
      const payload = this.parseResponseHeader(paymentHeader);

      if (payload?.error) {
        const code = payload.error.code;
        const message = payload.error.message || response.statusText || 'Payment error';
        return {
          type: 'error',
          clientTxRef: payload.clientTxRef || context?.clientTxRef,
          err: new PaymentKitError(code, message, response.status),
        };
      }

      if (payload?.subRav && payload.cost !== undefined) {
        return {
          type: 'success',
          clientTxRef: payload.clientTxRef || context?.clientTxRef,
          subRav: payload.subRav,
          cost: payload.cost,
          costUsd: payload.costUsd,
          serviceTxRef: payload.serviceTxRef,
        };
      }

      return { type: 'none' };
    } catch (e) {
      this.logger.debug('Failed to parse payment response header:', e);
      return { type: 'none' };
    }
  }

  /**
   * Handle protocol errors based on HTTP status codes
   */
  handleStatusCode(status: number): PaymentKitError | null {
    switch (status) {
      case 402:
        return new PaymentKitError(
          PaymentErrorCode.PAYMENT_REQUIRED,
          'Payment required - insufficient balance or invalid proposal',
          402
        );
      case 409:
        return new PaymentKitError(
          PaymentErrorCode.RAV_CONFLICT,
          'SubRAV conflict - cleared pending proposal',
          409
        );
      default:
        return null;
    }
  }

  /**
   * Get header name for payment protocol
   */
  getHeaderName(): string {
    return HttpPaymentCodec.getHeaderName();
  }
}
