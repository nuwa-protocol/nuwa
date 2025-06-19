/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

/**
 * Canonicalize a JSON object by sorting its keys.
 */
export function canonicalize(obj: any): string {
  const keys = Object.keys(obj).sort();
  return JSON.stringify(obj, keys);
}
