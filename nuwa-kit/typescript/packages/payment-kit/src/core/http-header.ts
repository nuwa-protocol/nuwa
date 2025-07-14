/**
 * HTTP Gateway Profile implementation for NIP-4
 * Handles X-Payment-Channel-Data header encoding/decoding
 */

import { MultibaseCodec } from '@nuwa-ai/identity-kit';
import type { HttpRequestPayload, HttpResponsePayload, SignedSubRAV, SubRAV } from './types';

/**
 * HTTP header codec for payment channel data
 */
export class HttpHeaderCodec {
  private static readonly HEADER_NAME = 'X-Payment-Channel-Data';

  /**
   * Build HTTP request header value
   */
  static buildRequestHeader(payload: HttpRequestPayload): string {
    // Convert payload to serializable format
    const serializable = {
      channelId: payload.channelId,
      signedSubRav: this.serializeSignedSubRAV(payload.signedSubRav),
      maxAmount: payload.maxAmount?.toString(),
      clientTxRef: payload.clientTxRef,
      confirmationData: payload.confirmationData ? {
        subRav: this.serializeSubRAV(payload.confirmationData.subRav),
        signatureConfirmer: MultibaseCodec.encodeBase64url(payload.confirmationData.signatureConfirmer)
      } : undefined
    };

    // Convert to JSON and encode
    const json = JSON.stringify(serializable);
    return MultibaseCodec.encodeBase64url(json);
  }

  /**
   * Parse HTTP request header value
   */
  static parseRequestHeader(headerValue: string): HttpRequestPayload {
    try {
      const json = MultibaseCodec.decodeBase64urlToString(headerValue);
      const data = JSON.parse(json);

      return {
        channelId: data.channelId,
        signedSubRav: this.deserializeSignedSubRAV(data.signedSubRav),
        maxAmount: data.maxAmount ? BigInt(data.maxAmount) : undefined,
        clientTxRef: data.clientTxRef,
        confirmationData: data.confirmationData ? {
          subRav: this.deserializeSubRAV(data.confirmationData.subRav),
          signatureConfirmer: MultibaseCodec.decodeBase64url(data.confirmationData.signatureConfirmer)
        } : undefined
      };
    } catch (error) {
      throw new Error(`Failed to parse request header: ${error}`);
    }
  }

  /**
   * Build HTTP response header value
   */
  static buildResponseHeader(payload: HttpResponsePayload): string {
    const serializable = {
      signedSubRav: this.serializeSignedSubRAV(payload.signedSubRav),
      amountDebited: payload.amountDebited.toString(),
      serviceTxRef: payload.serviceTxRef,
      errorCode: payload.errorCode,
      message: payload.message
    };

    const json = JSON.stringify(serializable);
    return MultibaseCodec.encodeBase64url(json);
  }

  /**
   * Parse HTTP response header value
   */
  static parseResponseHeader(headerValue: string): HttpResponsePayload {
    try {
      const json = MultibaseCodec.decodeBase64urlToString(headerValue);
      const data = JSON.parse(json);

      return {
        signedSubRav: this.deserializeSignedSubRAV(data.signedSubRav),
        amountDebited: BigInt(data.amountDebited),
        serviceTxRef: data.serviceTxRef,
        errorCode: data.errorCode,
        message: data.message
      };
    } catch (error) {
      throw new Error(`Failed to parse response header: ${error}`);
    }
  }

  /**
   * Get the standard header name
   */
  static getHeaderName(): string {
    return this.HEADER_NAME;
  }

  /**
   * Helper: Serialize SubRAV for JSON transport
   */
  private static serializeSubRAV(subRav: SubRAV): Record<string, string> {
    return {
      version: subRav.version.toString(),
      chainId: subRav.chainId.toString(),
      channelId: subRav.channelId,
      channelEpoch: subRav.channelEpoch.toString(),
      vmIdFragment: subRav.vmIdFragment,
      accumulatedAmount: subRav.accumulatedAmount.toString(),
      nonce: subRav.nonce.toString()
    };
  }

  /**
   * Helper: Deserialize SubRAV from JSON transport
   */
  private static deserializeSubRAV(data: Record<string, string>): SubRAV {
    return {
      version: parseInt(data.version),
      chainId: BigInt(data.chainId),
      channelId: data.channelId,
      channelEpoch: BigInt(data.channelEpoch),
      vmIdFragment: data.vmIdFragment,
      accumulatedAmount: BigInt(data.accumulatedAmount),
      nonce: BigInt(data.nonce)
    };
  }

  /**
   * Helper: Serialize SignedSubRAV for JSON transport
   */
  private static serializeSignedSubRAV(signedSubRav: SignedSubRAV): Record<string, any> {
    return {
      subRav: this.serializeSubRAV(signedSubRav.subRav),
      signature: MultibaseCodec.encodeBase64url(signedSubRav.signature)
    };
  }

  /**
   * Helper: Deserialize SignedSubRAV from JSON transport
   */
  private static deserializeSignedSubRAV(data: Record<string, any>): SignedSubRAV {
    return {
      subRav: this.deserializeSubRAV(data.subRav),
      signature: MultibaseCodec.decodeBase64url(data.signature)
    };
  }
}

/**
 * HTTP middleware utilities for payment channel integration
 */
export class HttpPaymentMiddleware {
  /**
   * Extract payment data from request headers
   */
  static extractPaymentData(headers: Record<string, string>): HttpRequestPayload | null {
    const headerValue = headers[HttpHeaderCodec.getHeaderName().toLowerCase()] || 
                       headers[HttpHeaderCodec.getHeaderName()];
    
    if (!headerValue) {
      return null;
    }

    try {
      return HttpHeaderCodec.parseRequestHeader(headerValue);
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
    const headerValue = HttpHeaderCodec.buildResponseHeader(payload);
    return {
      ...headers,
      [HttpHeaderCodec.getHeaderName()]: headerValue
    };
  }

  /**
   * Validate payment requirements for a request
   */
  static validatePaymentRequirement(
    paymentData: HttpRequestPayload | null,
    requiredAmount: bigint
  ): { valid: boolean; error?: string } {
    if (!paymentData) {
      return { valid: false, error: 'Payment required' };
    }

    if (paymentData.maxAmount && paymentData.maxAmount < requiredAmount) {
      return { valid: false, error: 'Insufficient payment allowance' };
    }

    return { valid: true };
  }
} 