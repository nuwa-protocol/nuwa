/**
 * Payment Revenue Contract Interface
 *
 * This interface defines the contract operations for managing payment revenue,
 * corresponding to the payment_revenue.move module functionality.
 */

import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type { TxResult } from './IPaymentChannelContract';

// -------- Types --------

/**
 * Revenue source information for tracking
 */
export interface RevenueSource {
  sourceType: string; // "payment_channel", "staking", etc.
  sourceId?: string; // Specific source ID (e.g., channel_id)
  description: string; // Optional description
}

/**
 * Revenue withdrawal preview information
 */
export interface WithdrawalPreview {
  grossAmount: bigint; // Original withdrawal amount
  feeAmount: bigint; // Fee to be deducted (currently 0)
  netAmount: bigint; // Net amount after fees
  feeRateBps: number; // Fee rate in basis points (currently 0)
}

// -------- Parameters --------

/**
 * Parameters for withdrawing revenue
 */
export interface WithdrawRevenueParams {
  /** Owner DID of the revenue hub */
  ownerDid: string;
  /** Asset type identifier */
  assetId: string;
  /** Amount to withdraw (in smallest asset units) */
  amount: bigint;
  /** Signer for the transaction */
  signer: SignerInterface;
}

/**
 * Parameters for depositing revenue (friend function - internal use)
 */
export interface DepositRevenueParams {
  /** Target account to receive revenue */
  account: string;
  /** Asset type identifier */
  assetId: string;
  /** Amount to deposit */
  amount: bigint;
  /** Revenue source information */
  source: RevenueSource;
  /** Signer for the transaction */
  signer: SignerInterface;
}

// -------- Contract Interface --------

/**
 * Chain-agnostic payment revenue contract interface
 *
 * This interface abstracts payment revenue operations across different blockchains,
 * providing a unified API for revenue management, balance queries, and withdrawals.
 */
export interface IPaymentRevenueContract {
  // -------- Revenue Hub Management --------

  /**
   * Create a revenue hub for the owner
   * @param ownerDid Owner DID for the revenue hub
   * @param signer Signer for the transaction
   * @returns Transaction result
   */
  createRevenueHub(ownerDid: string, signer: SignerInterface): Promise<TxResult>;

  /**
   * Check if revenue hub exists for an owner
   * @param ownerDid Owner DID to check
   * @returns True if revenue hub exists
   */
  revenueHubExists(ownerDid: string): Promise<boolean>;

  // -------- Revenue Operations --------

  /**
   * Withdraw revenue from hub to owner's account
   * @param params Withdrawal parameters
   * @returns Transaction result
   */
  withdrawRevenue(params: WithdrawRevenueParams): Promise<TxResult>;

  /**
   * Preview withdrawal fees and net amount
   * @param ownerDid Owner DID of the revenue hub
   * @param assetId Asset type identifier
   * @param amount Amount to withdraw
   * @returns Withdrawal preview with fee information
   */
  previewWithdrawalFee(
    ownerDid: string,
    assetId: string,
    amount: bigint
  ): Promise<WithdrawalPreview>;

  // -------- Balance Queries --------

  /**
   * Get revenue balance for a specific asset type
   * @param ownerDid Owner DID of the revenue hub
   * @param assetId Asset type identifier
   * @returns Revenue balance
   */
  getRevenueBalance(ownerDid: string, assetId: string): Promise<bigint>;

  /**
   * Get revenue balance by source type and asset type
   * @param ownerDid Owner DID of the revenue hub
   * @param sourceType Source type (e.g., "payment_channel")
   * @param assetId Asset type identifier
   * @returns Revenue balance from specific source
   */
  getRevenueBySource(ownerDid: string, sourceType: string, assetId: string): Promise<bigint>;
}

// -------- Type Alias for Revenue Operations Only --------

/**
 * Type alias for PaymentRevenue operations only
 * Useful for dependency injection when only revenue operations are needed
 */
export type IPaymentRevenueOperations = Pick<
  IPaymentRevenueContract,
  | 'createRevenueHub'
  | 'revenueHubExists'
  | 'withdrawRevenue'
  | 'previewWithdrawalFee'
  | 'getRevenueBalance'
  | 'getRevenueBySource'
>;
