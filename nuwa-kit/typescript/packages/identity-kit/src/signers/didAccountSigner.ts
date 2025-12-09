import {
  RoochAddress,
  SignatureScheme,
  Signer,
  Transaction,
  Address,
  Bytes,
  Authenticator,
  BitcoinAddress,
  PublicKey,
  Ed25519PublicKey,
  Secp256k1PublicKey,
} from '@roochnetwork/rooch-sdk';
import { SignerInterface } from './types';
import { KeyType, keyTypeToRoochSignatureScheme } from '../types/crypto';
import { parseDid } from '../utils/did';
import { EcdsaR1PublicKey } from '../crypto/EcdsaR1PublicKey';
import { IdentityKitErrorCode, createSignerError, createValidationError } from '../errors';

/**
 * A Rooch Signer implementation that wraps a SignerInterface.
 * This class implements the Rooch Signer interface while delegating
 * actual signing operations to the wrapped SignerInterface.
 */
export class DidAccountSigner extends Signer implements SignerInterface {
  private did: string;
  private keyId: string;
  private didAddress: RoochAddress;
  private keyType: KeyType;
  private publicKey: Uint8Array;

  private constructor(
    private wrappedSigner: SignerInterface,
    did: string,
    keyId: string,
    keyType: KeyType,
    publicKey: Uint8Array
  ) {
    super();
    this.keyId = keyId;
    this.did = did;
    if (!this.did.startsWith('did:rooch:')) {
      throw createSignerError(
        IdentityKitErrorCode.SIGNER_INVALID_DID,
        'Signer DID must be a did:rooch DID',
        { did: this.did, expectedMethod: 'rooch' }
      );
    }
    const didParts = parseDid(did);
    this.didAddress = new RoochAddress(didParts.identifier);
    this.keyType = keyType;
    this.publicKey = publicKey;
  }

  /**
   * Create a DidAccountSigner instance from a SignerInterface
   * @param signer The signer to wrap
   * @param keyId Optional specific keyId to use
   * @returns A new DidAccountSigner instance
   */
  /**
   * Check if an object is a DidAccountSigner instance
   * Safe to use instanceof within the same module
   */
  static isDidAccountSigner(obj: any): obj is DidAccountSigner {
    return obj instanceof DidAccountSigner;
  }

  static async create(signer: SignerInterface, keyId?: string): Promise<DidAccountSigner> {
    // If already a DidAccountSigner, return as is
    if (DidAccountSigner.isDidAccountSigner(signer)) {
      return signer;
    }

    // Get keyId if not provided
    const actualKeyId = keyId || (await signer.listKeyIds())[0];
    if (!actualKeyId) {
      throw createSignerError(IdentityKitErrorCode.SIGNER_NO_KEYS, 'No available keys in signer', {
        signer,
      });
    }

    // Get key info
    const keyInfo = await signer.getKeyInfo(actualKeyId);
    if (!keyInfo) {
      throw createSignerError(
        IdentityKitErrorCode.KEY_NOT_FOUND,
        `Key info not found for keyId: ${actualKeyId}`,
        { keyId: actualKeyId, signer }
      );
    }

    const did = await signer.getDid();

    return new DidAccountSigner(signer, did, actualKeyId, keyInfo.type, keyInfo.publicKey);
  }

  // Implement Rooch Signer interface
  getRoochAddress(): RoochAddress {
    return this.didAddress;
  }

  async sign(input: Bytes): Promise<Bytes> {
    return this.wrappedSigner.signWithKeyId(input, this.keyId);
  }

  // Expose WebAuthn signing when the underlying signer supports it
  async signAssertion(challenge: Bytes): Promise<AuthenticatorAssertionResponse> {
    const maybeWebAuthn = this.wrappedSigner as any;
    if (maybeWebAuthn && typeof maybeWebAuthn.signAssertion === 'function') {
      return maybeWebAuthn.signAssertion(challenge);
    }
    throw createSignerError(
      IdentityKitErrorCode.OPERATION_NOT_SUPPORTED,
      'Underlying signer does not support WebAuthn assertions',
      { did: this.did, keyId: this.keyId }
    );
  }

  async signTransaction(input: Transaction): Promise<Authenticator> {
    const txHash = input.hashData();
    const vmFragment = this.getVmFragment();
    return Authenticator.did(txHash, this, vmFragment);
  }

  getKeyScheme(): SignatureScheme {
    return keyTypeToRoochSignatureScheme(this.keyType);
  }

  getPublicKey(): PublicKey<Address> {
    if (this.keyType === KeyType.SECP256K1) {
      return new Secp256k1PublicKey(this.publicKey);
    } else if (this.keyType === KeyType.ED25519) {
      return new Ed25519PublicKey(this.publicKey);
    } else if (this.keyType === KeyType.ECDSAR1) {
      return new EcdsaR1PublicKey(this.publicKey);
    } else {
      throw createSignerError(
        IdentityKitErrorCode.KEY_TYPE_NOT_SUPPORTED,
        `Unsupported key type: ${this.keyType}`,
        { keyType: this.keyType, supportedTypes: ['Ed25519', 'Secp256k1', 'EcdsaR1'] }
      );
    }
  }

  getBitcoinAddress(): BitcoinAddress {
    throw createSignerError(
      IdentityKitErrorCode.OPERATION_NOT_SUPPORTED,
      'Bitcoin address is not supported for DID account',
      { operation: 'getBitcoinAddress' }
    );
  }

  // Implement SignerInterface
  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    if (keyId !== this.keyId) {
      throw createValidationError(
        IdentityKitErrorCode.KEY_ID_MISMATCH,
        `Key ID mismatch. Expected ${this.keyId}, got ${keyId}`,
        { expectedKeyId: this.keyId, actualKeyId: keyId }
      );
    }
    return this.sign(data);
  }

  async canSignWithKeyId(keyId: string): Promise<boolean> {
    return keyId === this.keyId;
  }

  async listKeyIds(): Promise<string[]> {
    return [this.keyId];
  }

  async getDid(): Promise<string> {
    return this.did;
  }

  async getKeyInfo(keyId: string): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined> {
    if (keyId !== this.keyId) {
      return undefined;
    }
    return {
      type: this.keyType,
      publicKey: this.publicKey,
    };
  }

  private getVmFragment(): string {
    const parts = this.keyId.split('#');
    if (parts.length !== 2) {
      throw createValidationError(
        IdentityKitErrorCode.INVALID_INPUT_FORMAT,
        `Invalid keyId format: ${this.keyId}. Expected format: "did:rooch:0x123#fragment"`,
        { keyId: this.keyId, expectedFormat: 'did:rooch:0x123#fragment' }
      );
    }
    return parts[1];
  }
}

/**
 * Exported function for checking DidAccountSigner instances
 * Uses safe instanceof checking within the same module
 */
export function isDidAccountSigner(obj: any): obj is DidAccountSigner {
  return DidAccountSigner.isDidAccountSigner(obj);
}
