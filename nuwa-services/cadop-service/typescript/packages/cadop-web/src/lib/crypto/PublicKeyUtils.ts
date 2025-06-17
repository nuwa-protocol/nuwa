// Note: Install these packages first: npm install @noble/curves @peculiar/asn1-schema @peculiar/asn1-x509 @stablelib/ed25519
// For now, using legacy implementations with improved error handling

import { p256 } from '@noble/curves/p256';
import { ed25519 as ed25519Noble } from '@noble/curves/ed25519';
import * as ed25519Stable from '@stablelib/ed25519';
import { AsnParser } from '@peculiar/asn1-schema';
import { SubjectPublicKeyInfo } from '@peculiar/asn1-x509';
import { KEY_TYPE, KeyType } from '@nuwa-ai/identity-kit';

/**
 * Centralized cryptographic utilities using mature libraries
 * Replaces scattered custom implementations throughout the codebase
 *
 * TODO: After installing packages, uncomment the imports:
 * import { p256 } from '@noble/curves/p256';
 * import { ed25519 as ed25519Noble } from '@noble/curves/ed25519';
 * import * as ed25519Stable from '@stablelib/ed25519';
 * import { AsnParser } from '@peculiar/asn1-schema';
 * import { SubjectPublicKeyInfo } from '@peculiar/asn1-x509';
 */
export class PublicKeyUtils {
  /**
   * Extract raw public key from WebAuthn SPKI format
   * Uses @peculiar/asn1-x509 for robust ASN.1 parsing
   */
  static extractRawPublicKeyFromSPKI(
    spkiInput: ArrayBuffer | Uint8Array,
    algorithm: number
  ): Uint8Array {
    const spkiBytes = spkiInput instanceof Uint8Array ? spkiInput : new Uint8Array(spkiInput);

    console.log('[PublicKeyUtils] SPKI extraction started:', {
      algorithm,
      spkiLength: spkiBytes.length,
      spkiHex: Array.from(spkiBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''),
      first10Bytes: Array.from(spkiBytes.slice(0, 10))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' '),
    });

