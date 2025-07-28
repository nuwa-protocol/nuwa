/**
 * BCS serialization utilities for SQL storage
 * Uses the same BCS schema as the Move contract to ensure consistency
 */

import { SubRAVCodec } from '../../core/subrav';
import type { SignedSubRAV } from '../../core/types';

/**
 * Serialize SignedSubRAV to Buffer for SQL storage
 */
export function encodeSignedSubRAV(signedSubRAV: SignedSubRAV): Buffer {
  try {
    // Convert BigInt values to strings for JSON serialization
    const serializableRAV = {
      subRav: {
        ...signedSubRAV.subRav,
        chainId: signedSubRAV.subRav.chainId.toString(),
        channelEpoch: signedSubRAV.subRav.channelEpoch.toString(),
        accumulatedAmount: signedSubRAV.subRav.accumulatedAmount.toString(),
        nonce: signedSubRAV.subRav.nonce.toString(),
      },
      signature: Array.from(signedSubRAV.signature),
    };
    
    const jsonStr = JSON.stringify(serializableRAV);
    return Buffer.from(jsonStr, 'utf8');
  } catch (error) {
    throw new Error(`Failed to encode SignedSubRAV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Deserialize Buffer to SignedSubRAV from SQL storage
 */
export function decodeSignedSubRAV(buffer: Buffer): SignedSubRAV {
  try {
    const jsonStr = buffer.toString('utf8');
    const combined = JSON.parse(jsonStr);
    
    // Convert string values back to BigInt
    return {
      subRav: {
        ...combined.subRav,
        chainId: BigInt(combined.subRav.chainId),
        channelEpoch: BigInt(combined.subRav.channelEpoch),
        accumulatedAmount: BigInt(combined.subRav.accumulatedAmount),
        nonce: BigInt(combined.subRav.nonce),
      },
      signature: new Uint8Array(combined.signature),
    };
  } catch (error) {
    throw new Error(`Failed to decode SignedSubRAV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Encode just the SubRAV part using BCS (for contract compatibility)
 */
export function encodeSubRAVBCS(signedSubRAV: SignedSubRAV): Buffer {
  try {
    const bcsBytes = SubRAVCodec.encode(signedSubRAV.subRav);
    return Buffer.from(bcsBytes);
  } catch (error) {
    throw new Error(`Failed to BCS encode SubRAV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get BCS hex representation of SubRAV (useful for debugging and contract calls)
 */
export function getSubRAVHex(signedSubRAV: SignedSubRAV): string {
  return SubRAVCodec.toHex(signedSubRAV.subRav);
}
