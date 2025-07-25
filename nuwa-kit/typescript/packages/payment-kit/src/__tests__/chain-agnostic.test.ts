/**
 * Tests for chain-agnostic payment channel architecture
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { 
  IPaymentChannelContract, 
  OpenChannelParams, 
  OpenChannelResult,
  ClaimParams,
  ClaimResult,
  SubChannelInfo,
  SubChannelParams,
  OpenChannelWithSubChannelParams,
} from '../contracts/IPaymentChannelContract';
import type { AssetInfo } from '../core/types';
import { PaymentChannelClient } from '../client/PaymentChannelClient';
import { PaymentChannelFactory } from '../factory/chainFactory';
import type { SignerInterface } from '@nuwa-ai/identity-kit';

// Mock implementation of IPaymentChannelContract for testing
class MockPaymentChannelContract implements IPaymentChannelContract {
  async getSubChannel(params: SubChannelParams): Promise<SubChannelInfo> {
    return {
      vmIdFragment: 'test-key-1',
      publicKey: 'test-key-1',
      methodType: 'secp256k1',
      lastClaimedAmount: BigInt('0'),
      lastConfirmedNonce: BigInt('0'),
    };
  }
  async openChannel(params: OpenChannelParams): Promise<OpenChannelResult> {
    return {
      channelId: '0x1234567890abcdef1234567890abcdef12345678',
      txHash: '0xabcdef1234567890abcdef1234567890abcdef12',
      blockHeight: BigInt(12345),
    };
  }

  async openChannelWithSubChannel(params: OpenChannelWithSubChannelParams): Promise<OpenChannelResult> {
    return {
      channelId: '0x1234567890abcdef1234567890abcdef12345678',
      txHash: '0xonestep1234567890abcdef1234567890abcdef',
      blockHeight: BigInt(12345),
    };
  }

  async authorizeSubChannel(params: any): Promise<any> {
    return { txHash: '0xauth123' };
  }

  async claimFromChannel(params: ClaimParams): Promise<ClaimResult> {
    return {
      txHash: '0xclaim123',
      claimedAmount: BigInt('1000000000000000000'),
      blockHeight: BigInt(12346),
    };
  }

  async closeChannel(params: any): Promise<any> {
    return { txHash: '0xclose123' };
  }

  async getChannelStatus(params: any): Promise<any> {
    return {
      channelId: params.channelId,
      payerDid: 'did:test:0x123',
      payeeDid: 'did:test:0x456',
      asset: { assetId: '0x3::gas_coin::RGas', symbol: 'RGAS' },
      totalCollateral: BigInt('1000000000000000000'),
      claimedAmount: BigInt('0'),
      epoch: BigInt(0),
      status: 'active',
    };
  }

  async getAssetInfo(assetId: string): Promise<AssetInfo> {
    return {
      assetId,
      symbol: 'RGAS',
    };
  }

  async getAssetPrice(assetId: string): Promise<bigint> {
    // Return mock price in pUSD (100 pUSD = 0.0001 USD)
    return BigInt('100');
  }

  async getChainId(): Promise<bigint> {
    // Return mock chain ID (test network)
    return BigInt(2);
  }

  async depositToHub(params: any): Promise<any> {
    // Mock deposit to hub - return success
    return {
      txHash: '0xmock_deposit_hash',
      blockHeight: BigInt(100),
      events: [],
    };
  }
}

// Mock SignerInterface - simplified for testing
const mockSigner = {
  getDid: async () => 'did:test:0x123',
  signWithKeyId: async () => new Uint8Array(64),
  listKeyIds: async () => ['test-key-1'],
  canSignWithKeyId: async () => true,
  getKeyInfo: async () => ({ type: 'secp256k1' }),
} as unknown as SignerInterface;

describe('Chain-Agnostic Payment Channel Architecture', () => {
  let mockContract: MockPaymentChannelContract;
  let client: PaymentChannelClient;

  beforeEach(() => {
    mockContract = new MockPaymentChannelContract();
    client = new PaymentChannelClient({
      contract: mockContract,
      signer: mockSigner,
      keyId: 'test-key-1',
    });
  });

  describe('IPaymentChannelContract Interface', () => {
    it('should implement all required methods', () => {
      expect(typeof mockContract.openChannel).toBe('function');
      expect(typeof mockContract.authorizeSubChannel).toBe('function');
      expect(typeof mockContract.claimFromChannel).toBe('function');
      expect(typeof mockContract.closeChannel).toBe('function');
      expect(typeof mockContract.getChannelStatus).toBe('function');
      expect(typeof mockContract.getAssetInfo).toBe('function');
      expect(typeof mockContract.getAssetPrice).toBe('function');
    });

    it('should return correct asset information', async () => {
      const assetInfo = await mockContract.getAssetInfo('0x3::gas_coin::RGas');
      expect(assetInfo).toEqual({
        assetId: '0x3::gas_coin::RGas',
        symbol: 'RGAS',
      });
    });

    it('should return price in pUSD', async () => {
      const price = await mockContract.getAssetPrice('0x3::gas_coin::RGas');
      expect(price).toBe(BigInt('100')); // 100 pUSD = 0.0001 USD
    });
  });

  describe('PaymentChannelClient', () => {
    it('should create client with mock contract', () => {
      expect(client).toBeInstanceOf(PaymentChannelClient);
    });

    it('should open channel through contract interface', async () => {
      const channelMeta = await client.openChannel({
        payeeDid: 'did:test:0x456',
        asset: { assetId: '0x3::gas_coin::RGas', symbol: 'RGAS' },
        collateral: BigInt('1000000000000000000'),
      });

      expect(channelMeta.channelId).toBe('0x1234567890abcdef1234567890abcdef12345678');
      expect(channelMeta.payerDid).toBe('did:test:0x123');
      expect(channelMeta.payeeDid).toBe('did:test:0x456');
    });

    it('should get asset information', async () => {
      const assetInfo = await client.getAssetInfo('0x3::gas_coin::RGas');
      expect(assetInfo.symbol).toBe('RGAS');
    });

    it('should get asset price in pUSD', async () => {
      const price = await client.getAssetPrice('0x3::gas_coin::RGas');
      expect(price).toBe(BigInt('100'));
    });
  });

  describe('PaymentChannelFactory', () => {
    it('should create contract instance', () => {
      const contract = PaymentChannelFactory.createContract({
        chain: 'rooch',
        rpcUrl: 'https://test-seed.rooch.network',
      });
      
      expect(contract).toBeDefined();
      // Should implement IPaymentChannelContract interface
      expect(typeof contract.openChannel).toBe('function');
      expect(typeof contract.getAssetPrice).toBe('function');
    });

    it('should create client with factory', () => {
      const factoryClient = PaymentChannelFactory.createClient({
        chainConfig: {
          chain: 'rooch',
          rpcUrl: 'https://test-seed.rooch.network',
        },
        signer: mockSigner,
        keyId: 'test-key',
      });
      
      expect(factoryClient).toBeInstanceOf(PaymentChannelClient);
    });
  });

  describe('Price Conversion Utilities', () => {
    it('should convert pUSD to USD correctly', () => {
      const pUSD = BigInt('1000000'); // 1,000,000 pUSD
      const USD = Number(pUSD) / 1000000; // Should be 1 USD
      expect(USD).toBe(1.0);
    });

    it('should handle fractional USD amounts', () => {
      const pUSD = BigInt('100'); // 100 pUSD
      const USD = Number(pUSD) / 1000000; // Should be 0.0001 USD
      expect(USD).toBe(0.0001);
    });
  });
});

describe('Chain Integration Examples', () => {
  it('should demonstrate multi-chain support concept', async () => {
    // This test shows how the same client code can work with different chains
    
    // Mock Rooch implementation
    const roochContract = new MockPaymentChannelContract();
    const roochClient = new PaymentChannelClient({
      contract: roochContract,
      signer: mockSigner,
    });

    // Mock future EVM implementation (same interface)
    const evmContract = new MockPaymentChannelContract();
    const evmClient = new PaymentChannelClient({
      contract: evmContract,
      signer: mockSigner,
    });

    // Same operations work on both chains
    const roochAsset = await roochClient.getAssetInfo('0x3::gas_coin::RGas');
    const evmAsset = await evmClient.getAssetInfo('0xA0b86a33E6441e6e80ec8548E5085C5D0532A0Ea');

    expect(roochAsset.assetId).toBe('0x3::gas_coin::RGas');
    expect(evmAsset.assetId).toBe('0xA0b86a33E6441e6e80ec8548E5085C5D0532A0Ea');

    // Both return prices in the same unit (pUSD)
    const roochPrice = await roochClient.getAssetPrice(roochAsset.assetId);
    const evmPrice = await evmClient.getAssetPrice(evmAsset.assetId);

    expect(typeof roochPrice).toBe('bigint');
    expect(typeof evmPrice).toBe('bigint');
  });
}); 