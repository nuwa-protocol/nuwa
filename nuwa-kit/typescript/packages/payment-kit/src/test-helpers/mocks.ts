/**
 * Test helper module with mock implementations for payment channel testing
 * 
 * This module provides reusable mock implementations that can be used across
 * different test suites to ensure consistent testing behavior.
 */

import type { 
  IPaymentChannelContract, 
  OpenChannelResult,
  AuthorizeSubChannelParams,
  ClaimParams,
  ClaimResult,
  TxResult,
  DepositToHubParams,
} from '../contracts/IPaymentChannelContract';
import type { ChannelInfo, AssetInfo } from '../core/types';
import type { DIDResolver, DIDDocument } from '@nuwa-ai/identity-kit';
import { KeyStoreSigner, KeyManager, MultibaseCodec } from '@nuwa-ai/identity-kit';
import { MemoryKeyStore } from '@nuwa-ai/identity-kit';
import { KeyType } from '@nuwa-ai/identity-kit';

/**
 * Mock Payment Channel Contract implementation
 * Simulates basic blockchain contract functionality for testing
 */
export class MockContract implements IPaymentChannelContract {
  private channels = new Map<string, ChannelInfo>();
  private channelCounter = 0;

  /**
   * Reset the contract state (useful for test isolation)
   */
  reset(): void {
    this.channels.clear();
    this.channelCounter = 0;
  }

  async openChannel(params: any): Promise<OpenChannelResult> {
    const channelId = `channel-${++this.channelCounter}`;
    const channelInfo: ChannelInfo = {
      channelId,
      payerDid: params.payerDid,
      payeeDid: params.payeeDid,
      asset: params.asset,
      epoch: BigInt(0),
      status: 'active',
    };
    this.channels.set(channelId, channelInfo);
    
    return {
      channelId,
      txHash: `tx-${channelId}-${Date.now()}`,
      blockHeight: BigInt(1000 + this.channelCounter),
    };
  }

  async openChannelWithSubChannel(params: any): Promise<OpenChannelResult> {
    return this.openChannel(params);
  }

  async authorizeSubChannel(params: AuthorizeSubChannelParams): Promise<TxResult> {
    return {
      txHash: `auth-tx-${params.channelId}-${Date.now()}`,
      blockHeight: BigInt(1500),
    };
  }

  async claimFromChannel(params: ClaimParams): Promise<ClaimResult> {
    return {
      txHash: `claim-tx-${Date.now()}`,
      claimedAmount: params.signedSubRAV.subRav.accumulatedAmount,
      blockHeight: BigInt(2000),
    };
  }

  async closeChannel(params: any): Promise<TxResult> {
    const channel = this.channels.get(params.channelId);
    if (channel) {
      channel.status = 'closed';
    }
    return {
      txHash: `close-tx-${params.channelId}-${Date.now()}`,
      blockHeight: BigInt(3000),
    };
  }

  async depositToHub(params: DepositToHubParams): Promise<TxResult> {
    return {
      txHash: `deposit-tx-${Date.now()}`,
      blockHeight: BigInt(500),
    };
  }

  async getChannelStatus(params: { channelId: string }): Promise<ChannelInfo> {
    const channel = this.channels.get(params.channelId);
    if (!channel) {
      throw new Error(`Channel ${params.channelId} not found`);
    }
    return { ...channel };
  }

  async getSubChannel(params: any): Promise<any> {
    return {
      vmIdFragment: params.vmIdFragment,
      publicKey: 'mock-public-key',
      methodType: 'EcdsaSecp256k1VerificationKey2019',
      lastClaimedAmount: BigInt(0),
      lastConfirmedNonce: BigInt(0),
    };
  }

  async getChainId(): Promise<bigint> {
    return BigInt(4); // Mock Rooch testnet
  }

  async getAssetInfo(assetId: string): Promise<AssetInfo> {
    return {
      assetId,
      symbol: 'RGas',
    };
  }

  async getAssetPrice(assetId: string): Promise<bigint> {
    return BigInt(1000000); // 1 USD in pUSD (6 decimals)
  }
}

/**
 * Mock DID Resolver that works with KeyStoreSigner
 * Generates DID documents with proper verification methods that match the signer's keys
 */
export class MockDIDResolver implements DIDResolver {
  private signerMap = new Map<string, KeyStoreSigner>();

  /**
   * Register a KeyStoreSigner for DID resolution
   * This ensures the DID document contains the correct public keys
   */
  registerSigner(did: string, signer: KeyStoreSigner): void {
    this.signerMap.set(did, signer);
  }

  async resolve(did: string): Promise<any> {
    const signer = this.signerMap.get(did);
    if (!signer) {
      // Fallback to basic mock document
      return {
        id: did,
        verificationMethod: [
          {
            id: `${did}#account-key`,
            type: 'EcdsaSecp256k1VerificationKey2019',
            controller: did,
            publicKeyMultibase: 'zMockPublicKey123',
          },
        ],
      };
    }

    // Generate real verification methods from the signer's keys
    const keyIds = await signer.listKeyIds();
    const verificationMethod = [];
    
    for (const keyId of keyIds) {
      const keyInfo = await signer.getKeyInfo(keyId);
      if (keyInfo) {
        // Convert public key to multibase format (simplified for testing)
        const publicKeyMultibase = this.uint8ArrayToMultibase(keyInfo.publicKey);
        
        verificationMethod.push({
          id: keyId,
          type: this.keyTypeToVerificationMethodType(keyInfo.type),
          controller: did,
          publicKeyMultibase,
        });
      }
    }

    return {
      id: did,
      verificationMethod,
    };
  }

