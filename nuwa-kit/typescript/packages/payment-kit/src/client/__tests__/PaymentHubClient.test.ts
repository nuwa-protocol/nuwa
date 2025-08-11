/**
 * Tests for PaymentHubClient
 */

import { PaymentHubClient } from '../PaymentHubClient';
import { MockContract, createTestEnvironment } from '../../test-helpers/mocks';

describe('PaymentHubClient', () => {
  let contract: MockContract;
  let hubClient: PaymentHubClient;
  let mockSigner: any;

  beforeEach(async () => {
    const testEnv = await createTestEnvironment('hub-test');
    contract = testEnv.contract;
    mockSigner = testEnv.payerSigner;

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

  describe('getActiveChannelsCounts', () => {
    it('should get active channels counts for all assets', async () => {
      const counts = await hubClient.getActiveChannelsCounts();

      expect(counts).toEqual({
        '0x3::gas_coin::RGas': 2,
        '0x3::stable_coin::USDC': 1,
      });
    });

    it('should support different owner DID', async () => {
      const counts = await hubClient.getActiveChannelsCounts('did:rooch:0x456');

      expect(counts).toEqual({
        '0x3::gas_coin::RGas': 2,
        '0x3::stable_coin::USDC': 1,
      });
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
});
