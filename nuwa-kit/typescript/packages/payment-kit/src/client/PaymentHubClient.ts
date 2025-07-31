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

export interface PaymentHubClientOptions {
  contract: IPaymentChannelContract;
  signer: SignerInterface;
  defaultAssetId: string;
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

  constructor(options: PaymentHubClientOptions) {
    this.contract = options.contract;
    this.signer = options.signer;
    this.defaultAssetId = options.defaultAssetId;
  }

  // -------- Hub Operations --------

  /**
   * Deposit funds to the payment hub for the current signer
   */
  async deposit(assetId: string, amount: bigint): Promise<{ txHash: string }> {
    const ownerDid = await this.signer.getDid();
    
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
  async withdraw(
    assetId: string, 
    amount: bigint, 
    recipient?: string
  ): Promise<{ txHash: string }> {
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
    const ownerDid = options.ownerDid || await this.signer.getDid();
    const assetId = options.assetId || this.defaultAssetId;
    return this.contract.getHubBalance(ownerDid, assetId);
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
   * Get active channels counts for all assets
   */
  async getActiveChannelsCounts(ownerDid?: string): Promise<Record<string, number>> {
    if (!ownerDid) {
      ownerDid = await this.signer.getDid();
    }
    return this.contract.getActiveChannelsCounts(ownerDid);
  }

  /**
   * Check if hub has sufficient balance for a payment
   */
  async hasBalance(options: HasBalanceOptions = {}): Promise<boolean> {
    const { requiredAmount = BigInt(0), ...balanceOptions } = options;
    const balance = await this.getBalance(balanceOptions);
    return balance >= requiredAmount;
  }
}