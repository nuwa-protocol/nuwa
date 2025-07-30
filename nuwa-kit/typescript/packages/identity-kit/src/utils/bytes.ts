export function stringToBytes(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  // Node.js < 16 fallback using Buffer
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Uint8Array.from(Buffer.from(str, 'utf-8'));
  }
  throw new Error('No TextEncoder or Buffer available in this environment.');
}

export function bytesToString(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  // Node.js < 16 fallback using Buffer
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes).toString('utf-8');
  }
  throw new Error('No TextDecoder or Buffer available in this environment.');
}

export function base64urlToBytes(base64url: string): Uint8Array {
  // Add padding if needed
  const padding = base64url.length % 4;
  const paddedBase64url = base64url + '='.repeat(padding === 0 ? 0 : 4 - padding);
  
  // Convert base64url to base64
  const base64 = paddedBase64url.replace(/-/g, '+').replace(/_/g, '/');
  
  // Decode to bytes
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const Bytes = {
  stringToBytes,
  bytesToString,
  base64urlToBytes,
};

export default Bytes;