    try {
      // Use ASN.1 parser for robust SPKI parsing
      const spki = AsnParser.parse(spkiBytes, SubjectPublicKeyInfo);
      const publicKeyBytes = new Uint8Array(spki.subjectPublicKey);

      console.log('[PublicKeyUtils] ASN.1 parsing successful:', {
        publicKeyBytesLength: publicKeyBytes.length,
        publicKeyHex: Array.from(publicKeyBytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        first10Bytes: Array.from(publicKeyBytes.slice(0, 10))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' '),
      });

      if (algorithm === -8) {
        // Ed25519
        const result = publicKeyBytes.slice(-32);
        console.log('[PublicKeyUtils] Ed25519 key extracted:', {
          resultLength: result.length,
          resultHex: Array.from(result)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(''),
        });
        return result;
      } else if (algorithm === -7) {
        // ES256 (P-256)
        // Find uncompressed point marker (0x04) and compress
        const uncompressedIndex = publicKeyBytes.findIndex(byte => byte === 0x04);
        console.log('[PublicKeyUtils] P-256 uncompressed point search:', {
          uncompressedIndex,
          found: uncompressedIndex !== -1,
          availableLength: publicKeyBytes.length - uncompressedIndex,
        });

        if (uncompressedIndex === -1 || uncompressedIndex + 65 > publicKeyBytes.length) {
          throw new Error('Invalid P-256 public key format');
        }

        const uncompressedPoint = publicKeyBytes.slice(uncompressedIndex, uncompressedIndex + 65);
        console.log('[PublicKeyUtils] P-256 uncompressed point extracted:', {
          pointLength: uncompressedPoint.length,
          firstByte: uncompressedPoint[0].toString(16).padStart(2, '0'),
          pointHex: Array.from(uncompressedPoint)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(''),
        });

        const compressed = this.compressP256PublicKey(uncompressedPoint);
        console.log('[PublicKeyUtils] P-256 compression completed:', {
          compressedLength: compressed.length,
          compressionFlag: compressed[0].toString(16).padStart(2, '0'),
          compressedHex: Array.from(compressed)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(''),
        });

        return compressed;
      } else {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
      }
    } catch (error) {
      // Fallback to legacy parsing if ASN.1 parsing fails
      console.warn('[PublicKeyUtils] ASN.1 parsing failed, falling back to legacy method:', error);
      const result = this.extractRawPublicKeyLegacy(spkiBytes, algorithm);
      console.log('[PublicKeyUtils] Legacy extraction result:', {
        resultLength: result.length,
        resultHex: Array.from(result)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
      });
      return result;
    }
  }

  /**
   * Compress P-256 public key using @noble/curves
   */
  static compressP256PublicKey(uncompressedPoint: Uint8Array): Uint8Array {
    console.log('[PublicKeyUtils] P-256 compression started:', {
      inputLength: uncompressedPoint.length,
      firstByte: uncompressedPoint[0]?.toString(16).padStart(2, '0'),
      isValidFormat: uncompressedPoint.length === 65 && uncompressedPoint[0] === 0x04,
    });

    if (uncompressedPoint.length !== 65 || uncompressedPoint[0] !== 0x04) {
      throw new Error('Invalid uncompressed P-256 point format');
    }

    try {
      // Use @noble/curves for reliable point compression
      const point = p256.ProjectivePoint.fromHex(uncompressedPoint);
      const compressed = point.toRawBytes(true); // compressed format

      console.log('[PublicKeyUtils] P-256 compression successful:', {
        compressedLength: compressed.length,
        compressionFlag: compressed[0].toString(16).padStart(2, '0'),
        compressedHex: Array.from(compressed)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
      });

      return compressed;
    } catch (error) {
      console.error('[PublicKeyUtils] P-256 compression failed:', error);
      throw new Error(`Failed to compress P-256 public key: ${(error as Error).message}`);
    }
  }

  /**
   * Decompress P-256 public key using @noble/curves
   */
  static decompressP256PublicKey(compressedPoint: Uint8Array): Uint8Array {
    console.log('[PublicKeyUtils] P-256 decompression started:', {
      inputLength: compressedPoint.length,
      compressionFlag: compressedPoint[0]?.toString(16).padStart(2, '0'),
      isValidLength: compressedPoint.length === 33,
      isValidCompressionFlag: compressedPoint[0] === 0x02 || compressedPoint[0] === 0x03,
    });

    if (compressedPoint.length !== 33) {
      throw new Error('Invalid compressed P-256 point length');
    }

    try {
      const point = p256.ProjectivePoint.fromHex(compressedPoint);
      const decompressed = point.toRawBytes(false); // uncompressed format

      console.log('[PublicKeyUtils] P-256 decompression successful:', {
        decompressedLength: decompressed.length,
        firstByte: decompressed[0].toString(16).padStart(2, '0'),
        isValidUncompressed: decompressed.length === 65 && decompressed[0] === 0x04,
        xCoordinate: Array.from(decompressed.slice(1, 33))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        yCoordinate: Array.from(decompressed.slice(33, 65))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
      });

      return decompressed;
    } catch (error) {
      console.error('[PublicKeyUtils] P-256 decompression failed:', error);
      throw new Error(`Failed to decompress P-256 public key: ${(error as Error).message}`);
    }
  }

  /**
   * Verify signature using appropriate algorithm
   * Similar to ecdsa_r1.ts verify method but supports multiple key types
   */
  static async verify(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    keyType: KeyType
  ): Promise<boolean> {
    console.log('[PublicKeyUtils] Signature verification started:', {
      keyType,
      dataLength: data.length,
      signatureLength: signature.length,
      publicKeyLength: publicKey.length,
    });

    try {
      let result: boolean;

      if (keyType === KEY_TYPE.ED25519) {
        console.log('[PublicKeyUtils] Using Ed25519 verification');
        result = this.verifyEd25519(data, signature, publicKey);
      } else if (keyType === KEY_TYPE.ECDSAR1) {
        console.log('[PublicKeyUtils] Using ECDSA-R1 verification');
        result = await this.verifyEcdsaR1(data, signature, publicKey);
      } else if (keyType === KEY_TYPE.SECP256K1) {
        // TODO: Add secp256k1 support when needed
        throw new Error('Secp256k1 verification not implemented yet');
      } else {
        throw new Error(`Unsupported key type: ${keyType}`);
      }

      console.log('[PublicKeyUtils] Signature verification result:', {
        keyType,
        result,
        success: result === true,
      });

      return result;
    } catch (error) {
      console.error('[PublicKeyUtils] Signature verification failed:', {
        keyType,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
      });
      return false;
    }
  }

  /**
   * Verify Ed25519 signature using @stablelib/ed25519
   */
  private static verifyEd25519(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): boolean {
    if (publicKey.length !== 32) {
      throw new Error('Invalid Ed25519 public key length');
    }
    if (signature.length !== 64) {
      throw new Error('Invalid Ed25519 signature length');
    }

    return ed25519Stable.verify(publicKey, data, signature);
  }

  /**
   * Verify ECDSA-R1 (P-256) signature using WebCrypto API and @noble/curves
   */
  private static async verifyEcdsaR1(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): Promise<boolean> {
    console.log('[PublicKeyUtils] ECDSA-R1 verification started:', {
      dataLength: data.length,
      signatureLength: signature.length,
      publicKeyLength: publicKey.length,
      signatureHex: Array.from(signature)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''),
      publicKeyHex: Array.from(publicKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''),
      dataFirst20Bytes: Array.from(data.slice(0, 20))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' '),
    });

    try {
      // Get crypto object based on environment
      const crypto = this.getCrypto();

      // Decompress the public key for WebCrypto
      const decompressedKey = this.decompressP256PublicKey(publicKey);

      console.log('[PublicKeyUtils] Public key decompressed for WebCrypto:', {
        originalLength: publicKey.length,
        decompressedLength: decompressedKey.length,
        isValidUncompressed: decompressedKey.length === 65 && decompressedKey[0] === 0x04,
      });

      // Import the public key for WebCrypto
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        decompressedKey,
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        false,
        ['verify']
      );

      console.log('[PublicKeyUtils] WebCrypto key imported successfully');

      // WebCrypto expects DER format, convert if needed
      const derSignature = SignatureUtils.normalizeSignature(signature, KEY_TYPE.ECDSAR1, 'der');

      console.log('[PublicKeyUtils] Signature normalized to DER:', {
        originalLength: signature.length,
        derLength: derSignature.length,
        isDER: derSignature.length > 64 && derSignature[0] === 0x30,
        derHex: Array.from(derSignature)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        wasConverted: !Array.from(signature).every((byte, index) => byte === derSignature[index]),
      });

      // WebCrypto.verify expects the original data, not the hash
      // It will internally compute SHA-256(data) before verification
      const result = await crypto.subtle.verify(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' },
        },
        cryptoKey,
        derSignature,
        data // WebCrypto will hash this internally
      );

      console.log('[PublicKeyUtils] ECDSA-R1 verification completed:', {
        result,
        algorithm: 'ECDSA',
        curve: 'P-256',
        hash: 'SHA-256',
      });

      return result;
    } catch (error) {
      console.error('[PublicKeyUtils] ECDSA-R1 verification failed:', error);
      return false;
    }
  }

  /**
   * Get crypto object based on environment
   */
  private static getCrypto(): Crypto {
    if (typeof window !== 'undefined') {
      return window.crypto;
    }
    // In Node.js environment
    return require('crypto').webcrypto;
  }

  /**
   * Legacy extraction method as fallback
   */
  private static extractRawPublicKeyLegacy(spki: Uint8Array, alg: number): Uint8Array {
    if (alg === -8) {
      // Ed25519
      return spki.slice(spki.length - 32);
    }
    if (alg === -7) {
      // ES256
      const idx = spki.indexOf(0x04);
      if (idx === -1 || idx + 65 > spki.length) {
        throw new Error('Invalid P-256 SPKI format');
      }
      const x = spki.slice(idx + 1, idx + 33);
      const y = spki.slice(idx + 33, idx + 65);
      const prefix = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03;
      const compressed = new Uint8Array(33);
      compressed[0] = prefix;
      compressed.set(x, 1);
      return compressed;
    }
    throw new Error(`Unsupported algorithm ${alg}`);
  }
}

