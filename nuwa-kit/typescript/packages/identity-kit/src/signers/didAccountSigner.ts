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
      throw new Error('Signer DID must be a did:rooch DID');
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
  static async create(signer: SignerInterface, keyId?: string): Promise<DidAccountSigner> {
    // If already a DidAccountSigner, return as is
    if (signer instanceof DidAccountSigner) {
      return signer;
    }

    // Get keyId if not provided
    const actualKeyId = keyId || (await signer.listKeyIds())[0];
    if (!actualKeyId) {
      throw new Error('No available keys in signer');
    }

    // Get key info
    const keyInfo = await signer.getKeyInfo(actualKeyId);
    if (!keyInfo) {
      throw new Error(`Key info not found for keyId: ${actualKeyId}`);
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

  async signTransaction(input: Transaction): Promise<Authenticator> {
    return Authenticator.rooch(input.hashData(), this);
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
      throw new Error('ECDSAR1 is not supported for DID account');
    } else {
      throw new Error(`Unsupported key type: ${this.keyType}`);
    }
  }

  getBitcoinAddress(): BitcoinAddress {
    throw new Error('Bitcoin address is not supported for DID account');
  }

  // Implement SignerInterface
  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    if (keyId !== this.keyId) {
      throw new Error(`Key ID mismatch. Expected ${this.keyId}, got ${keyId}`);
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
} 