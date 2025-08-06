/**
 * BigInt serialization utilities
 * 
 * This module provides unified BigInt handling for JSON serialization
 * across the entire Payment Kit codebase.
 */

/**
 * Recursively serialize BigInt values in an object to strings
 * This is safe for nested objects and arrays
 */
export function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInt(item));
  }
  
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  
  return obj;
}

/**
 * BigInt replacer function for JSON.stringify
 * Usage: JSON.stringify(obj, bigintReplacer)
 */
export function bigintReplacer(key: string, value: any): any {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

/**
 * Create a custom JSON.stringify that handles BigInt automatically
 * Usage: safeBigIntStringify(obj)
 */
export function safeBigIntStringify(obj: any, space?: string | number): string {
  return JSON.stringify(obj, bigintReplacer, space);
}

/**
 * Enhanced createSuccessResponse that automatically handles BigInt serialization
 */
export function createSuccessResponseWithBigInt<T>(data: T): any {
  return {
    success: true,
    data: serializeBigInt(data),
    timestamp: new Date().toISOString(),
  };
}