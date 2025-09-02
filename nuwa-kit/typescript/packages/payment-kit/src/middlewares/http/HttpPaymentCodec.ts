import { MultibaseCodec } from '@nuwa-ai/identity-kit';
import type { SignedSubRAV, SubRAV } from '../../core/types';
import type { PaymentCodec } from '../../codecs/PaymentCodec';
import { EncodingError, DecodingError } from '../../codecs/PaymentCodec';
import type {
  PaymentHeaderPayload,
  HttpRequestPayload,
  PaymentResponsePayload as HttpResponsePayload,
  SerializableResponsePayload,
  SerializableSubRAV,
  SerializableSignedSubRAV,
} from '../../core/types';

/**
 * HTTP-specific payment codec
 *
 * Handles encoding/decoding of payment data for HTTP protocol
 * using X-Payment-Channel-Data header format
 */
export class HttpPaymentCodec implements PaymentCodec {
  private static readonly HEADER_NAME = 'X-Payment-Channel-Data';

  /**
   * Encode payment header payload for HTTP request header (new interface)
   */
  encodePayload(payload: PaymentHeaderPayload): string {
    try {
      return HttpPaymentCodec.buildRequestHeader(payload);
    } catch (error) {
      throw new EncodingError(
        'Failed to encode HTTP payment data',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Decode HTTP request header to payment header payload (new interface)
   */
  decodePayload(encoded: string): PaymentHeaderPayload {
    try {
      return HttpPaymentCodec.parseRequestHeader(encoded);
    } catch (error) {
      throw new DecodingError(
        'Failed to decode HTTP payment data',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Encode SubRAV proposal for HTTP response header
   */
  encodeResponse(subRAV: SubRAV, cost: bigint, serviceTxRef: string, metadata?: any): string {
    try {
      const payload: HttpResponsePayload = {
        subRav: subRAV,
        cost,
        serviceTxRef,
        version: 1,
        ...metadata,
      };

      return HttpPaymentCodec.buildResponseHeader(payload);
    } catch (error) {
      throw new EncodingError(
        'Failed to encode HTTP response payment data',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Encode protocol-level error for HTTP response header
   */
  encodeError(
    error: { code: string; message?: string },
    metadata?: { clientTxRef?: string; serviceTxRef?: string; version?: number }
  ): string {
    try {
      const payload: HttpResponsePayload = {
        error,
        clientTxRef: metadata?.clientTxRef,
        serviceTxRef: metadata?.serviceTxRef,
        version: metadata?.version ?? 1,
      } as HttpResponsePayload;
      return HttpPaymentCodec.buildResponseHeader(payload);
    } catch (error) {
      throw new EncodingError(
        'Failed to encode HTTP response error data',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Decode HTTP response header to SubRAV proposal
   */
  decodeResponse(encoded: string) {
    try {
      const payload = HttpPaymentCodec.parseResponseHeader(encoded);

      const out: HttpResponsePayload = {
        subRav: payload.subRav,
        cost: payload.cost,
        costUsd: payload.costUsd,
        clientTxRef: payload.clientTxRef,
        serviceTxRef: payload.serviceTxRef,
        error: payload.error,
        version: payload.version,
      } as HttpResponsePayload;
      return out;
    } catch (error) {
      throw new DecodingError(
        'Failed to decode HTTP response payment data',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // ============================================================================
  // Static HTTP Header Building Methods
  // ============================================================================

  /**
   * Build HTTP request header value
   */
  static buildRequestHeader(payload: PaymentHeaderPayload): string {
    // Convert payload to serializable format
    const serializable: any = {
      maxAmount: payload.maxAmount.toString(),
      clientTxRef: payload.clientTxRef,
      version: payload.version.toString(),
    };

    // signedSubRav is now optional
    if (payload.signedSubRav) {
      serializable.signedSubRav = this.serializeSignedSubRAV(payload.signedSubRav);
    }

    // Convert to JSON and encode
    const json = JSON.stringify(serializable);
    return MultibaseCodec.encodeBase64url(json);
  }

  /**
   * Parse HTTP request header value
   */
  static parseRequestHeader(headerValue: string): PaymentHeaderPayload {
    try {
      const json = MultibaseCodec.decodeBase64urlToString(headerValue);
      const data = JSON.parse(json);

      // clientTxRef is now required
      if (!data.clientTxRef) {
        throw new Error('clientTxRef is required in payment header');
      }

      const result: PaymentHeaderPayload = {
        maxAmount: data.maxAmount ? BigInt(data.maxAmount) : BigInt(0), // Handle old format without maxAmount
        clientTxRef: data.clientTxRef,
        version: parseInt(data.version) || 1,
      };

      // signedSubRav is now optional
      if (data.signedSubRav) {
        result.signedSubRav = this.deserializeSignedSubRAV(data.signedSubRav);
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to parse request header: ${error}`);
    }
  }

  /**
   * Build HTTP response header value
   */
  static buildResponseHeader(payload: HttpResponsePayload): string {
    const serializable = this.toJSONResponse(payload);
    const json = JSON.stringify(serializable);
    return MultibaseCodec.encodeBase64url(json);
  }

  /**
   * Parse HTTP response header value
   */
  static parseResponseHeader(headerValue: string): HttpResponsePayload {
    try {
      const json = MultibaseCodec.decodeBase64urlToString(headerValue);
      const data: any = JSON.parse(json);
      return this.fromJSONResponse(data as SerializableResponsePayload);
    } catch (error) {
      throw new Error(`Failed to parse response header: ${error}`);
    }
  }

  // ============================================================================
  // Structured JSON helpers for PaymentResponsePayload (for MCP and others)
  // Note: subRav is serialized as JSON (not encoded string) for readability.
  // In a future revision, we may add an additional encoded field (e.g., subRavHeader)
  // without breaking compatibility.
  // ============================================================================

  static toJSONResponse(payload: HttpResponsePayload): SerializableResponsePayload {
    const out: SerializableResponsePayload = {
      version: payload.version ?? 1,
      clientTxRef: payload.clientTxRef,
      serviceTxRef: payload.serviceTxRef,
    };
    if (payload.subRav && payload.cost !== undefined) {
      (out as any).subRav = this.serializeSubRAV(payload.subRav);
      (out as any).cost = payload.cost.toString();
      if (payload.costUsd !== undefined) (out as any).costUsd = payload.costUsd.toString();
    }
    if (payload.error) {
      out.error = payload.error;
    }
    return out;
  }

  static fromJSONResponse(data: SerializableResponsePayload): HttpResponsePayload {
    const payload: HttpResponsePayload = {
      version: data?.version ? Number(data.version) : 1,
      clientTxRef: data?.clientTxRef,
      serviceTxRef: data?.serviceTxRef,
    } as HttpResponsePayload;

    if (data?.subRav && (data as any).cost !== undefined) {
      payload.subRav = this.deserializeSubRAV(data.subRav as unknown as SerializableSubRAV);
      const costStr = (data as any).cost;
      if (costStr !== undefined) payload.cost = BigInt(costStr);
      if ((data as any).costUsd !== undefined) payload.costUsd = BigInt((data as any).costUsd);
    }
    if ((data as any)?.error) {
      payload.error = (data as any).error as any;
    } else if ((data as any)?.errorCode !== undefined) {
      payload.error = { code: String((data as any).errorCode), message: (data as any).message };
    }
    return payload;
  }

  /**
   * Get HTTP header name for payment data
   */
  static getHeaderName(): string {
    return this.HEADER_NAME;
  }

  /**
   * Check if request contains payment data
   */
  static hasPaymentData(headers: Record<string, string | string[]>): boolean {
    const headerName = this.getHeaderName();
    return !!(headers[headerName.toLowerCase()] || headers[headerName]);
  }

  /**
   * Extract payment header value from request headers
   */
  static extractPaymentHeader(
    headers: Record<string, string | string[] | undefined>
  ): string | null {
    const headerName = this.getHeaderName();
    const headerValue = headers[headerName.toLowerCase()] || headers[headerName];

    if (Array.isArray(headerValue)) {
      return headerValue[0] || null;
    }

    return headerValue || null;
  }

  /**
   * Extract payment data from request headers
   */
  static extractPaymentData(headers: Record<string, string>): PaymentHeaderPayload | null {
    const headerValue =
      headers[this.getHeaderName().toLowerCase()] || headers[this.getHeaderName()];

    if (!headerValue) {
      return null;
    }

    try {
      return this.parseRequestHeader(headerValue);
    } catch (error) {
      throw new Error(`Invalid payment channel header: ${error}`);
    }
  }

  /**
   * Add payment data to response headers
   */
  static addPaymentData(
    headers: Record<string, string>,
    payload: HttpResponsePayload
  ): Record<string, string> {
    const headerValue = this.buildResponseHeader(payload);
    return {
      ...headers,
      [this.getHeaderName()]: headerValue,
    };
  }

  /**
   * Validate payment requirements for a request
   */
  static validatePaymentRequirement(
    paymentData: PaymentHeaderPayload | null,
    requiredAmount: bigint
  ): { valid: boolean; error?: string } {
    if (!paymentData) {
      return { valid: false, error: 'Payment required' };
    }

    if (paymentData.maxAmount < requiredAmount) {
      return { valid: false, error: 'Insufficient payment allowance' };
    }

    return { valid: true };
  }

  // ============================================================================
  // Private Serialization Helpers
  // ============================================================================

  /**
   * Helper: Serialize SubRAV for JSON transport
   */
  private static serializeSubRAV(subRav: SubRAV): SerializableSubRAV {
    return {
      version: subRav.version.toString(),
      chainId: subRav.chainId.toString(),
      channelId: subRav.channelId,
      channelEpoch: subRav.channelEpoch.toString(),
      vmIdFragment: subRav.vmIdFragment,
      accumulatedAmount: subRav.accumulatedAmount.toString(),
      nonce: subRav.nonce.toString(),
    };
  }

  /**
   * Helper: Deserialize SubRAV from JSON transport
   */
  private static deserializeSubRAV(data: SerializableSubRAV): SubRAV {
    return {
      version: parseInt(data.version),
      chainId: BigInt(data.chainId),
      channelId: data.channelId,
      channelEpoch: BigInt(data.channelEpoch),
      vmIdFragment: data.vmIdFragment,
      accumulatedAmount: BigInt(data.accumulatedAmount),
      nonce: BigInt(data.nonce),
    };
  }

  /**
   * Helper: Serialize SignedSubRAV for JSON transport
   */
  private static serializeSignedSubRAV(
    signedSubRav: SignedSubRAV | undefined
  ): SerializableSignedSubRAV | undefined {
    if (!signedSubRav) {
      return undefined;
    }

    return {
      subRav: this.serializeSubRAV(signedSubRav.subRav),
      signature: MultibaseCodec.encodeBase64url(signedSubRav.signature),
    };
  }

  /**
   * Helper: Deserialize SignedSubRAV from JSON transport
   */
  private static deserializeSignedSubRAV(
    data: SerializableSignedSubRAV | undefined
  ): SignedSubRAV | undefined {
    if (!data) {
      return undefined;
    }

    return {
      subRav: this.deserializeSubRAV(data.subRav),
      signature: MultibaseCodec.decodeBase64url(data.signature),
    };
  }
}
