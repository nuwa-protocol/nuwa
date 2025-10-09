/**
 * Rooch Payment Revenue Contract Implementation
 *
 * Implementation of IPaymentRevenueContract for Rooch blockchain.
 * Provides concrete implementation of payment revenue operations using Rooch SDK
 * and the rooch_framework::payment_revenue Move module.
 */

import { Args } from '@roochnetwork/rooch-sdk';

import type {
  IPaymentRevenueContract,
  WithdrawRevenueParams,
  WithdrawalPreview,
  RevenueSource,
} from '../contracts/IPaymentRevenueContract';
import type { TxResult } from '../contracts/IPaymentChannelContract';
import { SignerInterface, parseDid } from '@nuwa-ai/identity-kit';
import {
  badRequest,
  wrapUnknownError,
  mapTxFailureToPaymentKitError,
} from '../errors/RoochErrorMapper';
import {
  deriveFieldKeyFromString,
  deriveCoinTypeFieldKey,
  parseDynamicFieldCoinStore,
  safeBalanceToBigint,
  calculateRevenueHubId,
  parsePaymentRevenueHubData,
  parseU256FromBCS,
  extractStringFromFieldKey,
  extractAssetIdFromFieldKey,
  extractTableIdFromField,
  PaymentRevenueHub,
} from './ChannelUtils';
import { RoochContractBase, type RoochContractOptions } from './RoochContractBase';

/**
 * Default contract address for Rooch payment revenue
 */
const DEFAULT_PAYMENT_REVENUE_MODULE = '0x3::payment_revenue';

/**
 * Rooch implementation of the Payment Revenue Contract
 *
 * This implementation provides complete functionality for payment revenue management
 * using the Rooch blockchain and corresponding Move contracts.
 */