/**
 * Signature format conversion utilities using @noble/curves
 */
export class SignatureUtils {
  /**
   * Convert DER signature to raw format using @noble/curves
   */
  static derToRaw(derSignature: Uint8Array, keyType: KeyType): Uint8Array {
    if (keyType === KEY_TYPE.ECDSAR1) {
      try {
        const signature = p256.Signature.fromDER(derSignature);
        return signature.toCompactRawBytes(); // 64-byte raw format
      } catch (error) {
        throw new Error(`Failed to convert DER to raw: ${(error as Error).message}`);
      }
    } else if (keyType === KEY_TYPE.SECP256K1) {
      // TODO: Add secp256k1 support if needed
      throw new Error('Secp256k1 DER conversion not implemented');
    } else {
      // Ed25519 signatures are already in raw format
      return derSignature;
    }
  }

  /**
   * Convert raw signature to DER format using @noble/curves
   */
  static rawToDer(rawSignature: Uint8Array, keyType: KeyType): Uint8Array {
    if (keyType === KEY_TYPE.ECDSAR1 && rawSignature.length === 64) {
      try {
        const r = rawSignature.slice(0, 32);
        const s = rawSignature.slice(32, 64);
        const signature = new p256.Signature(
          BigInt(
            '0x' +
              Array.from(r)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
          ),
          BigInt(
            '0x' +
              Array.from(s)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
          )
        );
        return signature.toDERRawBytes();
      } catch (error) {
        throw new Error(`Failed to convert raw to DER: ${(error as Error).message}`);
      }
    } else {
      // For other key types or if already in DER format
      return rawSignature;
    }
  }

