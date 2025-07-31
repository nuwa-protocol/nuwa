import type { SubRAV } from '../../../core/types';

/**
 * Cache for storing pending unsigned SubRAVs from the server
 * These SubRAVs will be signed and used in the next request
 */
export class SubRAVCache {
  private pendingSubRAV: SubRAV | null = null;

  /**
   * Store a pending SubRAV received from the server
   */
  setPending(subRAV: SubRAV): void {
    this.pendingSubRAV = subRAV;
  }

  /**
   * Get the current pending SubRAV (if any)
   */
  getPending(): SubRAV | null {
    return this.pendingSubRAV;
  }

  /**
   * Clear the pending SubRAV cache
   */
  clear(): void {
    this.pendingSubRAV = null;
  }

  /**
   * Check if there's a pending SubRAV
   */
  hasPending(): boolean {
    return this.pendingSubRAV !== null;
  }

  /**
   * Get and clear the pending SubRAV in one operation
   */
  takePending(): SubRAV | null {
    const subRAV = this.pendingSubRAV;
    this.pendingSubRAV = null;
    return subRAV;
  }
}