/**
 * Base64URL 编码/解码工具函数
 */
function base64urlEncode(buffer: ArrayBuffer): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export class DIDKeyManager {
  /**
   * 从 Passkey 的公钥生成 did:key
   * @param publicKey 公钥的 ArrayBuffer
   * @returns did:key 字符串
   */
  static async generateDIDFromPublicKey(publicKey: ArrayBuffer): Promise<string> {
    // 将公钥转换为 base64url 格式
    const publicKeyBase64 = base64urlEncode(publicKey);
    
    // 生成 did:key
    // 目前使用简单的格式，后续可以根据需要扩展
    return `did:key:${publicKeyBase64}`;
  }

  /**
   * 从 did:key 中提取公钥
   * @param didKey did:key 字符串
   * @returns 公钥的 ArrayBuffer
   */
  static async extractPublicKeyFromDID(didKey: string): Promise<ArrayBuffer> {
    if (!didKey.startsWith('did:key:')) {
      throw new Error('Invalid did:key format');
    }

    const publicKeyBase64 = didKey.slice('did:key:'.length);
    return base64urlDecode(publicKeyBase64);
  }

  /**
   * 验证 did:key 格式
   * @param didKey did:key 字符串
   * @returns 是否是有效的 did:key 格式
   */
  static isValidDIDKey(didKey: string): boolean {
    if (!didKey.startsWith('did:key:')) {
      return false;
    }

    try {
      const publicKeyBase64 = didKey.slice('did:key:'.length);
      base64urlDecode(publicKeyBase64);
      return true;
    } catch {
      return false;
    }
  }
} 