  /**
   * Auto-detect and normalize signature format
   */
  static normalizeSignature(
    signature: Uint8Array,
    keyType: KeyType,
    targetFormat: 'raw' | 'der'
  ): Uint8Array {
    if (keyType === KEY_TYPE.ECDSAR1) {
      const isDER = signature.length > 64 && signature[0] === 0x30;

      if (targetFormat === 'raw') {
        return isDER ? this.derToRaw(signature, keyType) : signature;
      } else {
        return isDER ? signature : this.rawToDer(signature, keyType);
      }
    } else {
      // Ed25519 and other key types typically use raw format
      return signature;
    }
  }

  /**
   * Legacy DER to Raw conversion (kept for fallback)
   */
  static derToRawLegacy(der: Uint8Array): Uint8Array {
    let offset = 0;
    if (der[offset++] !== 0x30) throw new Error('Invalid DER');
    const seqLen = der[offset++];
    if (seqLen + 2 !== der.length) {
      // length byte could be multi-byte but for 70-72 len it's fine
    }
    if (der[offset++] !== 0x02) throw new Error('Invalid DER');
    const rLen = der[offset++];
    let r = der.slice(offset, offset + rLen);
    offset += rLen;
    if (der[offset++] !== 0x02) throw new Error('Invalid DER');
    const sLen = der[offset++];
    let s = der.slice(offset, offset + sLen);

    // Strip leading zero padding
    if (r.length === 33 && r[0] === 0x00) {
      r = r.slice(1);
    }
    if (s.length === 33 && s[0] === 0x00) {
      s = s.slice(1);
    }
    if (r.length > 32 || s.length > 32) {
      throw new Error('Invalid signature length');
    }

    // Pad to 32 bytes
    const rPad = new Uint8Array(32);
    rPad.set(r, 32 - r.length);
    const sPad = new Uint8Array(32);
    sPad.set(s, 32 - s.length);

    const raw = new Uint8Array(64);
    raw.set(rPad, 0);
    raw.set(sPad, 32);
    return raw;
  }
}
