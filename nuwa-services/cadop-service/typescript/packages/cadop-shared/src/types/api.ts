/**
 * Standard API Response Types
 */

import { CadopError, CadopErrorCode } from './errors.js';

/**
 * Standard API Response interface
 */
export interface APIResponse<T> {
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

/**
 * Type for successful API responses
 */
export type APISuccessResponse<T> = Required<Pick<APIResponse<T>, 'data'>>;

/**
 * Type for error API responses
 */
export type APIErrorResponse = Required<Pick<APIResponse<never>, 'error'>>;

/**
 * Create a success response
 */
export const createSuccessResponse = <T>(data: T): APISuccessResponse<T> => ({
  data
});

/**
 * Create an error response
 */
export const createErrorResponse = (
  message: string,
  code?: string,
  details?: unknown
): APIErrorResponse => ({
  error: {
    message,
    code,
    details
  }
});

/**
 * Create an error response from an error object
 */
export const createErrorResponseFromError = (error: unknown): APIErrorResponse => {
  if (error instanceof CadopError) {
    return createErrorResponse(error.message, error.code, error.details);
  }
  
  if (error instanceof Error) {
    return createErrorResponse(error.message, CadopErrorCode.INTERNAL_ERROR);
  }
  
  return createErrorResponse(
    'Unknown error occurred',
    CadopErrorCode.INTERNAL_ERROR,
    error
  );
}; 