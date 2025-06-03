import * as jose from 'jose';
import { createHash, randomBytes } from 'crypto';
import { logger } from '../utils/logger.js';
import type { IDToken } from '../types/oidc.js';
import * as jwt from 'jsonwebtoken';

// Define our own JWK type that matches the shared type
interface LocalJWK {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  key_ops?: string[];
  [key: string]: unknown;
}

export class CryptoService {
  private static instance: CryptoService;
  private publicKey: Uint8Array | null = null;
  private privateKey: Uint8Array | null = null;
  private publicJWK: LocalJWK | null = null;
  private privateJWK: LocalJWK | null = null;
  private keyId: string | null = null;

  private constructor() {}

  public static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  /**
   * Generate a key ID from a JWK
   */
  private generateKeyId(jwk: LocalJWK): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(jwk));
    return hash.digest('hex').slice(0, 16);
  }

  /**
   * Initialize cryptographic keys
   */
  public async initializeKeys(): Promise<void> {
    try {
      // Check if we already have keys
      if (this.publicKey && this.privateKey) {
        logger.info('Crypto keys already initialized');
        return;
      }

      // Generate new Ed25519 key pair
      const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA');
      this.publicKey = publicKey as unknown as Uint8Array;
      this.privateKey = privateKey as unknown as Uint8Array;

      // Export keys as JWK
      const exportedPublicJWK = await jose.exportJWK(publicKey);
      const exportedPrivateJWK = await jose.exportJWK(privateKey);

      // Convert to our JWK type with required fields
      this.publicJWK = {
        kty: exportedPublicJWK.kty || 'OKP',
        ...exportedPublicJWK
      } as LocalJWK;

      this.privateJWK = {
        kty: exportedPrivateJWK.kty || 'OKP',
        ...exportedPrivateJWK
      } as LocalJWK;

      // Generate key ID
      this.keyId = this.generateKeyId(this.publicJWK);

      // Set key properties
      this.publicJWK.kid = this.keyId;
      this.publicJWK.use = 'sig';
      this.publicJWK.alg = 'EdDSA';
      this.publicJWK.key_ops = ['verify'];

      this.privateJWK.kid = this.keyId;
      this.privateJWK.use = 'sig';
      this.privateJWK.alg = 'EdDSA';
      this.privateJWK.key_ops = ['sign'];

      logger.info('Crypto keys initialized successfully', {
        keyId: this.keyId,
      });
    } catch (error) {
      logger.error('Failed to initialize crypto keys', { error });
      throw error;
    }
  }

  /**
   * Get the public key as JWK
   */
  public getPublicJWK(): LocalJWK | null {
    return this.publicJWK;
  }

  /**
   * Get the key ID
   */
  public getKeyId(): string | null {
    return this.keyId;
  }

  /**
   * Sign data using the private key
   */
  public async sign(data: string): Promise<string> {
    if (!this.privateKey || !this.keyId) {
      throw new Error('Private key not initialized');
    }

    const signature = await new jose.SignJWT({ data })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.keyId })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(this.privateKey);

    return signature;
  }

  /**
   * Verify a signature using the public key
   */
  public async verify(signature: string): Promise<boolean> {
    if (!this.publicKey) {
      throw new Error('Public key not initialized');
    }

    try {
      const { payload } = await jose.jwtVerify(signature, this.publicKey);
      return !!payload;
    } catch (error) {
      logger.error('Signature verification failed', { error });
      return false;
    }
  }

  /**
   * Generate secure random string
   */
  public generateSecureRandom(length: number = 32): string {
    return randomBytes(length).toString('base64url');
  }

  /**
   * Generate authorization code
   */
  public generateAuthorizationCode(): string {
    return this.generateSecureRandom(32);
  }

  /**
   * Generate access token
   */
  public generateAccessToken(): string {
    return this.generateSecureRandom(32);
  }

  /**
   * Generate refresh token
   */
  public generateRefreshToken(): string {
    return this.generateSecureRandom(32);
  }

  /**
   * Create hash
   */
  public createHash(input: string, algorithm: string = 'sha256'): string {
    return createHash(algorithm).update(input).digest('hex');
  }

  /**
   * Verify hash
   */
  public verifyHash(input: string, hash: string, algorithm: string = 'sha256'): boolean {
    const computed = this.createHash(input, algorithm);
    return computed === hash;
  }

  /**
   * Sign ID Token
   */
  public signIDToken(claims: IDToken): string {
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    return jwt.sign(claims, secret, {
      algorithm: 'HS256'
    });
  }

  public async verifyIDToken(token: string): Promise<boolean> {
    try {
      const secret = process.env['JWT_SECRET'];
      if (!secret) {
        return false;
      }

      jwt.verify(token, secret, {
        algorithms: ['HS256']
      });

      return true;
    } catch (error) {
      logger.error('Failed to verify ID token', { error });
      return false;
    }
  }

  public decodeIDToken(token: string): IDToken | null {
    try {
      return jwt.decode(token) as IDToken;
    } catch (error) {
      logger.error('Failed to decode ID token', { error });
      return null;
    }
  }
}

// 导出单例实例
export const cryptoService = CryptoService.getInstance(); 