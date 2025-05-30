import * as jose from 'jose';
import { createHash, randomBytes } from 'crypto';
import { config } from '../config/environment';
import { JWK, JWKS, IDToken } from '../types/oidc';

export class CryptoService {
  private static instance: CryptoService;
  private signingKey: jose.KeyLike | null = null;
  private publicJWK: JWK | null = null;
  private privateJWK: JWK | null = null;
  private keyId: string | null = null;

  private constructor() {}

  public static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  /**
   * 初始化密钥对
   */
  public async initializeKeys(): Promise<void> {
    try {
      // 检查是否已有密钥
      if (this.signingKey) {
        return;
      }

      if (config.jwt.privateKey) {
        // 从配置文件加载现有密钥
        await this.loadKeysFromConfig();
      } else {
        // 生成新的密钥对
        await this.generateNewKeyPair();
      }

      console.log('JWT signing keys initialized successfully');
    } catch (error) {
      console.error('Failed to initialize JWT keys:', error);
      throw error;
    }
  }

  /**
   * 从配置加载密钥
   */
  private async loadKeysFromConfig(): Promise<void> {
    try {
      const privateKeyPem = config.jwt.privateKey;
      if (!privateKeyPem) {
        throw new Error('Private key not found in configuration');
      }

      // 导入私钥
      this.signingKey = await jose.importPKCS8(privateKeyPem, 'EdDSA');

      // 生成公钥 JWK
      const publicKey = await jose.exportSPKI(this.signingKey);
      const publicKeyObject = await jose.importSPKI(publicKey, 'EdDSA');
      this.publicJWK = await jose.exportJWK(publicKeyObject);
      this.privateJWK = await jose.exportJWK(this.signingKey);

      // 生成密钥ID
      this.keyId = this.generateKeyId(this.publicJWK);
      this.publicJWK.kid = this.keyId;
      this.privateJWK.kid = this.keyId;

      // 设置密钥用途
      this.publicJWK.use = 'sig';
      this.publicJWK.alg = 'EdDSA';
      this.publicJWK.key_ops = ['verify'];

      this.privateJWK.use = 'sig';
      this.privateJWK.alg = 'EdDSA';
      this.privateJWK.key_ops = ['sign'];

    } catch (error) {
      console.error('Failed to load keys from config:', error);
      throw error;
    }
  }

  /**
   * 生成新的 Ed25519 密钥对
   */
  private async generateNewKeyPair(): Promise<void> {
    try {
      // 生成 Ed25519 密钥对
      const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA', {
        crv: 'Ed25519'
      });

      this.signingKey = privateKey;

      // 导出 JWK 格式
      this.publicJWK = await jose.exportJWK(publicKey);
      this.privateJWK = await jose.exportJWK(privateKey);

      // 生成密钥ID
      this.keyId = this.generateKeyId(this.publicJWK);
      this.publicJWK.kid = this.keyId;
      this.privateJWK.kid = this.keyId;

      // 设置密钥用途
      this.publicJWK.use = 'sig';
      this.publicJWK.alg = 'EdDSA';
      this.publicJWK.key_ops = ['verify'];

      this.privateJWK.use = 'sig';
      this.privateJWK.alg = 'EdDSA';
      this.privateJWK.key_ops = ['sign'];

      console.log('New Ed25519 key pair generated');
      console.log('Public JWK:', JSON.stringify(this.publicJWK, null, 2));
      
