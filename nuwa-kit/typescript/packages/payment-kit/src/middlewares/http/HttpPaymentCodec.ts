import { MultibaseCodec } from '@nuwa-ai/identity-kit';
import type { SignedSubRAV, SubRAV } from '../../core/types';
import type { PaymentCodec } from '../../codecs/PaymentCodec';
import { EncodingError, DecodingError } from '../../codecs/PaymentCodec';
import type {
  PaymentRequestPayload,
  HttpRequestPayload,
  PaymentResponsePayload as HttpResponsePayload,
  SerializableResponsePayload,
  SerializableSubRAV,
  SerializableSignedSubRAV,
  SerializableRequestPayload,
} from '../../core/types';

/**
 * HTTP-specific payment codec
 *
 * Handles encoding/decoding of payment data for HTTP protocol
 * using X-Payment-Channel-Data header format
 */
export class HttpPaymentCodec implements PaymentCodec {
  private static readonly HEADER_NAME = 'X-Payment-Channel-Data';
  // MCP content constants
  static readonly MCP_PAYMENT_URI = 'nuwa:payment';
  static readonly MCP_PAYMENT_MIME = 'application/vnd.nuwa.payment+json';

  /**
   * Encode payment header payload for HTTP request header (new interface)
   */
  encodePayload(payload: PaymentRequestPayload): string {
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
  decodePayload(encoded: string): PaymentRequestPayload {
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
  static buildRequestHeader(payload: PaymentRequestPayload): string {
    const serializable = this.toJSONRequest(payload);
    const json = JSON.stringify(serializable);
    return MultibaseCodec.encodeBase64url(json);
  }

  /**
   * Parse HTTP request header value
   */
  static parseRequestHeader(headerValue: string): PaymentRequestPayload {
    try {
      const json = MultibaseCodec.decodeBase64urlToString(headerValue);
      const data = JSON.parse(json);
      return this.fromJSONRequest(data as SerializableRequestPayload);
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

  // Structured JSON helpers for PaymentRequestPayload (for MCP and others)
  static toJSONRequest(payload: PaymentRequestPayload): SerializableRequestPayload {
    const out: SerializableRequestPayload = {
      version: payload.version ?? 1,
      clientTxRef: payload.clientTxRef,
    };
    if (payload.maxAmount !== undefined) (out as any).maxAmount = payload.maxAmount.toString();
    if (payload.signedSubRav)
      (out as any).signedSubRav = this.serializeSignedSubRAV(payload.signedSubRav);
    return out;
  }

  static fromJSONRequest(data: SerializableRequestPayload): PaymentRequestPayload {
    if (!data?.clientTxRef) throw new Error('clientTxRef is required in payment header');
    const out: PaymentRequestPayload = {
      version: data.version ?? 1,
      clientTxRef: data.clientTxRef,
      maxAmount: (data as any).maxAmount ? BigInt((data as any).maxAmount) : BigInt(0),
      signedSubRav: data.signedSubRav ? this.deserializeSignedSubRAV(data.signedSubRav) : undefined,
    };
    return out;
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
  static extractPaymentData(headers: Record<string, string>): PaymentRequestPayload | null {
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
    paymentData: PaymentRequestPayload | null,
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

  // ==========================================================================
  // MCP Content helpers (resource content for payment payload)
  // ==========================================================================

  /** Build a FastMCP-compatible resource content item carrying payment payload */
  static buildMcpPaymentResource(payload: SerializableResponsePayload): any {
    return {
      type: 'resource',
      resource: {
        uri: this.MCP_PAYMENT_URI,
        mimeType: this.MCP_PAYMENT_MIME,
        text: JSON.stringify(payload),
      },
    };
  }

  /** Try to parse payment payload from a FastMCP content array */
  static parseMcpPaymentFromContents(
    contents: any[] | undefined
  ): SerializableResponsePayload | undefined {
    if (!Array.isArray(contents)) return undefined;
    const item = contents.find(
      c =>
        c &&
        c.type === 'resource' &&
        c.resource &&
        (c.resource.uri === this.MCP_PAYMENT_URI || c.resource.mimeType === this.MCP_PAYMENT_MIME)
    );
    try {
      const text = item?.resource?.text;
      if (!text || typeof text !== 'string') return undefined;
      return JSON.parse(text) as SerializableResponsePayload;
    } catch {
      return undefined;
    }
  }

  /** Attach payment resource to an existing content array (non-mutating) */
  static attachPaymentResource(
    contents: any[] | undefined,
    payload?: SerializableResponsePayload
  ): any[] {
    const out: any[] = Array.isArray(contents) ? [...contents] : [];
    if (payload) {
      out.push(this.buildMcpPaymentResource(payload));
    }
    return out;
  }
}
