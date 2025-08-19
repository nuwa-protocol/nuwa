export enum PaymentErrorCode {
  // Auth
  AUTH_MISSING = 'AUTH_MISSING',
  AUTH_INVALID = 'AUTH_INVALID',
  AUTH_ADMIN_FORBIDDEN = 'AUTH_ADMIN_FORBIDDEN',
  DID_RESOLVE_FAILED = 'DID_RESOLVE_FAILED',

  // Channel
  CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
  SUBCHANNEL_NOT_AUTHORIZED = 'SUBCHANNEL_NOT_AUTHORIZED',
  CHANNEL_CONTEXT_MISSING = 'CHANNEL_CONTEXT_MISSING',

  // RAV/SubRAV
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  RAV_CONFLICT = 'RAV_CONFLICT',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  UNKNOWN_SUBRAV = 'UNKNOWN_SUBRAV',
  TAMPERED_SUBRAV = 'TAMPERED_SUBRAV',

  // Billing/Rate
  BILLING_RATE_FETCH_FAILED = 'BILLING_RATE_FETCH_FAILED',
  BILLING_RATE_NOT_AVAILABLE = 'BILLING_RATE_NOT_AVAILABLE',
  BILLING_MAX_AMOUNT_EXCEEDED = 'BILLING_MAX_AMOUNT_EXCEEDED',
  BILLING_CONFIG_ERROR = 'BILLING_CONFIG_ERROR',

  // Hub Balance
  HUB_INSUFFICIENT_FUNDS = 'HUB_INSUFFICIENT_FUNDS',
  HUB_BALANCE_FETCH_FAILED = 'HUB_BALANCE_FETCH_FAILED',

  // Channel state
  CHANNEL_CLOSED = 'CHANNEL_CLOSED',
  EPOCH_MISMATCH = 'EPOCH_MISMATCH',

  // Internal
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

export interface PaymentError {
  code: PaymentErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function httpStatusFor(code?: PaymentErrorCode | string): number {
  switch (code as PaymentErrorCode) {
    case PaymentErrorCode.PAYMENT_REQUIRED:
    case PaymentErrorCode.HUB_INSUFFICIENT_FUNDS:
      return 402;
    case PaymentErrorCode.RAV_CONFLICT:
    case PaymentErrorCode.CHANNEL_CONTEXT_MISSING:
      return 409;

    case PaymentErrorCode.INVALID_SIGNATURE:
    case PaymentErrorCode.UNKNOWN_SUBRAV:
    case PaymentErrorCode.TAMPERED_SUBRAV:
    case PaymentErrorCode.CHANNEL_CLOSED:
    case PaymentErrorCode.EPOCH_MISMATCH:
    case PaymentErrorCode.BILLING_MAX_AMOUNT_EXCEEDED:
    case PaymentErrorCode.AUTH_MISSING:
    case PaymentErrorCode.AUTH_INVALID:
    case PaymentErrorCode.AUTH_ADMIN_FORBIDDEN:
    case PaymentErrorCode.DID_RESOLVE_FAILED:
      return 400;

    case PaymentErrorCode.CHANNEL_NOT_FOUND:
    case PaymentErrorCode.SUBCHANNEL_NOT_AUTHORIZED:
      return 404;

    case PaymentErrorCode.BILLING_RATE_NOT_AVAILABLE:
    case PaymentErrorCode.BILLING_RATE_FETCH_FAILED:
    case PaymentErrorCode.BILLING_CONFIG_ERROR:
    case PaymentErrorCode.HUB_BALANCE_FETCH_FAILED:
    default:
      return 500;
  }
}

export const Errors = {
  paymentRequired: (msg?: string): PaymentError => ({
    code: PaymentErrorCode.PAYMENT_REQUIRED,
    message: msg ?? 'Signature required for pending proposal',
  }),
  ravConflict: (msg: string): PaymentError => ({
    code: PaymentErrorCode.RAV_CONFLICT,
    message: msg,
  }),
  channelContextMissing: (): PaymentError => ({
    code: PaymentErrorCode.CHANNEL_CONTEXT_MISSING,
    message: 'channelId or vmIdFragment not derivable. Check DID authentication.',
  }),
  channelNotFound: (id: string): PaymentError => ({
    code: PaymentErrorCode.CHANNEL_NOT_FOUND,
    message: `CHANNEL_NOT_FOUND: ${id}`,
  }),
  subchannelNotAuthorized: (id: string, vm: string): PaymentError => ({
    code: PaymentErrorCode.SUBCHANNEL_NOT_AUTHORIZED,
    message: `SUBCHANNEL_NOT_AUTHORIZED: ${id}#${vm}`,
  }),
  didResolveFailed: (did: string): PaymentError => ({
    code: PaymentErrorCode.DID_RESOLVE_FAILED,
    message: `DID_RESOLVE_FAILED: ${did}`,
  }),
  rateFetchFailed: (e: unknown): PaymentError => ({
    code: PaymentErrorCode.BILLING_RATE_FETCH_FAILED,
    message: String(e),
  }),
  rateNotAvailable: (assetId: string): PaymentError => ({
    code: PaymentErrorCode.BILLING_RATE_NOT_AVAILABLE,
    message: `Missing exchange rate for asset ${assetId}`,
  }),
  maxAmountExceeded: (finalCost: bigint, max: bigint): PaymentError => ({
    code: PaymentErrorCode.BILLING_MAX_AMOUNT_EXCEEDED,
    message: `Cost ${finalCost} exceeds maxAmount ${max}`,
    details: { finalCost: finalCost.toString(), max: max.toString() },
  }),
  internal: (msg: string): PaymentError => ({
    code: PaymentErrorCode.INTERNAL_SERVER_ERROR,
    message: msg,
  }),
  hubInsufficientFunds: (balance: bigint, required: bigint, assetId: string): PaymentError => ({
    code: PaymentErrorCode.HUB_INSUFFICIENT_FUNDS,
    message: `PaymentHub balance insufficient: ${balance}, required: ${required} for asset ${assetId}`,
    details: { balance: balance.toString(), required: required.toString(), assetId },
  }),
  hubBalanceFetchFailed: (error: unknown, ownerDid: string, assetId: string): PaymentError => ({
    code: PaymentErrorCode.HUB_BALANCE_FETCH_FAILED,
    message: `Failed to fetch PaymentHub balance for ${ownerDid}#${assetId}: ${String(error)}`,
    details: { ownerDid, assetId, error: String(error) },
  }),
} as const;