      // 导出私钥用于保存
      const exportedPrivateKey = await jose.exportPKCS8(privateKey);
      console.warn('⚠️  Store this private key in your JWT_PRIVATE_KEY environment variable:');
      console.warn(exportedPrivateKey);

    } catch (error) {
      console.error('Failed to generate key pair:', error);
      throw error;
    }
  }

  /**
   * 生成密钥ID (基于公钥的 thumbprint)
   */
  private generateKeyId(jwk: JWK): string {
    const jwkCopy = { ...jwk };
    // 移除非核心字段
    delete jwkCopy.kid;
    delete jwkCopy.use;
    delete jwkCopy.key_ops;
    delete jwkCopy.alg;

    // 创建 thumbprint
    const thumbprint = createHash('sha256')
      .update(JSON.stringify(jwkCopy))
      .digest('base64url');

    return thumbprint.substring(0, 8);
  }

  /**
   * 获取 JWKS (公钥集)
   */
  public async getJWKS(): Promise<JWKS> {
    await this.initializeKeys();
    
    if (!this.publicJWK) {
      throw new Error('Public key not available');
    }

    return {
      keys: [this.publicJWK]
    };
  }

  /**
   * 获取公钥 JWK
   */
  public async getPublicJWK(): Promise<JWK> {
    await this.initializeKeys();
    
    if (!this.publicJWK) {
      throw new Error('Public key not available');
    }

    return this.publicJWK;
  }

  /**
   * 签发 JWT
   */
  public async signJWT(payload: Record<string, any>, options: {
    issuer: string;
    audience: string | string[];
    expiresIn?: string | number;
    subject?: string;
  }): Promise<string> {
    await this.initializeKeys();

    if (!this.signingKey || !this.keyId) {
      throw new Error('Signing key not available');
    }

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ 
        alg: 'EdDSA', 
        kid: this.keyId,
        typ: 'JWT'
      })
      .setIssuer(options.issuer)
      .setAudience(options.audience)
      .setIssuedAt()
      .setExpirationTime(options.expiresIn || '1h');

    if (options.subject) {
      jwt.setSubject(options.subject);
    }

    return await jwt.sign(this.signingKey);
  }

  /**
   * 签发 ID Token
   */
  public async signIDToken(claims: IDToken): Promise<string> {
    await this.initializeKeys();

    if (!this.signingKey || !this.keyId) {
      throw new Error('Signing key not available');
    }

    // 转换 IDToken 为 JWTPayload 格式
    const payload: jose.JWTPayload = {
      ...claims,
      // 确保必要字段存在
      iss: claims.iss,
      sub: claims.sub,
      aud: claims.aud,
      exp: claims.exp,
      iat: claims.iat
    };

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ 
        alg: 'EdDSA', 
        kid: this.keyId,
        typ: 'JWT'
      })
      .setIssuer(claims.iss)
      .setSubject(claims.sub)
      .setAudience(claims.aud)
      .setIssuedAt(claims.iat)
      .setExpirationTime(claims.exp);

    if (claims.auth_time) {
      jwt.setNotBefore(claims.auth_time);
    }

    return await jwt.sign(this.signingKey);
  }

  /**
   * 验证 JWT
   */
  public async verifyJWT(token: string, options: {
    issuer?: string;
    audience?: string | string[];
  } = {}): Promise<jose.JWTPayload> {
    await this.initializeKeys();

    if (!this.signingKey) {
      throw new Error('Verification key not available');
    }

    const verifyOptions: jose.JWTVerifyOptions = {};
    
    if (options.issuer) {
      verifyOptions.issuer = options.issuer;
    }
    
    if (options.audience) {
      verifyOptions.audience = options.audience;
    }

    const { payload } = await jose.jwtVerify(token, this.signingKey, verifyOptions);

    return payload;
  }

  /**
   * 生成安全的随机字符串
   */
  public generateSecureRandom(length: number = 32): string {
    return randomBytes(length).toString('base64url');
  }

  /**
   * 生成授权码
   */
  public generateAuthorizationCode(): string {
    return this.generateSecureRandom(32);
  }

  /**
   * 生成访问令牌
   */
  public generateAccessToken(): string {
    return this.generateSecureRandom(32);
  }

  /**
   * 生成刷新令牌
   */
  public generateRefreshToken(): string {
    return this.generateSecureRandom(32);
  }

  /**
   * 创建安全的哈希
   */
  public createHash(input: string, algorithm: string = 'sha256'): string {
    return createHash(algorithm).update(input).digest('hex');
  }

  /**
   * 验证哈希
   */
  public verifyHash(input: string, hash: string, algorithm: string = 'sha256'): boolean {
    const computed = this.createHash(input, algorithm);
    return computed === hash;
  }

  /**
   * 密钥轮换
   */
  public async rotateKeys(): Promise<void> {
    console.log('Starting key rotation...');
    
    // 保存旧密钥ID用于日志
    const oldKeyId = this.keyId;
    
    // 重置当前密钥
    this.signingKey = null;
    this.publicJWK = null;
    this.privateJWK = null;
    this.keyId = null;
    
    // 生成新密钥对
    await this.generateNewKeyPair();
    
    console.log(`Key rotation completed. Old key ID: ${oldKeyId}, New key ID: ${this.keyId}`);
  }
}

// 导出单例实例
export const cryptoService = CryptoService.getInstance(); 