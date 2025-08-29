import { PaymentKitError } from './PaymentKitError';
import { ErrorCode, type ErrorCode as ErrorCodeType } from '../types/api';
import { TransactionExecutionInfoView } from '@roochnetwork/rooch-sdk';

type HttpStatus = 400 | 401 | 402 | 403 | 404 | 409 | 500 | 503;

function httpStatusForErrorCode(code: ErrorCodeType | string): HttpStatus {
  switch (code as ErrorCodeType) {
    case ErrorCode.PAYMENT_REQUIRED:
    case ErrorCode.INSUFFICIENT_FUNDS:
      return 402 as unknown as HttpStatus;
    case ErrorCode.BAD_REQUEST:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.CONFLICT:
      return 409;
    case ErrorCode.SERVICE_UNAVAILABLE:
      return 503;
    case ErrorCode.INTERNAL_ERROR:
    default:
      return 500;
  }
}

export function createError(
  code: ErrorCodeType | string,
  message: string,
  details?: unknown,
  httpStatus?: number
): PaymentKitError {
  const status = (httpStatus ?? httpStatusForErrorCode(code)) as number;
  return new PaymentKitError(code, message, status, details);
}

export function badRequest(message: string, details?: unknown): PaymentKitError {
  return createError(ErrorCode.BAD_REQUEST, message, details);
}

export function notFound(message: string, details?: unknown): PaymentKitError {
  return createError(ErrorCode.NOT_FOUND, message, details);
}

export function conflict(message: string, details?: unknown): PaymentKitError {
  return createError(ErrorCode.CONFLICT, message, details);
}

export function serviceUnavailable(message: string, details?: unknown): PaymentKitError {
  return createError(ErrorCode.SERVICE_UNAVAILABLE, message, details);
}

export function internalError(message: string, details?: unknown): PaymentKitError {
  return createError(ErrorCode.INTERNAL_ERROR, message, details);
}

/**
 * Normalize unknown errors into PaymentKitError with consistent shape
 */
export function wrapUnknownError(operation: string, error: unknown): PaymentKitError {
  if (error instanceof PaymentKitError) {
    return error;
  }

  // Try map Rooch RPC/transport-level errors (validation failures, maintenance mode, etc.)
  const mapped = tryMapRoochRpcError(operation, error);
  if (mapped) {
    return mapped;
  }

  const details = normalizeUnknown(error);
  const message = `[${operation}] ${details.message ?? 'Unexpected error'}`;
  return internalError(message, { operation, error: details });
}

function normalizeUnknown(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === 'object' && err !== null) {
    try {
      return JSON.parse(JSON.stringify(err));
    } catch {
      return { error: String(err) };
    }
  }
  return { error: String(err) };
}

/**
 * Map Rooch execution_info.status failures to PaymentKitError
 * Accepts partial result from Rooch SDK signAndExecuteTransaction
 */
export function mapTxFailureToPaymentKitError(
  operation: string,
  executionInfo: TransactionExecutionInfoView
): PaymentKitError {
  const baseDetails = { operation, executionInfo };
  const status = executionInfo?.status;
  if (!status) {
    return internalError(`[${operation}] Missing execution status`, baseDetails);
  }

  switch (status.type) {
    case 'executed':
      return internalError(`[${operation}] mapTxFailure called for executed tx`, baseDetails);
    case 'outofgas':
      return badRequest(`[${operation}] Out of gas`, baseDetails);
    case 'moveabort': {
      const abortCode = parseAbortCode(status.abort_code);
      const location = status.location;
      // If abort from payment_channel, map to specific ErrorCode
      if (isPaymentChannelModule(location)) {
        return mapPaymentChannelAbort(operation, abortCode, baseDetails);
      }
      return badRequest(
        `[${operation}] Move abort ${String(status.abort_code)} at ${location}`,
        baseDetails
      );
    }
    case 'executionfailure': {
      return internalError(
        `[${operation}] Execution failure at ${status.location}#${status.function}@${status.code_offset}`,
        baseDetails
      );
    }
    case 'miscellaneouserror':
    default:
      return internalError(`[${operation}] Transaction failed`, baseDetails);
  }
}

function isPaymentChannelModule(location: string | undefined): boolean {
  if (!location) return false;
  return location.includes('payment_channel');
}

