/**
 * BCS serialization utilities for SQL storage
 * Uses SubRAVCodec to ensure consistency with Move contracts
 */

import { SubRAVCodec } from '../../core/SubRav';
import type { SubRAV } from '../../core/types';

/**
 * Encode SubRAV to Buffer using BCS serialization
 * This ensures cross-platform consistency with Move contracts
 */
export function encodeSubRAV(subRav: SubRAV): Buffer {
  try {
    const bytes = SubRAVCodec.encode(subRav);
    return Buffer.from(bytes);
  } catch (error) {
    throw new Error(
      `Failed to encode SubRAV: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decode Buffer to SubRAV using BCS deserialization
 */
export function decodeSubRAV(buffer: Buffer): SubRAV {
  try {
    const bytes = new Uint8Array(buffer);
    return SubRAVCodec.decode(bytes);
  } catch (error) {
    throw new Error(
      `Failed to decode SubRAV: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get BCS hex representation of SubRAV (useful for debugging and contract calls)
 */
export function getSubRAVHex(subRav: SubRAV): string {
  return SubRAVCodec.toHex(subRav);
}
