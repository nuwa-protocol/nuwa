import type {
  SignedSubRAV,
  SubRAV,
  PaymentHeaderPayload,
  PaymentResponsePayload,
} from '../core/types';

/**
 * Protocol-agnostic payment codec interface
 *
 * Implementations handle encoding/decoding of payment data
 * for specific protocols (HTTP, MCP, A2A, etc.)
 */
export interface PaymentCodec {
  // Request-side encode/decode
  encodePayload(payload: PaymentHeaderPayload): string | Record<string, any>;
  decodePayload(input: string | Record<string, any>): PaymentHeaderPayload;

  // Response-side encode/decode
  encodeResponse(
    subRAV: SubRAV,
    cost: bigint,
    serviceTxRef: string,
    metadata?: any
  ): string | Record<string, any>;

  encodeError(
    error: { code: string; message?: string },
    metadata?: { clientTxRef?: string; serviceTxRef?: string; version?: number }
  ): string | Record<string, any>;

  decodeResponse(input: string | Record<string, any>): PaymentResponsePayload;
}

/**
 * Error types for codec operations
 */
export class CodecError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CodecError';
  }
}

export class EncodingError extends CodecError {
  constructor(message: string, cause?: Error) {
    super(`Encoding failed: ${message}`, cause);
    this.name = 'EncodingError';
  }
}

export class DecodingError extends CodecError {
  constructor(message: string, cause?: Error) {
    super(`Decoding failed: ${message}`, cause);
    this.name = 'DecodingError';
  }
}
