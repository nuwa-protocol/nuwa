import type {
  HttpClientState,
  PersistedHttpClientState,
  PendingPaymentRequest,
  HostChannelMappingStore,
} from '../types';
import type { SubRAV, ChannelInfo, SubChannelInfo } from '../../../core/types';
import { DebugLogger } from '@nuwa-ai/identity-kit';

/**
 * PaymentState manages all client state in a centralized way.
 * This includes channel information, pending payments, and cached SubRAVs.
 */
export class PaymentState {
  private logger: DebugLogger;
  private state: HttpClientState;
  private channelId?: string;
  private channelInfo?: ChannelInfo;
  private subChannelInfo?: SubChannelInfo;
  private keyId?: string;
  private vmIdFragment?: string;
  private pendingSubRAV?: SubRAV;
  private highestObservedNonce?: bigint;
  private recentlyRejectedRefs = new Set<string>();

  constructor() {
    this.logger = DebugLogger.get('PaymentState');
    this.state = {
      pendingPayments: new Map(),
    };
  }

  // Channel management
  setChannelId(channelId: string | undefined): void {
    this.channelId = channelId;
    this.logger.debug('Channel ID set:', channelId);
  }

  getChannelId(): string | undefined {
    return this.channelId;
  }

  setChannelInfo(info: ChannelInfo | undefined): void {
    this.channelInfo = info;
  }

  getChannelInfo(): ChannelInfo | undefined {
    return this.channelInfo;
  }

  setSubChannelInfo(info: SubChannelInfo | undefined): void {
    this.subChannelInfo = info;
  }

  getSubChannelInfo(): SubChannelInfo | undefined {
    return this.subChannelInfo;
  }

  // Key management
  setKeyInfo(keyId: string, vmIdFragment: string): void {
    this.keyId = keyId;
    this.vmIdFragment = vmIdFragment;
    this.logger.debug('Key info set:', { keyId, vmIdFragment });
  }

  getKeyId(): string | undefined {
    return this.keyId;
  }

  getVmIdFragment(): string | undefined {
    return this.vmIdFragment;
  }

  // Pending SubRAV management
  setPendingSubRAV(subRav: SubRAV | undefined): void {
    // Apply monotonic guard to prevent rollback
    if (subRav && this.shouldAcceptSubRAV(subRav)) {
      this.pendingSubRAV = subRav;
      this.logger.debug('Pending SubRAV set:', subRav.nonce);
    }
  }

  getPendingSubRAV(): SubRAV | undefined {
    return this.pendingSubRAV;
  }

  clearPendingSubRAV(): void {
    this.pendingSubRAV = undefined;
    this.logger.debug('Pending SubRAV cleared');
  }

  // Monotonic nonce guard
  updateHighestNonce(nonce: bigint): void {
    if (!this.highestObservedNonce || nonce > this.highestObservedNonce) {
      this.highestObservedNonce = nonce;
    }
  }

  private shouldAcceptSubRAV(subRav: SubRAV): boolean {
    // Fragment guard
    if (this.vmIdFragment && subRav.vmIdFragment !== this.vmIdFragment) {
      this.logger.debug('Rejecting SubRAV: fragment mismatch');
      return false;
    }

    // Nonce guard
    const currentNonce = this.pendingSubRAV?.nonce;
    if (
      (this.highestObservedNonce && subRav.nonce <= this.highestObservedNonce) ||
      (currentNonce && subRav.nonce <= currentNonce)
    ) {
      this.logger.debug('Rejecting SubRAV: nonce not progressive');
      return false;
    }

    return true;
  }

  // Pending payments management
  addPendingPayment(clientTxRef: string, request: PendingPaymentRequest): void {
    this.state.pendingPayments?.set(clientTxRef, request);
    this.logger.debug('Pending payment added:', clientTxRef);
  }

  getPendingPayment(clientTxRef: string): PendingPaymentRequest | undefined {
    return this.state.pendingPayments?.get(clientTxRef);
  }

  removePendingPayment(clientTxRef: string): void {
    this.state.pendingPayments?.delete(clientTxRef);
    this.logger.debug('Pending payment removed:', clientTxRef);
  }

  getAllPendingPayments(): Map<string, PendingPaymentRequest> {
    return this.state.pendingPayments || new Map();
  }

  clearAllPendingPayments(): void {
    this.state.pendingPayments?.clear();
    this.logger.debug('All pending payments cleared');
  }

  // Rejected refs tracking
  markAsRejected(clientTxRef: string): void {
    this.recentlyRejectedRefs.add(clientTxRef);
  }

  isRecentlyRejected(clientTxRef: string): boolean {
    return this.recentlyRejectedRefs.has(clientTxRef);
  }

  // State persistence
  getPersistedState(): PersistedHttpClientState {
    return {
      channelId: this.channelId,
      pendingSubRAV: this.pendingSubRAV,
      lastUpdated: new Date().toISOString(),
    };
  }

  loadPersistedState(state: PersistedHttpClientState): void {
    if (state.channelId) {
      this.channelId = state.channelId;
    }
    if (state.pendingSubRAV && this.shouldAcceptSubRAV(state.pendingSubRAV)) {
      this.pendingSubRAV = state.pendingSubRAV;
    }
    this.logger.debug('Persisted state loaded');
  }

  // Reset state
  reset(): void {
    this.channelId = undefined;
    this.channelInfo = undefined;
    this.subChannelInfo = undefined;
    this.keyId = undefined;
    this.vmIdFragment = undefined;
    this.pendingSubRAV = undefined;
    this.highestObservedNonce = undefined;
    this.recentlyRejectedRefs.clear();
    this.state.pendingPayments?.clear();
    this.logger.debug('State reset');
  }
}