  async resolveDID(did: string, options?: { forceRefresh?: boolean }): Promise<DIDDocument | null> {
    const basicDoc = await this.resolve(did);
    return {
      '@context': 'https://www.w3.org/ns/did/v1',
      ...basicDoc,
    };
  }

  /**
   * Convert KeyType to verification method type string
   */
  private keyTypeToVerificationMethodType(keyType: KeyType): string {
    switch (keyType) {
      case KeyType.ED25519:
        return 'Ed25519VerificationKey2020';
      case KeyType.SECP256K1:
        return 'EcdsaSecp256k1VerificationKey2019';
      default:
        return 'EcdsaSecp256k1VerificationKey2019';
    }
  }

  /**
   * Convert Uint8Array to multibase format using real encoding
   */
  private uint8ArrayToMultibase(publicKey: Uint8Array): string {
    // Use the real MultibaseCodec for proper encoding
    return MultibaseCodec.encodeBase58btc(publicKey);
  }
}

/**
 * Test factory for creating KeyStoreSigner instances
 */
export class TestSignerFactory {
  private didResolver: MockDIDResolver;

  constructor(didResolver?: MockDIDResolver) {
    this.didResolver = didResolver || new MockDIDResolver();
  }

  /**
   * Create a new KeyStoreSigner with a memory key store
   * @param did The DID to associate with the signer
   * @param keyFragment Optional key fragment (defaults to 'account-key')
   * @returns Configured KeyStoreSigner and the key ID
   */
  async createSigner(did: string, keyFragment: string = 'account-key'): Promise<{
    signer: KeyStoreSigner;
    keyId: string;
    didResolver: MockDIDResolver;
  }> {
    const keyStore = new MemoryKeyStore();
    const signer = new KeyStoreSigner(keyStore, did);
    
    // Use KeyManager to generate keys
    const keyManager = new KeyManager({
      store: keyStore,
      did,
      defaultKeyType: KeyType.ED25519,
    });
    
    // Generate a key for the signer
    const storedKey = await keyManager.generateKey(keyFragment, KeyType.ED25519);
    const keyId = storedKey.keyId;

    // Register signer with DID resolver for proper resolution
    this.didResolver.registerSigner(did, signer);

    return {
      signer,
      keyId,
      didResolver: this.didResolver,
    };
  }

  /**
   * Create multiple signers that share the same DID resolver
   */
  async createSignerPair(
    payerDid: string = 'did:test:payer',
    payeeDid: string = 'did:test:payee',
    keyFragment: string = 'account-key'
  ): Promise<{
    payerSigner: KeyStoreSigner;
    payeeSigner: KeyStoreSigner;
    payerKeyId: string;
    payeeKeyId: string;
    didResolver: MockDIDResolver;
  }> {
    const payerResult = await this.createSigner(payerDid, keyFragment);
    const payeeResult = await this.createSigner(payeeDid, keyFragment);

    return {
      payerSigner: payerResult.signer,
      payeeSigner: payeeResult.signer,
      payerKeyId: payerResult.keyId,
      payeeKeyId: payeeResult.keyId,
      didResolver: this.didResolver,
    };
  }
}

/**
 * Test asset configuration
 */
export const TEST_ASSET: AssetInfo = {
  assetId: '0x3::gas_coin::RGas',
  symbol: 'RGas',
};

/**
 * Utility function to create a unique test ID
 */
export function createTestId(): string {
  return Math.random().toString(36).substring(7);
}

/**
 * Create a complete test environment with all necessary mocks
 */
export async function createTestEnvironment(testId?: string): Promise<{
  testId: string;
  contract: MockContract;
  payerSigner: KeyStoreSigner;
  payeeSigner: KeyStoreSigner;
  payerKeyId: string;
  payeeKeyId: string;
  payerDid: string;
  payeeDid: string;
  didResolver: MockDIDResolver;
  asset: AssetInfo;
}> {
  const id = testId || createTestId();
  const payerDid = `did:test:payer-${id}`;
  const payeeDid = `did:test:payee-${id}`;
  
  const contract = new MockContract();
  const signerFactory = new TestSignerFactory();
  
  const signerPair = await signerFactory.createSignerPair(payerDid, payeeDid);

  return {
    testId: id,
    contract,
    payerSigner: signerPair.payerSigner,
    payeeSigner: signerPair.payeeSigner,
    payerKeyId: signerPair.payerKeyId,
    payeeKeyId: signerPair.payeeKeyId,
    payerDid,
    payeeDid,
    didResolver: signerPair.didResolver,
    asset: TEST_ASSET,
  };
} 