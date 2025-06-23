import { base64url, base64urlpad } from 'multiformats/bases/base64';
import { Bytes } from './bytes';
/**
 * Encode data (string or Uint8Array) to Base64URL (unpadded).
 */
export function encode(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? Bytes.stringToBytes(data) : data;
  return base64url.encode(bytes);
}

/**
 * Encode data with padding (`=`) – rarely needed but provided for completeness.
 */
export function encodePadded(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? Bytes.stringToBytes(data) : data;
  return base64urlpad.encode(bytes);
}

/**
 * Decode a Base64URL string (unpadded or padded) to Uint8Array.
 */
export function decodeToBytes(b64url: string): Uint8Array {
  // multiformats decoder accepts both padded & unpadded URL variant
  return base64url.decode(b64url);
}

/**
 * Decode a Base64URL string to UTF-8 string.
 */
export function decodeToString(b64url: string): string {
  const bytes = decodeToBytes(b64url);
  return Bytes.bytesToString(bytes);
}

export const Base64 = {
  encode,
  encodePadded,
  decodeToBytes,
  decodeToString,
};

export default Base64;