function parseAbortCode(code: unknown): number | null {
  if (typeof code === 'number') return code;
  if (typeof code === 'string') {
    // try decimal first, then hex like 0x..
    if (/^0x[0-9a-fA-F]+$/.test(code)) {
      try {
        return parseInt(code, 16);
      } catch {
        return null;
      }
    }
    const n = Number(code);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapPaymentChannelAbort(
  operation: string,
  abortCode: number | null,
  details: Record<string, unknown>
): PaymentKitError {
  switch (abortCode) {
    case 1: // ErrorNotReceiver
      return createError(ErrorCode.FORBIDDEN, `[${operation}] Not receiver`, details);
    case 2: // ErrorChannelNotActive
      return createError(ErrorCode.CONFLICT, `[${operation}] Channel not active`, details);
    case 3: // ErrorInvalidSenderSignature
      return createError(ErrorCode.BAD_REQUEST, `[${operation}] Invalid sender signature`, details);
    case 4: // ErrorVerificationMethodNotFound
      return createError(ErrorCode.BAD_REQUEST, `[${operation}] VM not found`, details);
    case 5: // ErrorInsufficientPermission
      return createError(ErrorCode.FORBIDDEN, `[${operation}] Insufficient permission`, details);
    case 6: // ErrorInvalidPaymentHub
      return createError(ErrorCode.CONFLICT, `[${operation}] Invalid payment hub`, details);
    case 7: // ErrorInvalidNonce
      return createError(ErrorCode.CONFLICT, `[${operation}] Invalid nonce`, details);
    case 8: // ErrorInvalidAmount
      return createError(ErrorCode.CONFLICT, `[${operation}] Invalid amount`, details);
    case 9: // ErrorHubOwnerMismatch
      return createError(ErrorCode.FORBIDDEN, `[${operation}] Hub owner mismatch`, details);
    case 10: // ErrorChallengePeriodNotElapsed
      return createError(
        ErrorCode.CONFLICT,
        `[${operation}] Challenge period not elapsed`,
        details
      );
    case 11: // ErrorChannelAlreadyCancelling
      return createError(ErrorCode.CONFLICT, `[${operation}] Channel already cancelling`, details);
    case 12: // ErrorChannelAlreadyClosed
      return createError(ErrorCode.CONFLICT, `[${operation}] Channel already closed`, details);
    case 13: // ErrorInsufficientBalance
      return createError(
        ErrorCode.INSUFFICIENT_FUNDS,
        `[${operation}] Insufficient hub balance`,
        details
      );
    case 14: // ErrorNotSender
      return createError(ErrorCode.FORBIDDEN, `[${operation}] Not sender`, details);
    case 15: // ErrorSubChannelNotAuthorized
      return createError(ErrorCode.NOT_FOUND, `[${operation}] Sub-channel not authorized`, details);
    case 16: // ErrorVMAuthorizeOnlySender
      return createError(
        ErrorCode.FORBIDDEN,
        `[${operation}] Only sender can authorize VM`,
        details
      );
    case 17: // ErrorVerificationMethodAlreadyExists
      return createError(
        ErrorCode.CONFLICT,
        `[${operation}] Verification method already exists`,
        details
      );
    case 18: // ErrorChannelAlreadyExists
      return createError(ErrorCode.CONFLICT, `[${operation}] Channel already exists`, details);
    case 19: // ErrorActiveChannelExists
      return createError(
        ErrorCode.CONFLICT,
        `[${operation}] Active channel exists for coin`,
        details
      );
    case 20: // ErrorSenderMustIsDID
      return createError(ErrorCode.BAD_REQUEST, `[${operation}] Sender must have DID`, details);
    case 21: // ErrorMismatchedCoinType
      return createError(ErrorCode.BAD_REQUEST, `[${operation}] Mismatched coin type`, details);
    case 22: // ErrorInvalidChannelEpoch
      return createError(ErrorCode.CONFLICT, `[${operation}] Invalid channel epoch`, details);
    case 23: // ErrorInvalidChainId
      return createError(ErrorCode.BAD_REQUEST, `[${operation}] Invalid chain id`, details);
    case 24: // ErrorUnsupportedVersion
      return createError(
        ErrorCode.BAD_REQUEST,
        `[${operation}] Unsupported SubRAV version`,
        details
      );
    default:
      return badRequest(`[${operation}] Move abort ${String(abortCode)}`, details);
  }
}

// --- RPC/Transport-level error mapping ---
function tryMapRoochRpcError(operation: string, error: unknown): PaymentKitError | null {
  const e = error as any;
  const message: string = typeof e?.message === 'string' ? e.message : '';

  // Maintenance mode or service unavailable indicators
  if (
    includesAny(message, ['maintenance mode', 'Service Maintenance', 'service is in maintenance'])
  ) {
    return serviceUnavailable(`[${operation}] Rooch service is in maintenance`, {
      operation,
      message,
    });
  }

  // Parse sub status from message like: 'status ABORTED of type Execution with sub status 1004'
  const subStatus = parseSubStatusFromMessage(message);
  if (subStatus != null) {
    switch (subStatus) {
      case 1004: // User has no gas / insufficient balance for fee
        return createError(ErrorCode.INSUFFICIENT_FUNDS, `[${operation}] Insufficient gas`, {
          operation,
          message,
          subStatus,
        });
      default:
        // Unknown execution abort sub status at validation time
        return badRequest(`[${operation}] Execution aborted (sub status ${subStatus})`, {
          operation,
          message,
          subStatus,
        });
    }
  }

  // Fallback: if error code exists and hints at balance/gas issues
  if (typeof e?.code === 'number') {
    const code = e.code as number;
    if (code === 1004) {
      return createError(ErrorCode.INSUFFICIENT_FUNDS, `[${operation}] Insufficient gas`, {
        operation,
        code,
        message,
      });
    }
  }

  // Heuristic: textual hints
  if (
    includesAny(message.toLowerCase(), ['insufficient gas', 'out of gas', 'insufficient balance'])
  ) {
    return createError(ErrorCode.INSUFFICIENT_FUNDS, `[${operation}] Insufficient gas`, {
      operation,
      message,
    });
  }

  return null;
}

function parseSubStatusFromMessage(message: string): number | null {
  if (!message) return null;
  const m = message.match(/sub status\s+(\d+)/i);
  if (m && m[1]) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function includesAny(str: string, needles: string[]): boolean {
  for (const n of needles) {
    if (str.includes(n)) return true;
  }
  return false;
}
