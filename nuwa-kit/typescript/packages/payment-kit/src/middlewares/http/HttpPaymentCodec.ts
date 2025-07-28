import type { SignedSubRAV } from '../../core/types';
import type { PaymentCodec } from '../../codecs/PaymentCodec';
import { EncodingError, DecodingError } from '../../codecs/PaymentCodec';
import { HttpHeaderCodec } from '../../core/http-header';
import type { HttpRequestPayload, HttpResponsePayload } from '../../core/types';

/**
 * HTTP-specific payment codec
 * 
 * Handles encoding/decoding of payment data for HTTP protocol
 * using the existing HttpHeaderCodec
 */
export class HttpPaymentCodec implements PaymentCodec {
  /**
   * Encode signed SubRAV for HTTP request header
   */
  encode(signedSubRAV: SignedSubRAV, metadata?: any): string {
    try {
      const payload: HttpRequestPayload = {
        signedSubRav: signedSubRAV,
        ...metadata
      };
      
      return HttpHeaderCodec.buildRequestHeader(payload);
    } catch (error) {
      throw new EncodingError(
        'Failed to encode HTTP payment data',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Decode HTTP request header to signed SubRAV
   */
  decode(encoded: string): { signedSubRAV: SignedSubRAV; metadata?: any } {
    try {
      const payload = HttpHeaderCodec.parseRequestHeader(encoded);
      
      return {
        signedSubRAV: payload.signedSubRav,
        metadata: {
          // Include any additional fields from the payload
          // that are not part of the signed SubRAV
          ...(payload as any)
        }
      };
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
  encodeResponse(
    subRAV: any, // SubRAV type
    cost: bigint,
    serviceTxRef: string,
    metadata?: any
  ): string {
    try {
      const payload: HttpResponsePayload = {
        subRav: subRAV,
        amountDebited: cost,
        serviceTxRef,
        errorCode: 0,
        message: 'Payment proposal',
        ...metadata
      };
      
      return HttpHeaderCodec.buildResponseHeader(payload);
    } catch (error) {
      throw new EncodingError(
        'Failed to encode HTTP response payment data',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Decode HTTP response header to SubRAV proposal
   */
  decodeResponse(encoded: string): {
    subRAV: any;
    cost: bigint;
    serviceTxRef?: string;
    metadata?: any;
  } {
    try {
      const payload = HttpHeaderCodec.parseResponseHeader(encoded);
      
      return {
        subRAV: payload.subRav,
        cost: payload.amountDebited,
        serviceTxRef: payload.serviceTxRef,
        metadata: {
          errorCode: payload.errorCode,
          message: payload.message,
          // Include any additional fields
          ...(payload as any)
        }
      };
    } catch (error) {
      throw new DecodingError(
        'Failed to decode HTTP response payment data',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get HTTP header name for payment data
   */
  static getHeaderName(): string {
    return HttpHeaderCodec.getHeaderName();
  }

  /**
   * Check if request contains payment data
   */
  static hasPaymentData(headers: Record<string, string | string[]>): boolean {
    const headerName = HttpHeaderCodec.getHeaderName();
    return !!(
      headers[headerName.toLowerCase()] || 
      headers[headerName]
    );
  }

  /**
   * Extract payment header value from request headers
   */
  static extractPaymentHeader(headers: Record<string, string | string[]>): string | null {
    const headerName = HttpHeaderCodec.getHeaderName();
    const headerValue = headers[headerName.toLowerCase()] || headers[headerName];
    
    if (Array.isArray(headerValue)) {
      return headerValue[0] || null;
    }
    
    return headerValue || null;
  }
} 