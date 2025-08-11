import type { SubRAV } from './types';

/**
 * Assert monotonic progression between previous and next SubRAV deltas.
 * - next.nonce must equal prev.nonce + 1
 * - next.accumulatedAmount must be > prev.accumulatedAmount
 *   (set allowSameAccumulated=true to allow equality in special cases)
 */
export function assertRavProgression(
  prevNonce: bigint,
  prevAccumulatedAmount: bigint,
  nextNonce: bigint,
  nextAccumulatedAmount: bigint,
  allowSameAccumulated: boolean = false
): void {
  const expectedNonce = prevNonce + 1n;
  if (nextNonce !== expectedNonce) {
    throw new Error(`Invalid nonce: expected ${expectedNonce}, got ${nextNonce}`);
  }

  if (allowSameAccumulated) {
    if (nextAccumulatedAmount < prevAccumulatedAmount) {
      throw new Error(
        `Amount must not decrease: previous ${prevAccumulatedAmount}, new ${nextAccumulatedAmount}`
      );
    }
  } else {
    if (nextAccumulatedAmount <= prevAccumulatedAmount) {
      throw new Error(
        `Amount must increase: previous ${prevAccumulatedAmount}, new ${nextAccumulatedAmount}`
      );
    }
  }
}

/**
 * Convenience helper to assert progression using SubRAV objects.
 */
export function assertSubRavProgression(
  prev: Pick<SubRAV, 'nonce' | 'accumulatedAmount'>,
  next: Pick<SubRAV, 'nonce' | 'accumulatedAmount'>,
  allowSameAccumulated: boolean = false
): void {
  assertRavProgression(
    prev.nonce,
    prev.accumulatedAmount,
    next.nonce,
    next.accumulatedAmount,
    allowSameAccumulated
  );
}
