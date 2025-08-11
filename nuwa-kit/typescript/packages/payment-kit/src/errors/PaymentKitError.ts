import { ErrorCode, type ErrorCode as ErrorCodeType } from '../types/api';
import type { ApiError } from '../schema';

/**
 * Base error class for Payment Kit
 */
export class PaymentKitError extends Error {
  public readonly code: ErrorCodeType;
  public readonly httpStatus: number;
  public readonly details?: unknown;

  constructor(code: ErrorCodeType | string, message: string, httpStatus = 500, details?: unknown) {
    super(message);
    this.name = 'PaymentKitError';
    this.code = code as ErrorCodeType;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  /**
   * Convert to standard API error format
   */
  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      httpStatus: this.httpStatus,
    };
  }
}

/**
 * Convert any error to standard API error format
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof PaymentKitError) {
    return error.toApiError();
  }

  if (error instanceof Error) {
    return {
      code: ErrorCode.INTERNAL_ERROR,
      message: error.message,
      details: error.stack,
      httpStatus: 500,
    };
  }

  return {
    code: ErrorCode.INTERNAL_ERROR,
    message: String(error),
    httpStatus: 500,
  };
}

/**
 * Create a success response
 */
export function createSuccessResponse<T>(data: T): { success: true; data: T; timestamp: string } {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(error: ApiError): {
  success: false;
  error: ApiError;
  timestamp: string;
} {
  return {
    success: false,
    error,
    timestamp: new Date().toISOString(),
  };
}
