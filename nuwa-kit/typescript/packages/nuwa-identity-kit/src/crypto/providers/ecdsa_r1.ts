import { p256 } from '@noble/curves/p256';
import { bytesToHex, hexToBytes } from '@noble/curves/abstract/utils';
import { CryptoProvider } from '../providers';
import { KEY_TYPE, KeyType } from '../../types';

// Get crypto object based on environment
function getCrypto() {
  if (typeof window !== 'undefined') {
    return window.crypto;
  }
  // In Node.js environment, we need to use dynamic import
  return require('crypto').webcrypto;
}

export class EcdsaR1Provider implements CryptoProvider {
  private crypto: Crypto;

  constructor() {
    this.crypto = getCrypto();
  }

  async generateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
    const { publicKey, privateKey } = await this.crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['sign', 'verify']
    );

    const exportedPublic = new Uint8Array(await this.crypto.subtle.exportKey('raw', publicKey));
    const exportedPrivate = new Uint8Array(await this.crypto.subtle.exportKey('pkcs8', privateKey));

    // Compress the public key to 33 bytes
    const compressedPublicKey = this.compressPublicKey(exportedPublic);

    return {
      publicKey: compressedPublicKey,
      privateKey: exportedPrivate
    };
  }

  private compressPublicKey(publicKey: Uint8Array): Uint8Array {
    if (publicKey.length !== 65) {
      throw new Error(`Invalid public key length. Expected 65 bytes, got ${publicKey.length}`);
    }

    // First byte is the format (0x04 for uncompressed)
    if (publicKey[0] !== 0x04) {
      throw new Error('Invalid public key format. Expected uncompressed format (0x04)');
    }

    // Extract x and y coordinates
    const x = publicKey.slice(1, 33);
    const y = publicKey.slice(33, 65);

    // Create compressed format (0x02 or 0x03) + x coordinate
    const compressedFormat = y[31] % 2 === 0 ? 0x02 : 0x03;
    
    const compressed = new Uint8Array(33);
    compressed[0] = compressedFormat;
    compressed.set(x, 1);
    
    return compressed;
  }

  private decompressPublicKey(compressedKey: Uint8Array): Uint8Array {
    if (compressedKey.length !== 33) {
      throw new Error(`Invalid compressed public key length. Expected 33 bytes, got ${compressedKey.length}`);
    }
    const format = compressedKey[0];
    if (format !== 0x02 && format !== 0x03) {
      throw new Error('Invalid compressed public key format. Expected 0x02 or 0x03');
    }
    try {
      const point = p256.ProjectivePoint.fromHex(compressedKey);
      const x = point.x;
      const y = point.y;
      const xBytes = hexToBytes(x.toString(16).padStart(64, '0'));
      const yBytes = hexToBytes(y.toString(16).padStart(64, '0'));
      const decompressed = new Uint8Array(65);
      decompressed[0] = 0x04;
      decompressed.set(xBytes, 1);
      decompressed.set(yBytes, 33);
      return decompressed;
    } catch (err) {
      const error = err as Error;
      throw new Error(`Failed to decompress public key: ${error.message}`);
    }
  }

  async sign(data: Uint8Array, privateKey: Uint8Array | CryptoKey): Promise<Uint8Array> {
    let key: CryptoKey;
    if (privateKey instanceof Uint8Array) {
      key = await this.crypto.subtle.importKey(
        'pkcs8',
        privateKey,
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        false,
        ['sign']
      );
    } else {
      key = privateKey;
    }

    const signature = await this.crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' }
      },
      key,
      data
    );

    return new Uint8Array(signature);
  }

  private convertDERSignatureToRaw(derSignature: Uint8Array): Uint8Array {
    // If DER -> convert to raw 64
    const firstByte = derSignature[0];
    if (firstByte === 0x30) {
      // looks like DER
      try {
        const sig = p256.Signature.fromDER(derSignature);
        return sig.toCompactRawBytes();
      } catch (e) {
        throw new Error('Invalid DER signature');
      }
    }
    // else assume already raw 64
    return derSignature;
  }

  private convertRawToDER(raw: Uint8Array): Uint8Array {
    if (raw.length !== 64) return raw;
    const r = bytesToHex(raw.slice(0, 32));
    const s = bytesToHex(raw.slice(32, 64));
    const der = p256.Signature.fromCompact(hexToBytes(r + s)).toDERHex();
    return hexToBytes(der);
  }

  async verify(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array | JsonWebKey): Promise<boolean> {
    let key: CryptoKey;
    if (publicKey instanceof Uint8Array) {
      // Decompress the public key before importing
      const decompressedKey = this.decompressPublicKey(publicKey);
      key = await this.crypto.subtle.importKey(
        'raw',
        decompressedKey,
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        false,
        ['verify']
      );
    } else {
      key = await this.crypto.subtle.importKey(
        'jwk',
        publicKey,
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        false,
        ['verify']
      );
    }


    return await this.crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' }
      },
      key,
      signature,
      data
    );
  }

  getKeyType(): KeyType {
    return KEY_TYPE.ECDSAR1;
  }
} 