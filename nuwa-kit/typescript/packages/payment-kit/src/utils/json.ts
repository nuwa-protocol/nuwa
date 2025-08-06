/**
 * JSON utilities with BigInt support using lossless-json
 * 
 * This module provides unified JSON serialization/deserialization
 * that properly handles BigInt values without manual field conversion.
 */

import { stringify, parse, LosslessNumber } from 'lossless-json';

/**
 * Serialize any object to JSON string with BigInt support
 */
export function serializeJson(value: any): string {
  const result = stringify(value);
  if (result === undefined) {
    throw new Error('Failed to serialize value to JSON');
  }
  return result;
}

/**
 * Parse JSON string to object with BigInt support
 * Only converts specific fields that are known to be BigInt values
 */
export function parseJson<T = any>(text: string): T {
  return parse(text, (key, value) => {
    // Convert LosslessNumber to BigInt only for specific BigInt fields
    if (value instanceof LosslessNumber) {
      const str = value.toString();
      // Check if it's an integer (no decimal point)
      if (str.indexOf('.') === -1 && str.indexOf('e') === -1 && str.indexOf('E') === -1) {
        // Only convert to BigInt for known BigInt fields
        const bigintFields = [
          'chainId', 'channelEpoch', 'accumulatedAmount', 'nonce', 
          'epoch', 'amount', 'claimedAmount', 'totalAmount'
        ];
        
        if (bigintFields.includes(key)) {
          try {
            return BigInt(str);
          } catch {
            // If BigInt conversion fails, keep as LosslessNumber
            return value;
          }
        }
        
        // For other integer fields, convert to regular number if within safe range
        const num = Number(str);
        if (Number.isSafeInteger(num)) {
          return num;
        }
      }
    }
    return value;
  }) as T;
}

/**
 * Response helper for Express routes
 */
export function sendJsonResponse(res: any, data: any): void {
  res.setHeader('Content-Type', 'application/json');
  res.send(serializeJson(data));
}

/**
 * Parse Response object to JSON with BigInt support
 */
export async function parseJsonResponse<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  return parseJson<T>(text);
}

/**
 * Safe JSON stringify that handles BigInt by converting to string
 * Useful for logging and debugging
 */
export function safeStringify(value: any, space?: string | number): string {
  return JSON.stringify(value, (key, val) => {
    return typeof val === 'bigint' ? val.toString() : val;
  }, space);
}