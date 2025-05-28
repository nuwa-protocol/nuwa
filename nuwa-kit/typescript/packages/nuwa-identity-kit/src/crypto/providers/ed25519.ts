import { webcrypto } from 'crypto';
import { CryptoProvider } from '../providers';
import { KEY_TYPE, KeyType } from '../../types';

export class Ed25519Provider implements CryptoProvider {
  async generateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
    const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
      {
        name: 'Ed25519',
        namedCurve: 'Ed25519'
      },
      true,
      ['sign', 'verify']
    );

    const exportedPublic = new Uint8Array(await webcrypto.subtle.exportKey('raw', publicKey));
    const exportedPrivate = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', privateKey));

    return {
      publicKey: exportedPublic,
      privateKey: exportedPrivate
    };
  }

  async sign(data: Uint8Array, privateKey: Uint8Array | CryptoKey): Promise<Uint8Array> {
    let key: CryptoKey;
    if (privateKey instanceof Uint8Array) {
      key = await webcrypto.subtle.importKey(
        'pkcs8',
        privateKey,
        {
          name: 'Ed25519',
          namedCurve: 'Ed25519'
        },
        false,
        ['sign']
      );
    } else {
      key = privateKey;
    }

    const signature = await webcrypto.subtle.sign(
      'Ed25519',
      key,
      data
    );

    return new Uint8Array(signature);
  }

  async verify(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array | JsonWebKey): Promise<boolean> {
    let key: CryptoKey;
    if (publicKey instanceof Uint8Array) {
      key = await webcrypto.subtle.importKey(
        'raw',
        publicKey,
        {
          name: 'Ed25519',
          namedCurve: 'Ed25519'
        },
        false,
        ['verify']
      );
    } else {
      key = await webcrypto.subtle.importKey(
        'jwk',
        publicKey,
        {
          name: 'Ed25519',
          namedCurve: 'Ed25519'
        },
        false,
        ['verify']
      );
    }

    return await webcrypto.subtle.verify(
      'Ed25519',
      key,
      signature,
      data
    );
  }

  getKeyType(): KeyType {
    return KEY_TYPE.ED25519;
  }
} 