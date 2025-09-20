import type {
  SignerInterface,
  KeyType,
  DIDDocument,
  VerificationMethod,
} from '@nuwa-ai/identity-kit';
import { MultibaseCodec } from '@nuwa-ai/identity-kit';
import { isUserController } from '../../utils/didCompatibility';
import type { Wallet } from '@roochnetwork/rooch-sdk-kit';
import {
  Signer,
  Transaction,
  Authenticator,
  PublicKey,
  Address,
  BitcoinAddress,
  RoochAddress,
  SignatureScheme,
  Bytes,
  bcs,
  toHEX,
  bytes,
} from '@roochnetwork/rooch-sdk';

/**
 * Built-in auth validators (copied from WebAuthnSigner for consistency)
 */
export enum BuiltinAuthValidator {
  SESSION = 0x00,
  BITCOIN = 0x01,
  BITCOIN_MULTISIG = 0x02,
  WEBAUTHN = 0x03,
}

/**
 * Bitcoin Authenticator for Agent DID transactions
 */
export class BitcoinAuthenticator {
  readonly authValidatorId: number;
  readonly payload: Bytes;

  private constructor(authValidatorId: number, payload: Bytes) {
    this.authValidatorId = authValidatorId;
    this.payload = payload;
  }

  encode(): Bytes {
    return bcs.Authenticator.serialize({
      authValidatorId: this.authValidatorId,
      payload: this.payload,
    }).toBytes();
  }

  static async bitcoin(signature: Uint8Array): Promise<BitcoinAuthenticator> {
    const authenticator = new BitcoinAuthenticator(BuiltinAuthValidator.BITCOIN, signature);
    return authenticator;
  }
}

/**
 * Rooch Wallet Signer
 *
 * Implements SignerInterface for Rooch wallet integration
 */
/**
 * Options for creating a RoochWalletSigner for Agent DID operations
 */
interface WalletSignerOptions {
  didDocument?: DIDDocument;
}

export class RoochWalletSigner extends Signer implements SignerInterface {
  private userDid: string;
  private walletAddress: string;
  private wallet: Wallet | null = null;
  private didDocument?: DIDDocument;
  private walletAuthMethod?: VerificationMethod;
  private didAddress?: RoochAddress;

  constructor(userDid: string, walletAddress: string, options?: WalletSignerOptions) {
    super();
    this.userDid = userDid;
    this.walletAddress = walletAddress;

    // If DID document is provided, this signer can handle Agent DID operations
    if (options?.didDocument) {
      this.didDocument = options.didDocument;
      this.walletAuthMethod = this.findWalletAuthMethod() || undefined;

      // Extract Rooch address from Agent DID
      const didParts = options.didDocument.id.split(':');
      this.didAddress = new RoochAddress(didParts[2]);
    }
  }

