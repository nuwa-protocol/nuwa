import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { CryptoProvider } from '../providers';
import { KEY_TYPE, KeyType } from '../../types';
import { IdentityKitErrorCode, createCryptoError } from '../../errors';

export class Secp256k1Provider implements CryptoProvider {
  async generateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed format

    return {
      publicKey,
      privateKey,
    };
  }

  async sign(data: Uint8Array, privateKey: Uint8Array | CryptoKey): Promise<Uint8Array> {
    if (privateKey instanceof CryptoKey) {
      throw createCryptoError(
        IdentityKitErrorCode.OPERATION_NOT_SUPPORTED,
        'CryptoKey is not supported for Secp256k1 signing',
        { keyType: 'Secp256k1', operation: 'sign', privateKeyType: 'CryptoKey' }
      );
    }
    const msgHash = sha256(data);
    const signature = secp256k1.sign(msgHash, privateKey);
    return signature.toCompactRawBytes();
  }

  async verify(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array | JsonWebKey
  ): Promise<boolean> {
    if (!(publicKey instanceof Uint8Array)) {
      throw createCryptoError(
        IdentityKitErrorCode.OPERATION_NOT_SUPPORTED,
        'JsonWebKey is not supported for Secp256k1 verification',
        { keyType: 'Secp256k1', operation: 'verify', publicKeyType: 'JsonWebKey' }
      );
    }
    const msgHash = sha256(data);
    return secp256k1.verify(signature, msgHash, publicKey);
  }

  getKeyType(): KeyType {
    return KEY_TYPE.SECP256K1;
  }

  async derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
    return secp256k1.getPublicKey(privateKey, true); // compressed format
  }
}
