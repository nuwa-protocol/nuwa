import type { SignedSubRAV } from '../core/types';

/**
 * Protocol-agnostic payment codec interface
 * 
 * Implementations handle encoding/decoding of payment data
 * for specific protocols (HTTP, MCP, A2A, etc.)
 */
export interface PaymentCodec {
  
}

/**
 * Error types for codec operations
 */
export class CodecError extends Error {
  constructor(message: string, public readonly cause?: Error) {
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