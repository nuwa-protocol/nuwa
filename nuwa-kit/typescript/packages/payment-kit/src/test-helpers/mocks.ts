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
  DepositParams,
  WithdrawParams,
  TransferToHubParams,
} from '../contracts/IPaymentChannelContract';
import type {
  IPaymentRevenueContract,
  WithdrawRevenueParams,
  WithdrawalPreview,
  RevenueSource,
} from '../contracts/IPaymentRevenueContract';
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
  private hubBalances = new Map<string, bigint>();

  /**
   * Reset the contract state (useful for test isolation)
   */
  reset(): void {
    this.channels.clear();
    this.channelCounter = 0;
    this.hubBalances.clear();
  }

  async openChannel(params: any): Promise<OpenChannelResult> {
    const channelId = `channel-${++this.channelCounter}`;
    const channelInfo: ChannelInfo = {
      channelId,
      payerDid: params.payerDid,
      payeeDid: params.payeeDid,
      assetId: params.asset,
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

  async depositToHub(params: DepositParams): Promise<TxResult> {
    // Store hub balance for testing
    const balanceKey = `${params.ownerDid}:${params.assetId}`;
    const currentBalance = this.hubBalances.get(balanceKey) || BigInt(0);
    this.hubBalances.set(balanceKey, currentBalance + params.amount);

    return {
      txHash: `deposit-tx-${Date.now()}`,
      blockHeight: BigInt(500),
    };
  }

  async withdrawFromHub(params: WithdrawParams): Promise<TxResult> {
    // Update hub balance for testing
    const balanceKey = `${params.ownerDid}:${params.assetId}`;
    const currentBalance = this.hubBalances.get(balanceKey) || BigInt(0);

    const withdrawAmount = params.amount === BigInt(0) ? currentBalance : params.amount;
    if (currentBalance < withdrawAmount) {
      throw new Error(`Insufficient balance: have ${currentBalance}, need ${withdrawAmount}`);
    }

    this.hubBalances.set(balanceKey, currentBalance - withdrawAmount);

    return {
      txHash: `withdraw-tx-${Date.now()}`,
      blockHeight: BigInt(600),
    };
  }

  async getHubBalance(ownerDid: string, assetId: string): Promise<bigint> {
    const balanceKey = `${ownerDid}:${assetId}`;
    return this.hubBalances.get(balanceKey) || BigInt(0);
  }

  async getAllHubBalances(ownerDid: string): Promise<Record<string, bigint>> {
    const balances: Record<string, bigint> = {};

    for (const [key, balance] of this.hubBalances.entries()) {
      if (key.startsWith(`${ownerDid}:`)) {
        const assetId = key.substring(ownerDid.length + 1);
        balances[assetId] = balance;
      }
    }

    return balances;
  }

  async getActiveChannelsCounts(ownerDid: string): Promise<Record<string, number>> {
    // Mock implementation - return some test data
    return {
      '0x3::gas_coin::RGas': 2,
      '0x3::stable_coin::USDC': 1,
    };
  }

  async getActiveChannelCount(ownerDid: string, assetId: string): Promise<number> {
    const counts = await this.getActiveChannelsCounts(ownerDid);
    return counts[assetId] ?? 0;
  }

  async getChannelStatus(params: { channelId: string }): Promise<ChannelInfo> {
    const channel = this.channels.get(params.channelId);
    if (!channel) {
      throw new Error(`Channel ${params.channelId} not found`);
    }
    return { ...channel };
  }

  async getSubChannel(params: any): Promise<any> {
    const ch = this.channels.get(params.channelId);
    const epoch = ch?.epoch ?? BigInt(0);
    return {
      channelId: params.channelId,
      epoch,
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
      decimals: 8,
    };
  }

  async getAssetPrice(assetId: string): Promise<bigint> {
    return BigInt(1000000); // 1 USD in pUSD (6 decimals)
  }

  async transferToHub(params: TransferToHubParams): Promise<TxResult> {
    // For mock implementation, just move balance from sender to receiver hub
    const senderBalanceKey = `${params.senderDid}:${params.assetId}`;
    const receiverBalanceKey = `${params.receiverDid}:${params.assetId}`;

    const senderBalance = this.hubBalances.get(senderBalanceKey) || BigInt(0);

    if (senderBalance < params.amount) {
      throw new Error(`Insufficient hub balance: have ${senderBalance}, need ${params.amount}`);
    }

    // Transfer the balance
    this.hubBalances.set(senderBalanceKey, senderBalance - params.amount);
    const receiverBalance = this.hubBalances.get(receiverBalanceKey) || BigInt(0);
    this.hubBalances.set(receiverBalanceKey, receiverBalance + params.amount);

    return {
      txHash: `transfer-hub-tx-${Date.now()}`,
      blockHeight: BigInt(700),
    };
  }

  async getUnlockedBalance(ownerDid: string, assetId: string): Promise<bigint> {
    // For mock implementation, return 80% of hub balance as unlocked
    const totalBalance = await this.getHubBalance(ownerDid, assetId);
    return (totalBalance * 8n) / 10n; // 80% unlocked
  }
}

/**
 * Mock Payment Revenue Contract implementation
 * Simulates revenue management functionality for testing
 */
export class MockRevenueContract implements IPaymentRevenueContract {
  private revenueHubs = new Map<string, boolean>(); // DID -> exists
  private revenueBalances = new Map<string, bigint>(); // DID:assetId -> balance
  private revenueBySource = new Map<string, bigint>(); // DID:sourceType:assetId -> amount
  private txCounter = 0;

  /**
   * Reset the contract state (useful for test isolation)
   */
  reset(): void {
    this.revenueHubs.clear();
    this.revenueBalances.clear();
    this.revenueBySource.clear();
    this.txCounter = 0;
  }

  async createRevenueHub(ownerDid: string, signer: any): Promise<TxResult> {
    this.revenueHubs.set(ownerDid, true);
    return {
      txHash: `revenue-hub-tx-${++this.txCounter}-${Date.now()}`,
      blockHeight: BigInt(1000 + this.txCounter),
    };
  }

  async revenueHubExists(ownerDid: string): Promise<boolean> {
    return this.revenueHubs.get(ownerDid) || false;
  }

  async withdrawRevenue(params: WithdrawRevenueParams): Promise<TxResult> {
    const balanceKey = `${params.ownerDid}:${params.assetId}`;
    const currentBalance = this.revenueBalances.get(balanceKey) || BigInt(0);

    if (currentBalance < params.amount) {
      throw new Error('Insufficient revenue balance');
    }

    // Deduct the withdrawn amount
    this.revenueBalances.set(balanceKey, currentBalance - params.amount);

    return {
      txHash: `withdraw-revenue-tx-${++this.txCounter}-${Date.now()}`,
      blockHeight: BigInt(2000 + this.txCounter),
    };
  }

  async previewWithdrawalFee(
    ownerDid: string,
    assetId: string,
    amount: bigint
  ): Promise<WithdrawalPreview> {
    // Mock implementation with no fees (like the real contract currently)
    return {
      grossAmount: amount,
      feeAmount: BigInt(0),
      netAmount: amount,
      feeRateBps: 0,
    };
  }

  async getRevenueBalance(ownerDid: string, assetId: string): Promise<bigint> {
    const balanceKey = `${ownerDid}:${assetId}`;
    return this.revenueBalances.get(balanceKey) || BigInt(0);
  }

  async getRevenueBySource(ownerDid: string, sourceType: string, assetId: string): Promise<bigint> {
    const sourceKey = `${ownerDid}:${sourceType}:${assetId}`;
    return this.revenueBySource.get(sourceKey) || BigInt(0);
  }

  // -------- Test helper methods --------

  /**
   * Add revenue balance for testing (simulates revenue deposit from payment channels)
   */
  addRevenueBalance(ownerDid: string, assetId: string, amount: bigint, sourceType?: string): void {
    const balanceKey = `${ownerDid}:${assetId}`;
    const currentBalance = this.revenueBalances.get(balanceKey) || BigInt(0);
    this.revenueBalances.set(balanceKey, currentBalance + amount);

    // Also update source-specific balance if provided
    if (sourceType) {
      const sourceKey = `${ownerDid}:${sourceType}:${assetId}`;
      const currentSourceBalance = this.revenueBySource.get(sourceKey) || BigInt(0);
      this.revenueBySource.set(sourceKey, currentSourceBalance + amount);
    }
  }

  /**
   * Get all revenue balances for a DID (for debugging)
   */
  getDebugBalances(ownerDid: string): Record<string, bigint> {
    const result: Record<string, bigint> = {};
    for (const [key, balance] of this.revenueBalances.entries()) {
      if (key.startsWith(ownerDid + ':')) {
        const assetId = key.split(':')[1];
        result[assetId] = balance;
      }
    }
    return result;
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
  async createSigner(
    did: string,
    keyFragment: string = 'account-key'
  ): Promise<{
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
  decimals: 8,
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
  revenueContract: MockRevenueContract;
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
  const revenueContract = new MockRevenueContract();
  const signerFactory = new TestSignerFactory();

  const signerPair = await signerFactory.createSignerPair(payerDid, payeeDid);

  return {
    testId: id,
    contract,
    revenueContract,
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