export class RoochPaymentRevenueContract
  extends RoochContractBase
  implements IPaymentRevenueContract
{
  constructor(options: RoochContractOptions = {}) {
    super(options, DEFAULT_PAYMENT_REVENUE_MODULE, 'RoochPaymentRevenueContract');
  }

  // -------- Revenue Hub Management --------

  async createRevenueHub(ownerDid: string, signer: SignerInterface): Promise<TxResult> {
    try {
      this.logger.debug('Creating revenue hub for DID:', ownerDid);

      // Parse and validate owner DID
      const ownerParsed = parseDid(ownerDid);
      if (ownerParsed.method !== 'rooch') {
        throw badRequest(`Invalid owner DID method: expected 'rooch', got '${ownerParsed.method}'`);
      }

      const roochSigner = await this.convertSigner(signer);

      // Create transaction to create revenue hub
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.getContractAddress()}::create_revenue_hub`,
        typeArgs: [],
        args: [],
        maxGas: 100000000,
      });

      this.logger.debug('Executing createRevenueHub transaction');

      // Execute transaction
      const result = await this.getClient().signAndExecuteTransaction({
        transaction,
        signer: roochSigner,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw mapTxFailureToPaymentKitError('createRevenueHub', result.execution_info);
      }

      return {
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0),
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error creating revenue hub:', error);
      throw wrapUnknownError('createRevenueHub', error);
    }
  }

  async revenueHubExists(ownerDid: string): Promise<boolean> {
    try {
      this.logger.debug('Checking if revenue hub exists for DID:', ownerDid);

      // Parse and validate owner DID
      const ownerParsed = parseDid(ownerDid);
      if (ownerParsed.method !== 'rooch') {
        throw badRequest(`Invalid owner DID method: expected 'rooch', got '${ownerParsed.method}'`);
      }

      // Calculate revenue hub object ID
      const revenueHubId = calculateRevenueHubId(ownerParsed.identifier);

      // Check if object exists
      const objectState = await this.getClient().getObjectStates({
        ids: [revenueHubId],
      });

      return objectState && objectState.length > 0 && objectState[0] !== null;
    } catch (error) {
      this.logger.error('Error checking revenue hub existence:', error);
      // If error is "object not found", return false
      if (
        error &&
        typeof error === 'object' &&
        'toString' in error &&
        error.toString().includes('not found')
      ) {
        return false;
      }
      throw wrapUnknownError('revenueHubExists', error);
    }
  }

  // -------- Revenue Operations --------

  async withdrawRevenue(params: WithdrawRevenueParams): Promise<TxResult> {
    try {
      this.logger.debug('Withdrawing revenue with params:', params);

      // Parse and validate owner DID
      const ownerParsed = parseDid(params.ownerDid);
      if (ownerParsed.method !== 'rooch') {
        throw badRequest(`Invalid owner DID method: expected 'rooch', got '${ownerParsed.method}'`);
      }

      const signer = await this.convertSigner(params.signer);

      // Create transaction to withdraw revenue
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.getContractAddress()}::withdraw_revenue_entry`,
        typeArgs: [params.assetId], // CoinType as type argument
        args: [Args.u256(params.amount)],
        maxGas: 100000000,
      });

      this.logger.debug('Executing withdrawRevenue transaction');

      // Execute transaction
      const result = await this.getClient().signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw mapTxFailureToPaymentKitError('withdrawRevenue', result.execution_info);
      }

      return {
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0),
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error withdrawing revenue:', error);
      throw wrapUnknownError('withdrawRevenue', error);
    }
  }

  async previewWithdrawalFee(
    ownerDid: string,
    assetId: string,
    amount: bigint
  ): Promise<WithdrawalPreview> {
    try {
      this.logger.debug(
        'Previewing withdrawal fee for DID:',
        ownerDid,
        'asset:',
        assetId,
        'amount:',
        amount
      );

      // Parse and validate owner DID
      const ownerParsed = parseDid(ownerDid);
      if (ownerParsed.method !== 'rooch') {
        throw badRequest(`Invalid owner DID method: expected 'rooch', got '${ownerParsed.method}'`);
      }

      // Currently, the Move contract returns zero fees
      // This is a placeholder for future fee mechanism implementation
      return {
        grossAmount: amount,
        feeAmount: BigInt(0),
        netAmount: amount,
        feeRateBps: 0,
      };
    } catch (error) {
      this.logger.error('Error previewing withdrawal fee:', error);
      throw wrapUnknownError('previewWithdrawalFee', error);
    }
  }

  // -------- Balance Queries --------

  async getRevenueBalance(ownerDid: string, assetId: string): Promise<bigint> {
    try {
      this.logger.debug('Getting revenue balance for DID:', ownerDid, 'asset:', assetId);

      // Parse and validate owner DID
      const ownerParsed = parseDid(ownerDid);
      if (ownerParsed.method !== 'rooch') {
        throw badRequest(`Invalid owner DID method: expected 'rooch', got '${ownerParsed.method}'`);
      }

      // Get PaymentRevenueHub object
      const revenueHub = await this.getRevenueHub(ownerParsed.identifier);
      if (!revenueHub) {
        this.logger.debug('Revenue hub not found for owner:', ownerDid);
        return BigInt(0);
      }

      this.logger.debug('MultiCoinStore ID extracted:', revenueHub.multi_coin_store);

      // Query the specific field for this coin type in the multi_coin_store
      const fieldKey = deriveCoinTypeFieldKey(assetId);
      const fieldStates = await this.getClient().getFieldStates({
        objectId: revenueHub.multi_coin_store,
        fieldKey: [fieldKey],
      });

      if (!fieldStates || fieldStates.length === 0 || !fieldStates[0]) {
        // Asset not found in the store, balance is 0
        this.logger.debug('Asset not found in multi_coin_store:', assetId);
        return BigInt(0);
      }

      // Parse the DynamicField<String, CoinStoreField> to get balance
      const fieldState = fieldStates[0];
      const fieldValue = fieldState.value;

      if (typeof fieldValue === 'string' && fieldValue.startsWith('0x')) {
        // Parse BCS data
        const coinStoreField = parseDynamicFieldCoinStore(fieldValue);
        return safeBalanceToBigint(coinStoreField.value.balance.value);
      } else {
        this.logger.warn('Unexpected field value format:', fieldValue);
        return BigInt(0);
      }
    } catch (error) {
      this.logger.error('Error getting revenue balance:', error);
      // If error is related to object not found, return 0
      if (
        error &&
        typeof error === 'object' &&
        'toString' in error &&
        error.toString().includes('not found')
      ) {
        return BigInt(0);
      }
      throw wrapUnknownError('getRevenueBalance', error);
    }
  }

  async getRevenueBySource(ownerDid: string, sourceType: string, assetId: string): Promise<bigint> {
    try {
      this.logger.debug(
        'Getting revenue by source for DID:',
        ownerDid,
        'source:',
        sourceType,
        'asset:',
        assetId
      );

      // Parse and validate owner DID
      const ownerParsed = parseDid(ownerDid);
      if (ownerParsed.method !== 'rooch') {
        throw badRequest(`Invalid owner DID method: expected 'rooch', got '${ownerParsed.method}'`);
      }

      // Get PaymentRevenueHub object
      const revenueHub = await this.getRevenueHub(ownerParsed.identifier);
      if (!revenueHub) {
        this.logger.debug('Revenue hub not found for owner:', ownerDid);
        return BigInt(0);
      }

      // Query the revenue_by_source table
      const sourceFieldKey = deriveFieldKeyFromString(sourceType);
      const sourceFieldStates = await this.getClient().getFieldStates({
        objectId: revenueHub.revenue_by_source,
        fieldKey: [sourceFieldKey],
      });

      if (!sourceFieldStates || sourceFieldStates.length === 0 || !sourceFieldStates[0]) {
        // Source type not found
        this.logger.debug('Source type not found in revenue_by_source:', sourceType);
        return BigInt(0);
      }

      // Parse the source table and query for the specific asset
      const sourceTableId = extractTableIdFromField(sourceFieldStates[0].value);
      if (!sourceTableId) {
        return BigInt(0);
      }

      const assetFieldKey = deriveFieldKeyFromString(assetId);
      const assetFieldStates = await this.getClient().getFieldStates({
        objectId: sourceTableId,
        fieldKey: [assetFieldKey],
      });

      if (!assetFieldStates || assetFieldStates.length === 0 || !assetFieldStates[0]) {
        // Asset not found in source table
        this.logger.debug('Asset not found in source table:', assetId);
        return BigInt(0);
      }

      // Parse the u256 value
      const fieldValue = assetFieldStates[0].value;
      if (typeof fieldValue === 'string' && fieldValue.startsWith('0x')) {
        // Parse u256 from BCS data
        return parseU256FromBCS(fieldValue);
      } else {
        this.logger.warn('Unexpected field value format for revenue amount:', fieldValue);
        return BigInt(0);
      }
    } catch (error) {
      this.logger.error('Error getting revenue by source:', error);
      // If error is related to object not found, return 0
      if (
        error &&
        typeof error === 'object' &&
        'toString' in error &&
        error.toString().includes('not found')
      ) {
        return BigInt(0);
      }
      throw wrapUnknownError('getRevenueBySource', error);
    }
  }

  // -------- Helper Methods --------

  private async getRevenueHub(ownerAddress: string): Promise<PaymentRevenueHub | null> {
    try {
      const revenueHubId = calculateRevenueHubId(ownerAddress);
      const objectState = await this.getClient().getObjectStates({
        ids: [revenueHubId],
      });

      if (!objectState || objectState.length === 0 || !objectState[0]) {
        return null;
      }

      // Parse the PaymentRevenueHub from BCS data
      return parsePaymentRevenueHubData(objectState[0].value);
    } catch (error) {
      this.logger.debug('Error getting revenue hub:', error);
      return null;
    }
  }
}
