/**
 * Tests for PaymentHubClient
 */

import { PaymentHubClient } from '../PaymentHubClient';
import { MockContract, createTestEnvironment } from '../../test-helpers/mocks';

describe('PaymentHubClient', () => {
  let contract: MockContract;
  let hubClient: PaymentHubClient;
  let mockSigner: any;
  let payerDid: string;
  let payeeDid: string;
  let assetId: string;

  beforeEach(async () => {
    const testEnv = await createTestEnvironment('hub-test');
    contract = testEnv.contract;
    mockSigner = testEnv.payerSigner;
    payerDid = testEnv.payerDid;
    payeeDid = testEnv.payeeDid;
    assetId = testEnv.asset.assetId;

    hubClient = new PaymentHubClient({
      contract,
      signer: mockSigner,
      defaultAssetId: '0x3::gas_coin::RGas', // Add required defaultAssetId
    });
  });

  afterEach(() => {
    contract.reset();
  });

  describe('deposit', () => {
    it('should deposit funds to hub', async () => {
      const result = await hubClient.deposit('0x3::gas_coin::RGas', BigInt(1000));

      expect(result.txHash).toMatch(/^deposit-tx-/);

      // Verify balance was updated
      const balance = await hubClient.getBalance({ assetId: '0x3::gas_coin::RGas' });
      expect(balance).toBe(BigInt(1000));
    });

    it('should accumulate multiple deposits', async () => {
      await hubClient.deposit('0x3::gas_coin::RGas', BigInt(500));
      await hubClient.deposit('0x3::gas_coin::RGas', BigInt(300));

      const balance = await hubClient.getBalance({ assetId: '0x3::gas_coin::RGas' });
      expect(balance).toBe(BigInt(800));
    });
  });

  describe('withdraw', () => {
    beforeEach(async () => {
      // Set up initial balance
      await hubClient.deposit('0x3::gas_coin::RGas', BigInt(1000));
    });

    it('should withdraw specific amount', async () => {
      const result = await hubClient.withdraw('0x3::gas_coin::RGas', BigInt(300));

      expect(result.txHash).toMatch(/^withdraw-tx-/);

      // Verify balance was updated
      const balance = await hubClient.getBalance({ assetId: '0x3::gas_coin::RGas' });
      expect(balance).toBe(BigInt(700));
    });

    it('should withdraw all funds when amount is 0', async () => {
      const result = await hubClient.withdraw('0x3::gas_coin::RGas', BigInt(0));

      expect(result.txHash).toMatch(/^withdraw-tx-/);

      // Verify balance is now 0
      const balance = await hubClient.getBalance({ assetId: '0x3::gas_coin::RGas' });
      expect(balance).toBe(BigInt(0));
    });

    it('should fail when insufficient balance', async () => {
      await expect(hubClient.withdraw('0x3::gas_coin::RGas', BigInt(2000))).rejects.toThrow(
        'Insufficient balance'
      );
    });
  });

  describe('getBalance', () => {
    it('should return 0 for non-existent asset', async () => {
      const balance = await hubClient.getBalance({ assetId: '0x3::unknown::Token' });
      expect(balance).toBe(BigInt(0));
    });

    it('should return correct balance after operations', async () => {
      await hubClient.deposit('0x3::gas_coin::RGas', BigInt(1500));
      await hubClient.withdraw('0x3::gas_coin::RGas', BigInt(500));

      const balance = await hubClient.getBalance({ assetId: '0x3::gas_coin::RGas' });
      expect(balance).toBe(BigInt(1000));
    });
  });

  describe('getAllBalances', () => {
    it('should get all balances in the hub', async () => {
      await hubClient.deposit('0x3::gas_coin::RGas', BigInt(1000));
      await hubClient.deposit('0x3::stable_coin::USDC', BigInt(500));

      const balances = await hubClient.getAllBalances();

      expect(balances).toEqual({
        '0x3::gas_coin::RGas': BigInt(1000),
        '0x3::stable_coin::USDC': BigInt(500),
      });
    });

    it('should return empty object when no balances exist', async () => {
      const balances = await hubClient.getAllBalances();

      expect(balances).toEqual({});
    });
  });

  describe('getActiveChannelCount', () => {
    it('should get active channel count for default asset', async () => {
      const count = await hubClient.getActiveChannelCount();

      expect(count).toBe(2);
    });

    it('should support different owner DID', async () => {
      const count = await hubClient.getActiveChannelCount(assetId, 'did:rooch:0x456');

      expect(count).toBe(2);
    });
  });

  describe('hasBalance', () => {
    beforeEach(async () => {
      await hubClient.deposit('0x3::gas_coin::RGas', BigInt(1000));
    });

    it('should return true when sufficient balance', async () => {
      const result = await hubClient.hasBalance({
        assetId: '0x3::gas_coin::RGas',
        requiredAmount: BigInt(500),
      });
      expect(result).toBe(true);
    });

    it('should return false when insufficient balance', async () => {
      const result = await hubClient.hasBalance({
        assetId: '0x3::gas_coin::RGas',
        requiredAmount: BigInt(2000),
      });
      expect(result).toBe(false);
    });

    it('should return false for non-existent asset', async () => {
      const result = await hubClient.hasBalance({
        assetId: '0x3::unknown::Token',
        requiredAmount: BigInt(1),
      });
      expect(result).toBe(false);
    });
  });

  describe('transfer', () => {
    beforeEach(async () => {
      await hubClient.deposit(assetId, BigInt(1000));
    });

    it('should transfer funds between hubs', async () => {
      const result = await hubClient.transfer(payeeDid, assetId, BigInt(400));

      expect(result.txHash).toMatch(/^transfer-hub-tx-/);

      const senderBalance = await contract.getHubBalance(payerDid, assetId);
      const receiverBalance = await contract.getHubBalance(payeeDid, assetId);

      expect(senderBalance).toBe(BigInt(600));
      expect(receiverBalance).toBe(BigInt(400));
    });
  });

  describe('getUnlockedBalance', () => {
    it('should return unlocked balance based on contract calculation', async () => {
      await hubClient.deposit(assetId, BigInt(1000));

      const unlocked = await hubClient.getUnlockedBalance({ assetId });

      expect(unlocked).toBe(BigInt(800)); // Mock returns 80% unlocked
    });
  });
});
