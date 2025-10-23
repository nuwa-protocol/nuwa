import { CryptoProvider } from '../providers';
import { KEY_TYPE, KeyType } from '../../types';
import { base64urlToBytes } from '../../utils/bytes';
import { IdentityKitErrorCode, createCryptoError } from '../../errors';

// Universal helper to obtain a Web Crypto implementation in both browser and Node.js environments.
// 1. In browsers (and newer versions of Node.js that expose `globalThis.crypto`) we return the global object.
// 2. In other Node.js environments we fall back to the built-in `crypto.webcrypto` implementation that was
//    imported above. This avoids using CommonJS `require`, which is not available in ESM bundles.
function getCrypto(): Crypto {
  // Use the built-in Web Crypto implementation exposed on globalThis.
  if (typeof globalThis !== 'undefined' && (globalThis as any).crypto) {
    return (globalThis as any).crypto as Crypto;
  }

  // If crypto is unavailable (e.g., very old Node versions), throw a descriptive error.
  throw createCryptoError(
    IdentityKitErrorCode.ENVIRONMENT_NOT_SUPPORTED,
    'Web Crypto API is not available in the current runtime',
    { environment: typeof globalThis, cryptoAvailable: false }
  );
}

export class Ed25519Provider implements CryptoProvider {
  private crypto: Crypto;

  constructor() {
    this.crypto = getCrypto();
  }

  async generateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
    const generated = await this.crypto.subtle.generateKey(
      {
        name: 'Ed25519',
      },
      true,
      ['sign', 'verify']
    );

    if (!('publicKey' in generated)) {
      throw createCryptoError(
        IdentityKitErrorCode.CRYPTO_OPERATION_FAILED,
        'Ed25519 generateKey did not return a key pair',
        { keyType: 'Ed25519', operation: 'generateKeyPair' }
      );
    }
    const { publicKey, privateKey } = generated;

    const exportedPublic = new Uint8Array(await this.crypto.subtle.exportKey('raw', publicKey));
    const exportedPrivate = new Uint8Array(await this.crypto.subtle.exportKey('pkcs8', privateKey));

    return {
      publicKey: exportedPublic,
      privateKey: exportedPrivate,
    };
  }

  async sign(data: Uint8Array, privateKey: Uint8Array | CryptoKey): Promise<Uint8Array> {
    let key: CryptoKey;
    if (privateKey instanceof Uint8Array) {
      key = await this.crypto.subtle.importKey(
        'pkcs8',
        privateKey,
        {
          name: 'Ed25519',
        },
        false,
        ['sign']
      );
    } else {
      key = privateKey;
    }

    const signature = await this.crypto.subtle.sign('Ed25519', key, data);

    return new Uint8Array(signature);
  }

  async verify(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array | JsonWebKey
  ): Promise<boolean> {
    let key: CryptoKey;
    if (publicKey instanceof Uint8Array) {
      key = await this.crypto.subtle.importKey(
        'raw',
        publicKey,
        {
          name: 'Ed25519',
        },
        false,
        ['verify']
      );
    } else {
      key = await this.crypto.subtle.importKey(
        'jwk',
        publicKey,
        {
          name: 'Ed25519',
        },
        false,
        ['verify']
      );
    }

    return await this.crypto.subtle.verify('Ed25519', key, signature, data);
  }

  getKeyType(): KeyType {
    return KEY_TYPE.ED25519;
  }

  async derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
    // Import private key as exportable
    const cryptoKey = await this.crypto.subtle.importKey(
      'pkcs8',
      privateKey,
      { name: 'Ed25519' },
      true,
      ['sign']
    );

    // Generate a temporary key pair and use the same private key to get corresponding public key
    // This is a workaround since Web Crypto API doesn't allow direct derivation
    // We'll export as JWK and extract the public key coordinates
    const jwk = await this.crypto.subtle.exportKey('jwk', cryptoKey);
    if (!jwk.x) {
      throw createCryptoError(
        IdentityKitErrorCode.CRYPTO_KEY_DERIVATION_FAILED,
        'Failed to derive public key from private key',
        { keyType: 'Ed25519', operation: 'derivePublicKey' }
      );
    }

    // Convert base64url public key to raw bytes
    const publicKeyBytes = base64urlToBytes(jwk.x);
    return publicKeyBytes;
  }
}