  /**
   * Find wallet authentication method in Agent DID document
   * Similar to WebAuthnSigner.findPasskeyAuthMethod but for wallet users
   */
  private findWalletAuthMethod(): VerificationMethod | null {
    if (!this.didDocument?.controller || !this.didDocument?.verificationMethod) {
      return null;
    }

    const controller = this.didDocument.controller[0];

    // Check if controller is a wallet DID (did:bitcoin: or did:rooch:)
    if (!controller.startsWith('did:bitcoin:') && !controller.startsWith('did:rooch:')) {
      return null;
    }

    // Find verification method that matches this wallet
    const verificationMethods = this.didDocument.verificationMethod || [];
    for (const authMethod of verificationMethods) {
      if (authMethod.publicKeyMultibase && isUserController(controller, authMethod.controller)) {
        try {
          // For wallet users, we need to verify the public key matches our wallet
          // This will be validated when wallet is connected via setWallet()
          return authMethod;
        } catch (error) {
          console.warn(`Failed to parse wallet authentication method: ${authMethod.id}`, error);
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Set wallet instance (called after wallet connection)
   */
  setWallet(wallet: Wallet): void {
    this.wallet = wallet;

    // Validate address consistency
    this.validateAddressConsistency();
  }

  /**
   * Validate that the wallet address matches the expected address
   */
  private validateAddressConsistency(): void {
    if (!this.wallet) return;

    try {
      const walletBitcoinAddress = this.wallet.getBitcoinAddress();
      const expectedAddress = this.walletAddress;

      // Compare addresses (handle different formats if needed)
      if (walletBitcoinAddress.toStr() !== expectedAddress) {
        console.warn(
          '[RoochWalletSigner] Address mismatch:',
          'expected:',
          expectedAddress,
          'wallet:',
          walletBitcoinAddress.toStr()
        );
        // For now, just warn. In production, you might want to throw an error
      } else {
        console.log('[RoochWalletSigner] Address validation passed:', expectedAddress);
      }
    } catch (error) {
      console.warn('[RoochWalletSigner] Failed to validate address consistency:', error);
    }
  }

  /**
   * Get current wallet instance
   */
  getWallet(): Wallet | null {
    return this.wallet;
  }

  // IdentityKit SignerInterface methods
  async listKeyIds(): Promise<string[]> {
    // If we have a wallet auth method (Agent DID mode), return its key ID
    if (this.walletAuthMethod) {
      return [this.walletAuthMethod.id];
    }
    // Otherwise, return the user DID (User DID mode)
    return [this.userDid];
  }

  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    // Support both User DID and Agent DID key IDs
    if (this.walletAuthMethod && keyId === this.walletAuthMethod.id) {
      // Agent DID signing
      return this.sign(data);
    } else if (keyId === this.userDid) {
      // User DID signing
      return this.sign(data);
    } else {
      throw new Error(`[RoochWalletSigner] Unknown key ID: ${keyId}`);
    }
  }

  async canSignWithKeyId(keyId: string): Promise<boolean> {
    const supportedKeyIds = await this.listKeyIds();
    return supportedKeyIds.includes(keyId) && this.isConnected();
  }

  async getDid(): Promise<string> {
    return this.userDid;
  }

  async getKeyInfo(keyId: string): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined> {
    if (!this.isConnected()) {
      return undefined;
    }

    // Support both User DID and Agent DID key IDs
    const supportedKeyIds = await this.listKeyIds();
    if (!supportedKeyIds.includes(keyId)) {
      return undefined;
    }

    try {
      let publicKey: Uint8Array;

      // If this is an Agent DID key and we have the auth method, use its public key
      if (
        this.walletAuthMethod &&
        keyId === this.walletAuthMethod.id &&
        this.walletAuthMethod.publicKeyMultibase
      ) {
        publicKey = MultibaseCodec.decodeBase58btc(this.walletAuthMethod.publicKeyMultibase);
      } else {
        // Otherwise, get public key from wallet
        publicKey = await this.getPublicKeyBytes();
      }

      return {
        type: 'EcdsaSecp256k1VerificationKey2019' as KeyType,
        publicKey,
      };
    } catch (error) {
      console.error('[RoochWalletSigner] Failed to get key info:', error);
      return undefined;
    }
  }

  // Helper methods for wallet functionality
  private async getPublicKeyBytes(): Promise<Uint8Array> {
    if (!this.wallet) {
      throw new Error('[RoochWalletSigner] Wallet not connected');
    }

    try {
      // Get public key from wallet - this returns PublicKey<Address>
      const publicKey = this.wallet.getPublicKey();

      // Convert to Uint8Array - need to extract the raw bytes
      return publicKey.toBytes();
    } catch (error) {
      console.error('[RoochWalletSigner] Failed to get public key bytes:', error);
      throw new Error('[RoochWalletSigner] Failed to get public key from wallet');
    }
  }

  // Rooch Signer methods (abstract implementations)
  async sign(data: Uint8Array): Promise<Uint8Array> {
    if (!this.wallet) {
      throw new Error('[RoochWalletSigner] Wallet not connected');
    }

    try {
      // Use wallet's sign method - it should handle the signing process
      return await this.wallet.sign(data);
    } catch (error) {
      console.error('[RoochWalletSigner] Failed to sign data:', error);
      throw new Error('[RoochWalletSigner] Failed to sign data with wallet');
    }
  }

  getPublicKey(): PublicKey<Address> {
    if (!this.wallet) {
      throw new Error('[RoochWalletSigner] Wallet not connected');
    }

    // Delegate to wallet's getPublicKey method
    return this.wallet.getPublicKey();
  }

  async signTransaction(tx: Transaction): Promise<Authenticator> {
    if (!this.wallet) {
      throw new Error('[RoochWalletSigner] Wallet not connected');
    }

    try {
      // If we're in Agent DID mode, use Bitcoin authenticator
      if (this.didAddress) {
        tx.setSender(this.didAddress);
        console.log('[RoochWalletSigner] Set transaction sender to Agent DID address:', this.didAddress.toStr());

        // Get transaction hash for signing
        const txHash = tx.hashData();
        const txHashHex = toHEX(txHash);
        const txHashHexBytes = bytes('utf8', txHashHex);
        // Create Session authenticator for Agent DID
        const sessionAuth = await Authenticator.session(txHashHexBytes, this.wallet);
       
        // Set authenticator to transaction
        tx.setAuth(sessionAuth);
        
        console.log('[RoochWalletSigner] Agent DID transaction signed with Bitcoin authenticator');
        return sessionAuth;
      } else {
        // User DID mode - delegate to wallet's default signTransaction method
        const authenticator = await this.wallet.signTransaction(tx);
        console.log('[RoochWalletSigner] User DID transaction signed successfully');
        return authenticator;
      }
    } catch (error) {
      console.error('[RoochWalletSigner] Failed to sign transaction:', error);
      throw new Error('[RoochWalletSigner] Failed to sign transaction with wallet');
    }
  }

  getKeyScheme(): SignatureScheme {
    // Bitcoin wallets use secp256k1
    return 'Secp256k1';
  }

  getRoochPublicKey(): PublicKey<Address> {
    // Same as getPublicKey for wallet signers
    return this.getPublicKey();
  }

  getBitcoinAddress(): BitcoinAddress {
    if (!this.wallet) {
      throw new Error('[RoochWalletSigner] Wallet not connected');
    }

    // Delegate to wallet's getBitcoinAddress method
    return this.wallet.getBitcoinAddress();
  }

  getRoochAddress(): RoochAddress {
    // If we're in Agent DID mode, return the Agent's address
    if (this.didAddress) {
      return this.didAddress;
    }

    // Otherwise, return the wallet's Rooch address (User DID mode)
    if (!this.wallet) {
      throw new Error('[RoochWalletSigner] Wallet not connected');
    }

    // Delegate to wallet's getRoochAddress method
    return this.wallet.getRoochAddress();
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): string {
    return this.walletAddress;
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.wallet !== null;
  }

  /**
   * Check if signer is available (alias for isConnected for compatibility)
   */
  async isAvailable(): Promise<boolean> {
    return this.isConnected();
  }
}
