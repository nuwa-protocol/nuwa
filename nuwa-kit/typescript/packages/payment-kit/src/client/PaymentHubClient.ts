/**
 * PaymentHub Client
 *
 * This client provides a unified interface for payment hub operations,
 * focusing solely on deposit, withdraw, and balance management.
 * It's designed to be created from PaymentChannelPayerClient or PaymentChannelPayeeClient
 * to reuse the same contract instance and signer.
 */

import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type {
  IPaymentChannelContract,
  DepositParams,
  WithdrawParams,
} from '../contracts/IPaymentChannelContract';
import type { TransferToHubParams } from '../contracts/IPaymentChannelContract';
import type { RateProvider } from '../billing/rate/types';
import { ContractRateProvider } from '../billing/rate/contract';

export interface PaymentHubClientOptions {
  contract: IPaymentChannelContract;
  signer: SignerInterface;
  defaultAssetId: string;
  rateProvider?: RateProvider;
}

export interface BalanceOptions {
  ownerDid?: string;
  assetId?: string;
}

export interface HasBalanceOptions extends BalanceOptions {
  requiredAmount?: bigint;
}

/**
 * Chain-agnostic Payment Hub Client
 *
 * Provides high-level APIs for payment hub operations:
 * - Depositing funds to hub
 * - Withdrawing funds from hub
 * - Querying hub balances
 *
 * This client operates independently of specific channels or VM keys,
 * focusing purely on the DID-level hub management.
 */
export class PaymentHubClient {
  private contract: IPaymentChannelContract;
  private signer: SignerInterface;
  private defaultAssetId: string;
  private rateProvider: RateProvider;

  constructor(options: PaymentHubClientOptions) {
    this.contract = options.contract;
    this.signer = options.signer;
    this.defaultAssetId = options.defaultAssetId;
    this.rateProvider = options.rateProvider || new ContractRateProvider(this.contract);
  }

  // -------- Hub Operations --------

  /**
   * Deposit funds to the payment hub for the current signer
   */
  async deposit(assetId: string, amount: bigint, ownerDid?: string): Promise<{ txHash: string }> {
    if (!ownerDid) {
      ownerDid = await this.signer.getDid();
    }
    const params: DepositParams = {
      ownerDid,
      assetId,
      amount,
      signer: this.signer,
    };

    const result = await this.contract.depositToHub(params);
    return { txHash: result.txHash };
  }

  /**
   * Withdraw funds from the payment hub to the owner's account
   * @param assetId Asset to withdraw
   * @param amount Amount to withdraw (0 = withdraw all)
   * @param recipient Optional recipient address/DID (defaults to owner's account)
   */
  async withdraw(assetId: string, amount: bigint, recipient?: string): Promise<{ txHash: string }> {
    const ownerDid = await this.signer.getDid();

    const params: WithdrawParams = {
      ownerDid,
      assetId,
      amount,
      recipient,
      signer: this.signer,
    };

    const result = await this.contract.withdrawFromHub(params);
    return { txHash: result.txHash };
  }

  /**
   * Get balance of a specific asset in the payment hub
   */
  async getBalance(options: BalanceOptions = {}): Promise<bigint> {
    const ownerDid = options.ownerDid || (await this.signer.getDid());
    const assetId = options.assetId || this.defaultAssetId;
    return this.contract.getHubBalance(ownerDid, assetId);
  }

  /**
   * Get balance and its value in picoUSD using a rate provider.
   * Returns: { assetId, balance, pricePicoUSD, balancePicoUSD }
   */
  async getBalanceWithUsd(options: BalanceOptions = {}): Promise<{
    assetId: string;
    balance: bigint;
    pricePicoUSD: bigint;
    balancePicoUSD: bigint;
  }> {
    const ownerDid = options.ownerDid || (await this.signer.getDid());
    const assetId = options.assetId || this.defaultAssetId;
    const balance = await this.contract.getHubBalance(ownerDid, assetId);

    const pricePicoUSD = await this.rateProvider.getPricePicoUSD(assetId);
    const balancePicoUSD = balance * pricePicoUSD;

    return { assetId, balance, pricePicoUSD, balancePicoUSD };
  }

  /**
   * Get all balances in the hub for all assets
   */
  async getAllBalances(ownerDid?: string): Promise<Record<string, bigint>> {
    if (!ownerDid) {
      ownerDid = await this.signer.getDid();
    }
    return this.contract.getAllHubBalances(ownerDid);
  }

  /**
   * Get active channel count for an asset (defaults to client's default asset)
   */
  async getActiveChannelCount(assetId?: string, ownerDid?: string): Promise<number> {
    if (!ownerDid) {
      ownerDid = await this.signer.getDid();
    }
    const targetAssetId = assetId || this.defaultAssetId;
    return this.contract.getActiveChannelCount(ownerDid, targetAssetId);
  }

  /**
   * Check if hub has sufficient balance for a payment
   */
  async hasBalance(options: HasBalanceOptions = {}): Promise<boolean> {
    const { requiredAmount = BigInt(0), ...balanceOptions } = options;
    const balance = await this.getBalance(balanceOptions);
    return balance >= requiredAmount;
  }

  /**
   * Transfer funds from this hub to another address's payment hub
   * @param recipientDid DID of the recipient
   * @param assetId Asset to transfer
   * @param amount Amount to transfer
   * @returns Transaction hash
   */
  async transfer(
    recipientDid: string,
    assetId: string,
    amount: bigint
  ): Promise<{ txHash: string }> {
    const senderDid = await this.signer.getDid();

    const params: TransferToHubParams = {
      senderDid,
      receiverDid: recipientDid,
      assetId,
      amount,
      signer: this.signer,
    };

    const result = await this.contract.transferToHub(params);
    return { txHash: result.txHash };
  }

  /**
   * Get unlocked balance (available for transfer) from this hub
   * @param options Optional balance options
   * @returns Unlocked balance amount
   */
  async getUnlockedBalance(options: BalanceOptions = {}): Promise<bigint> {
    const ownerDid = options.ownerDid || (await this.signer.getDid());
    const assetId = options.assetId || this.defaultAssetId;
    return this.contract.getUnlockedBalance(ownerDid, assetId);
  }
}
