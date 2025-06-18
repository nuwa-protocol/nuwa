/**
 * Base64URL encoding/decoding utilities for browser environments
 * 
 * This implementation uses only browser standard APIs and does not depend on any external libraries
 */

/**
 * Encode a string or Uint8Array to Base64URL format
 * @param data - String or Uint8Array to encode
 * @returns Base64URL encoded string
 */
export function encodeBase64Url(data: string | Uint8Array): string {
  // Convert to string if needed
  let str: string;
  if (typeof data === 'string') {
    str = data;
  } else {
    str = new TextDecoder().decode(data);
  }

  // Encode to standard base64
  const base64 = btoa(str);
  
  // Convert to base64url format (replace +, / and remove =)
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode a Base64URL string to a UTF-8 string
 * @param encoded - Base64URL encoded string
 * @returns Decoded UTF-8 string
 */
export function decodeBase64UrlToString(encoded: string): string {
  // Convert from base64url to standard base64
  const base64 = toBase64(encoded);
  
  // Decode base64 to string
  return atob(base64);
}

/**
 * Decode a Base64URL string to a Uint8Array
 * @param encoded - Base64URL encoded string
 * @returns Decoded Uint8Array
 */
export function decodeBase64UrlToBytes(encoded: string): Uint8Array {
  // Convert base64url to base64
  const base64 = toBase64(encoded);
  
  // Decode base64 to binary string
  const binaryString = atob(base64);
  
  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Convert a Base64URL string to a standard Base64 string
 * @param base64url - Base64URL encoded string
 * @returns Standard Base64 encoded string
 */
export function toBase64(base64url: string): string {
  // Add padding
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  
  return base64;
}

/**
 * Convert a standard Base64 string to a Base64URL string
 * @param base64 - Standard Base64 encoded string
 * @returns Base64URL encoded string
 */
export function fromBase64(base64: string): string {
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}