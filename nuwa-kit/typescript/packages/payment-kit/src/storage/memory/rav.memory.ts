/**
 * Memory-based implementation of RAVRepository
 * For testing and development environments
 */

import type { SignedSubRAV } from '../../core/types';
import type { RAVRepository } from '../interfaces/RAVRepository';

export class MemoryRAVRepository implements RAVRepository {
  private ravs = new Map<string, SignedSubRAV[]>();
  private claimedNonces = new Map<string, bigint>();

  private getKey(channelId: string, vmIdFragment: string): string {
    return `${channelId}:${vmIdFragment}`;
  }

  async save(rav: SignedSubRAV): Promise<void> {
    const key = this.getKey(rav.subRav.channelId, rav.subRav.vmIdFragment);

    if (!this.ravs.has(key)) {
      this.ravs.set(key, []);
    }

    const ravList = this.ravs.get(key)!;

    // Check if RAV with same nonce already exists (idempotent)
    const existing = ravList.find(r => r.subRav.nonce === rav.subRav.nonce);
    if (existing) {
      return; // Already exists
    }

    // Insert in sorted order by nonce
    ravList.push(rav);
    ravList.sort((a, b) => Number(a.subRav.nonce - b.subRav.nonce));
  }

  async get(channelId: string, vmIdFragment: string, nonce: bigint): Promise<SignedSubRAV | null> {
    const key = this.getKey(channelId, vmIdFragment);
    const ravList = this.ravs.get(key);
    if (!ravList) {
      return null;
    }

    const rav = ravList.find(r => r.subRav.nonce === nonce);
    if (!rav) {
      return null;
    }
    return rav;
  }

  async getLatest(channelId: string, vmIdFragment: string): Promise<SignedSubRAV | null> {
    const key = this.getKey(channelId, vmIdFragment);
    const ravList = this.ravs.get(key);

    if (!ravList || ravList.length === 0) {
      return null;
    }

    return ravList[ravList.length - 1];
  }

  async *list(channelId: string): AsyncIterable<SignedSubRAV> {
    for (const [key, ravList] of this.ravs.entries()) {
      if (key.startsWith(channelId + ':')) {
        for (const rav of ravList) {
          yield rav;
        }
      }
    }
  }

  async getUnclaimedRAVs(channelId: string): Promise<Map<string, SignedSubRAV>> {
    const result = new Map<string, SignedSubRAV>();

    for (const [key, ravList] of this.ravs.entries()) {
      if (key.startsWith(channelId + ':')) {
        const vmIdFragment = key.split(':')[1];
        const claimedNonce = this.claimedNonces.get(key) || BigInt(0);

        // Find the latest unclaimed RAV
        for (let i = ravList.length - 1; i >= 0; i--) {
          const rav = ravList[i];
          if (rav.subRav.nonce > claimedNonce) {
            result.set(vmIdFragment, rav);
            break;
          }
        }
      }
    }

    return result;
  }

  async markAsClaimed(channelId: string, vmIdFragment: string, nonce: bigint): Promise<void> {
    const key = this.getKey(channelId, vmIdFragment);
    this.claimedNonces.set(key, nonce);
  }

  async getStats(): Promise<{ totalRAVs: number; unclaimedRAVs: number }> {
    let totalRAVs = 0;
    let unclaimedRAVs = 0;

    for (const [key, ravList] of this.ravs.entries()) {
      totalRAVs += ravList.length;

      const claimedNonce = this.claimedNonces.get(key) || BigInt(0);
      for (const rav of ravList) {
        if (rav.subRav.nonce > claimedNonce) {
          unclaimedRAVs++;
        }
      }
    }

    return { totalRAVs, unclaimedRAVs };
  }

  async cleanup(): Promise<number> {
    let cleanedCount = 0;

    for (const [key, ravList] of this.ravs.entries()) {
      const claimedNonce = this.claimedNonces.get(key);
      if (claimedNonce !== undefined) {
        const originalLength = ravList.length;

        // Remove claimed RAVs
        this.ravs.set(
          key,
          ravList.filter(rav => rav.subRav.nonce > claimedNonce)
        );

        cleanedCount += originalLength - this.ravs.get(key)!.length;
      }
    }

    return cleanedCount;
  }
}
