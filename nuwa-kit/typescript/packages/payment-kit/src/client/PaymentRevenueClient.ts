/**
 * PaymentRevenue Client
 *
 * This client provides a unified interface for payment revenue operations,
 * focusing on revenue management for service providers who earn through payment channels.
 * It's designed to be created from PaymentChannelPayeeClient to reuse the same contract
 * instance and signer.
 */

import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type {
  IPaymentRevenueContract,
  WithdrawRevenueParams,
  WithdrawalPreview,
  RevenueSource,
} from '../contracts/IPaymentRevenueContract';
import type { RateProvider } from '../billing/rate/types';
import type { AssetInfo } from '../core/types';

export interface PaymentRevenueClientOptions {
  contract: IPaymentRevenueContract;
  signer: SignerInterface;
  defaultAssetId: string;
  rateProvider?: RateProvider;
}

export interface RevenueBalanceOptions {
  ownerDid?: string;
  assetId?: string;
}

export interface RevenueBySourceOptions extends RevenueBalanceOptions {
  sourceType: string;
}

export interface HasRevenueOptions extends RevenueBalanceOptions {
  requiredAmount?: bigint;
}

/**
 * Chain-agnostic Payment Revenue Client
 *
 * Provides high-level APIs for payment revenue operations:
 * - Creating revenue hubs
 * - Withdrawing revenue to owner accounts
 * - Querying revenue balances and statistics
 * - Preview withdrawal fees
 *
 * This client operates independently of specific channels,
 * focusing purely on the DID-level revenue management for service providers.
 */
export class PaymentRevenueClient {
  private contract: IPaymentRevenueContract;
  private signer: SignerInterface;
  private defaultAssetId: string;
  private rateProvider: RateProvider;

  constructor(options: PaymentRevenueClientOptions) {
    if (!options.contract) {
      throw new Error('Contract is required');
    }
    if (!options.signer) {
      throw new Error('Signer is required');
    }
    if (!options.defaultAssetId || options.defaultAssetId.trim() === '') {
      throw new Error('Default asset ID is required');
    }

    this.contract = options.contract;
    this.signer = options.signer;
    this.defaultAssetId = options.defaultAssetId;

    // Use provided rate provider or create a simple one
    this.rateProvider = options.rateProvider || this.createDefaultRateProvider();
  }

  private createDefaultRateProvider(): RateProvider {
    // Create a simple rate provider that returns a fixed price for testing
    return {
      getPricePicoUSD: async (assetId: string): Promise<bigint> => {
        // Return 1 USD = 1,000,000 picoUSD for testing
        return BigInt(1000000);
      },
      getAssetInfo: async (assetId: string): Promise<AssetInfo | null> => {
        return {
          assetId,
          symbol: assetId.split('::').pop() || 'UNKNOWN',
          decimals: 8,
        };
      },
      getLastUpdated: (assetId: string): number | null => {
        return Date.now();
      },
      clearCache: async (): Promise<void> => {
        // No-op for simple provider
      },
    };
  }

  // -------- Revenue Hub Management --------

  /**
   * Create a revenue hub for the current signer
   */
  async createRevenueHub(ownerDid?: string): Promise<{ txHash: string }> {
    if (!ownerDid) {
      ownerDid = await this.signer.getDid();
    }

    const result = await this.contract.createRevenueHub(ownerDid, this.signer);
    return { txHash: result.txHash };
  }

  /**
   * Check if revenue hub exists for the current signer or specified owner
   */
  async revenueHubExists(ownerDid?: string): Promise<boolean> {
    if (!ownerDid) {
      ownerDid = await this.signer.getDid();
    }

    return this.contract.revenueHubExists(ownerDid);
  }

  /**
   * Ensure revenue hub exists, create if not (lazy creation)
   */
  async ensureRevenueHub(ownerDid?: string): Promise<void> {
    if (!ownerDid) {
      ownerDid = await this.signer.getDid();
    }

    const exists = await this.revenueHubExists(ownerDid);
    if (!exists) {
      await this.createRevenueHub(ownerDid);
    }
  }

  // -------- Revenue Operations --------

  /**
   * Withdraw revenue from hub to owner's account
   * @param assetId Asset to withdraw
   * @param amount Amount to withdraw (0 = withdraw all available)
   * @param ownerDid Optional owner DID (defaults to signer's DID)
   */
  async withdraw(assetId: string, amount: bigint, ownerDid?: string): Promise<{ txHash: string }> {
    if (!ownerDid) {
      ownerDid = await this.signer.getDid();
    }

    // If amount is 0, withdraw all available balance
    if (amount === BigInt(0)) {
      amount = await this.getRevenueBalance({ ownerDid, assetId });
    }

    const params: WithdrawRevenueParams = {
      ownerDid,
      assetId,
      amount,
      signer: this.signer,
    };

    const result = await this.contract.withdrawRevenue(params);
    return { txHash: result.txHash };
  }

  /**
   * Preview withdrawal fees and net amount
   */
  async previewWithdrawal(
    assetId: string,
    amount: bigint,
    ownerDid?: string
  ): Promise<WithdrawalPreview> {
    if (!ownerDid) {
      ownerDid = await this.signer.getDid();
    }

    return this.contract.previewWithdrawalFee(ownerDid, assetId, amount);
  }

  // -------- Balance Queries --------

  /**
   * Get revenue balance for a specific asset
   */
  async getRevenueBalance(options: RevenueBalanceOptions = {}): Promise<bigint> {
    const ownerDid = options.ownerDid || (await this.signer.getDid());
    const assetId = options.assetId || this.defaultAssetId;

    return this.contract.getRevenueBalance(ownerDid, assetId);
  }

  /**
   * Get revenue balance and its value in picoUSD using a rate provider.
   * Returns: { assetId, balance, pricePicoUSD, balancePicoUSD }
   */
  async getRevenueBalanceWithUsd(options: RevenueBalanceOptions = {}): Promise<{
    assetId: string;
    balance: bigint;
    pricePicoUSD: bigint;
    balancePicoUSD: bigint;
  }> {
    const ownerDid = options.ownerDid || (await this.signer.getDid());
    const assetId = options.assetId || this.defaultAssetId;
    const balance = await this.contract.getRevenueBalance(ownerDid, assetId);

    const pricePicoUSD = await this.rateProvider.getPricePicoUSD(assetId);
    const balancePicoUSD = balance * pricePicoUSD;

    return { assetId, balance, pricePicoUSD, balancePicoUSD };
  }

  /**
   * Get revenue balance by source type
   */
  async getRevenueBySource(options: RevenueBySourceOptions): Promise<bigint> {
    const ownerDid = options.ownerDid || (await this.signer.getDid());
    const assetId = options.assetId || this.defaultAssetId;

    return this.contract.getRevenueBySource(ownerDid, options.sourceType, assetId);
  }

  /**
   * Check if revenue hub has sufficient balance for withdrawal
   */
  async hasRevenue(options: HasRevenueOptions = {}): Promise<boolean> {
    const { requiredAmount = BigInt(0), ...balanceOptions } = options;
    const balance = await this.getRevenueBalance(balanceOptions);
    return balance >= requiredAmount;
  }

  // -------- Utility Methods --------

  /**
   * Create a revenue source for tracking purposes
   */
  createRevenueSource(sourceType: string, sourceId?: string, description?: string): RevenueSource {
    return {
      sourceType,
      sourceId,
      description: description || `Revenue from ${sourceType}`,
    };
  }
}
