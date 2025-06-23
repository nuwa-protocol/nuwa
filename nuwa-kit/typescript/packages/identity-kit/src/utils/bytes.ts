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

export const Bytes = {
  stringToBytes,
  bytesToString,
};

export default Bytes;
