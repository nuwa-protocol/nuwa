import { CadopUtils, DIDDocument } from 'nuwa-identity-kit';

export class DIDKeyManager {
  /**
   * 从 Ed25519 公钥生成标准的 did:key
   * @param publicKey Ed25519 公钥的 ArrayBuffer
   * @returns 标准的 did:key 字符串
   */
  static generateDIDFromEd25519PublicKey(publicKey: ArrayBuffer): string {
    if (!(publicKey instanceof ArrayBuffer) || publicKey.byteLength !== 32) {
      throw new Error('Invalid Ed25519 public key, must be an ArrayBuffer of 32 bytes');
    }

    const publicKeyBytes = new Uint8Array(publicKey);
    return CadopUtils.generateDidKeyFromBytes(
      publicKeyBytes,
      'Ed25519VerificationKey2020'
    );
  }

  /**
   * 验证 did:key 格式和一致性
   * @param didKey did:key 字符串
   * @param publicKey 公钥的 JWK 格式
   * @returns 是否验证通过
   */
  static async validateDIDKey(didKey: string, publicKey: JsonWebKey): Promise<boolean> {
    try {
      if (!didKey.startsWith('did:key:z')) {
        return false;
      }
      return await CadopUtils.validateDidKeyConsistency(didKey, publicKey);
    } catch (error) {
      console.error('Error validating did:key consistency:', error);
      return false;
    }
  }

  /**
   * 创建基础的 DID Document
   * @param didKey did:key 字符串
   * @param publicKey 公钥的 JWK 格式
   * @returns DID Document
   */
  static createDIDDocument(didKey: string, publicKey: JsonWebKey): DIDDocument {
    return CadopUtils.createDidKeyDocument(
      didKey,
      publicKey,
      'Ed25519VerificationKey2020',
      ['authentication', 'capabilityDelegation']
    );
  }
} 