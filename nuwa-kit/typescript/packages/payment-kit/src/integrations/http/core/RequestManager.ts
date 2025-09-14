import type { PendingPaymentRequest, PaymentRequestContext } from '../types';
import type { SignedSubRAV, PaymentInfo } from '../../../core/types';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import { PaymentState } from './PaymentState';

export interface RequestTracker {
  clientTxRef: string;
  resolve: (info: PaymentInfo | undefined) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
  release?: () => void;
}

/**
 * RequestManager handles request tracking, timeouts, and payment resolution.
 */
export class RequestManager {
  private logger: DebugLogger;
  private paymentState: PaymentState;
  private defaultTimeoutMs: number;
  private traceOrigins = new Map<string, string>();

  constructor(paymentState: PaymentState, defaultTimeoutMs: number = 30000) {
    this.logger = DebugLogger.get('RequestManager');
    this.paymentState = paymentState;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Create a payment promise for tracking request payment info
   */
  createPaymentPromise(
    clientTxRef: string,
    requestContext: PaymentRequestContext,
    sentSubRav: SignedSubRAV | undefined,
    channelId: string,
    assetId: string,
    timeoutMs?: number
  ): Promise<PaymentInfo | undefined> {
    return new Promise((resolve, reject) => {
      const timeout = timeoutMs || this.defaultTimeoutMs;

      // Set timeout for cleanup
      const timeoutId = setTimeout(() => {
        const pending = this.paymentState.getPendingPayment(clientTxRef);
        if (pending) {
          // Release scheduler queue if applicable
          try {
            pending.release?.();
          } catch (e) {
            this.logger.debug('[release.error]', e);
          }
          this.paymentState.removePendingPayment(clientTxRef);
          this.logger.debug('[payment.timeout]', 'clientTxRef=', clientTxRef);
          reject(new Error('Payment resolution timeout'));
        }
      }, timeout);

      const pendingRequest: PendingPaymentRequest = {
        resolve,
        reject,
        timestamp: new Date(),
        channelId,
        assetId,
        timeoutId,
        sentSubRav: sentSubRav,
        requestContext,
      };

      this.paymentState.addPendingPayment(clientTxRef, pendingRequest);

      this.logger.debug(
        '[payment.pending.create]',
        'clientTxRef=',
        clientTxRef,
        'channelId=',
        channelId,
        'signedSubRav=',
        !!sentSubRav
      );
    });
  }

  /**
   * Extend timeout for a specific pending payment (used for streaming)
   */
  extendTimeout(clientTxRef: string, newTimeoutMs: number): void {
    const pending = this.paymentState.getPendingPayment(clientTxRef);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    pending.timeoutId = setTimeout(() => {
      if (this.paymentState.getPendingPayment(clientTxRef)) {
        try {
          pending.release?.();
        } catch (e) {
          this.logger.debug('[release.error]', e);
        }
        this.paymentState.removePendingPayment(clientTxRef);
        this.logger.debug('[payment.timeout.stream]', 'clientTxRef=', clientTxRef);
        pending.reject(new Error('Payment resolution timeout'));
      }
    }, newTimeoutMs);

    //this.logger.debug('[payment.timeout.extend]', 'clientTxRef=', clientTxRef, 'ms=', newTimeoutMs);
  }

  /**
   * Resolve a pending payment by reference
   */
  resolveByRef(clientTxRef: string, info: PaymentInfo | undefined): boolean {
    const pending = this.paymentState.getPendingPayment(clientTxRef);
    if (!pending) return false;

    clearTimeout(pending.timeoutId);

    // Always release scheduler when payment is resolved
    // This matches the original implementation behavior
    try {
      pending.release?.();
    } catch (e) {
      this.logger.debug('[release.error]', e);
    }
    pending.resolve(info);
    this.paymentState.removePendingPayment(clientTxRef);
    this.clearTraceOrigin(clientTxRef);

    this.logger.debug('[payment.pending.resolve]', 'clientTxRef=', clientTxRef);
    return true;
  }

  /**
   * Reject a pending payment by reference
   */
  rejectByRef(clientTxRef: string, err: Error): boolean {
    const pending = this.paymentState.getPendingPayment(clientTxRef);
    if (!pending) return false;

    clearTimeout(pending.timeoutId);
    try {
      pending.release?.();
    } catch (e) {
      this.logger.debug('[release.error]', e);
    }
    pending.reject(err);
    this.paymentState.removePendingPayment(clientTxRef);
    this.paymentState.markAsRejected(clientTxRef);
    this.clearTraceOrigin(clientTxRef);

    this.logger.debug(
      '[payment.pending.reject]',
      'clientTxRef=',
      clientTxRef,
      'error=',
      err.message
    );
    return true;
  }

  /**
   * Reject all pending payments
   */
  rejectAll(err: Error): void {
    const pendingPayments = this.paymentState.getAllPendingPayments();

    for (const [key, pending] of pendingPayments.entries()) {
      clearTimeout(pending.timeoutId);
      try {
        pending.release?.();
      } catch (e) {
        this.logger.debug('[release.error]', e);
      }
      try {
        pending.reject(err);
      } catch (e) {
        this.logger.debug('[pending.reject.error]', e);
      }
    }

    this.paymentState.clearAllPendingPayments();
  }

  /**
   * Resolve all pending payments as free
   */
  resolveAllAsFree(): void {
    const pendingPayments = this.paymentState.getAllPendingPayments();
    const keys: string[] = [];

    for (const [key, pending] of pendingPayments.entries()) {
      clearTimeout(pending.timeoutId);
      try {
        pending.release?.();
      } catch (e) {
        this.logger.debug('[release.error]', e);
      }
      pending.resolve(undefined);
      keys.push(key);
    }

    this.paymentState.clearAllPendingPayments();

    if (keys.length > 0) {
      this.logger.debug('[payment.pending.free]', 'resolved', keys.length, 'requests as free');
    }
  }

  /**
   * Get all pending payment keys
   */
  getPendingKeys(): string[] {
    return Array.from(this.paymentState.getAllPendingPayments().keys());
  }

  /**
   * Record trace origin for debugging
   */
  recordTraceOrigin(clientTxRef: string, origin: string): void {
    this.traceOrigins.set(clientTxRef, origin);
  }

  /**
   * Get trace origin for a client transaction reference
   */
  getTraceOrigin(clientTxRef: string): string | undefined {
    return this.traceOrigins.get(clientTxRef);
  }

  /**
   * Clear trace origin
   */
  clearTraceOrigin(clientTxRef: string): void {
    this.traceOrigins.delete(clientTxRef);
  }

  /**
   * Get trace origin snapshots for debugging
   */
  getTraceSnapshots(limit: number = 5): Array<{ key: string; head: string }> {
    const snapshots: Array<{ key: string; head: string }> = [];

    for (const [key, stack] of this.traceOrigins.entries()) {
      snapshots.push({ key, head: stack.split('\n')[0] });
      if (snapshots.length >= limit) break;
    }

    return snapshots;
  }
}
