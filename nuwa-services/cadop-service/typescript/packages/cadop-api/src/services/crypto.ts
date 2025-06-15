import { createHash, randomBytes } from 'crypto';
import * as jose from 'jose';
import { logger } from '../utils/logger.js';
import { config } from '../config/environment.js';
import roochSdk from '@roochnetwork/rooch-sdk';
import type { Secp256k1Keypair as Secp256k1KeypairType } from '@roochnetwork/rooch-sdk';
const { Secp256k1Keypair, decodeRoochSercetKey } = roochSdk;

export interface LocalJWK extends jose.JWK {
  kid?: string;
  use?: string;
  key_ops?: string[];
}

export interface CryptoKeys {
  //JWT signing key
  jwtSigningKey: string;
  // Rooch keypair for custodian
  roochKeypair: Secp256k1KeypairType;
}

export class CryptoService {
  private static instance: CryptoService;
  private keys: CryptoKeys | null = null;

  private constructor() {}

  public static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  /**
   * Initialize all cryptographic keys
   */
  public async initializeKeys(): Promise<void> {
    try {
      // Check if we already have keys
      if (this.keys) {
        logger.info('Crypto keys already initialized');
        return;
      }

      const isDevelopment = config.server.nodeEnv === 'development';
      logger.info('Initializing crypto keys', { environment: config.server.nodeEnv });

      // Initialize JWT signing key
      const jwtSigningKey = isDevelopment 
        ? randomBytes(32).toString('hex')
        : process.env.JWT_SIGNING_KEY;

      if (!jwtSigningKey) {
        throw new Error('JWT signing key is required');
      }


      // Initialize Rooch keypair
      let roochKeypair;
      if (isDevelopment && !process.env.ROOCH_PRIVATE_KEY) {
        // In development, generate a new keypair
        roochKeypair = Secp256k1Keypair.generate();
        logger.info('Generated new Rooch keypair', {
          publicKey: roochKeypair.getPublicKey().toString(),
          privateKey: roochKeypair.getSecretKey()
        });
      } else {
        // In production, load from environment
        const roochPrivateKey = process.env.ROOCH_PRIVATE_KEY;
        if (!roochPrivateKey) {
          throw new Error('Rooch private key is required in production');
        }
        
        const { secretKey, schema } = decodeRoochSercetKey(roochPrivateKey);
        if (schema !== 'Secp256k1') {
          throw new Error('Rooch private key is not a Secp256k1 key');
        }
        roochKeypair = Secp256k1Keypair.fromSecretKey(secretKey);
        logger.info('Loaded Rooch keypair from environment', {
          publicKey: roochKeypair.getPublicKey().toString,
        });
      }

      this.keys = {
        jwtSigningKey,
        roochKeypair
      };

      logger.info('Crypto keys initialized successfully', {
        environment: config.server.nodeEnv,
        hasJwtKey: !!jwtSigningKey,
        hasRoochKeypair: !!roochKeypair
      });
    } catch (error) {
      logger.error('Failed to initialize crypto keys', { error });
      throw error;
    }
  }

  /**
   * Get WebAuthn signing key
   */
  public getJwtSigningKey(): string {
    if (!this.keys?.jwtSigningKey) {
      throw new Error('JWT signing key not initialized');
    }
    return this.keys.jwtSigningKey;
  }

  /**
   * Get Rooch keypair
   */
  public getRoochKeypair(): Secp256k1KeypairType {
    if (!this.keys?.roochKeypair) {
      throw new Error('Rooch keypair not initialized');
    }
    return this.keys.roochKeypair;
  }

  /**
   * Generate secure random string
   */
  public generateSecureRandom(length: number = 32): string {
    return randomBytes(length).toString('base64url');
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
}

export const cryptoService = CryptoService.getInstance(); 