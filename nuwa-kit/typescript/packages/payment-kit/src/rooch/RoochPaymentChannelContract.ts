/**
 * Rooch Payment Channel Contract Implementation
 *
 * Implementation of IPaymentChannelContract for Rooch blockchain.
 * Provides concrete implementation of payment channel operations using Rooch SDK.
 */

import {
  RoochClient,
  Transaction,
  Args,
  Signer,
  EventView,
  getRoochNodeUrl,
  type NetworkType,
  Serializer,
  normalizeRoochAddress,
  sha3_256,
  toHEX,
  RoochAddress,
} from '@roochnetwork/rooch-sdk';
import { bcs } from '@roochnetwork/rooch-sdk';

import type {
  IPaymentChannelContract,
  OpenChannelParams,
  OpenChannelResult,
  OpenChannelWithSubChannelParams,
  AuthorizeSubChannelParams,
  TxResult,
  ClaimParams,
  ClaimResult,
  CloseParams,
  ChannelStatusParams,
  SubChannelParams,
  SubChannelInfo,
  DepositParams,
  WithdrawParams,
} from '../contracts/IPaymentChannelContract';
import type { AssetInfo, SignedSubRAV, SubRAV, ChannelInfo } from '../core/types';
import { SubRAVCodec } from '../core/SubRav';
import {
  calcChannelObjectId,
  normalizeAssetId,
  calculatePaymentHubId,
  deriveFieldKeyFromString,
  deriveCoinTypeFieldKey,
  parsePaymentChannelData,
  parsePaymentHubData,
  parseDynamicFieldSubChannel,
  parseDynamicFieldCoinStore,
  parseDynamicFieldU64,
  safeBalanceToBigint,
  PaymentChannelData,
  PaymentHub,
  SubChannel,
  DynamicField,
  CoinStoreFieldData,
} from './ChannelUtils';
import { DebugLogger, SignerInterface, DidAccountSigner, parseDid, isSignerInterface } from '@nuwa-ai/identity-kit';
import {
  badRequest,
  notFound,
  wrapUnknownError,
  mapTxFailureToPaymentKitError,
  internalError,
} from '../errors/RoochErrorMapper';

export interface RoochContractOptions {
  rpcUrl?: string;
  network?: 'local' | 'dev' | 'test' | 'main';
  contractAddress?: string;
  debug?: boolean;
}

// BCS Schema definitions for Rooch Move types
export const CloseProofSchema: any = bcs.struct('CloseProof', {
  vm_id_fragment: bcs.string(),
  accumulated_amount: bcs.u256(),
  nonce: bcs.u64(),
  sender_signature: bcs.vector(bcs.u8()),
});

export const CloseProofsSchema: any = bcs.struct('CloseProofs', {
  proofs: bcs.vector(CloseProofSchema),
});

export const CancelProofSchema: any = bcs.struct('CancelProof', {
  vm_id_fragment: bcs.string(),
  accumulated_amount: bcs.u256(),
  nonce: bcs.u64(),
});

export const CancelProofsSchema: any = bcs.struct('CancelProofs', {
  proofs: bcs.vector(CancelProofSchema),
});

// BCS Schema definitions are now in ChannelUtils.ts

const RGAS_CANONICAL_TAG: string =
  '0x0000000000000000000000000000000000000000000000000000000000000003::gas_coin::RGas';

/**
 * Default contract address for Rooch payment channels
 */
const DEFAULT_PAYMENT_CHANNEL_MODULE = '0x3::payment_channel';

/**
 * Rooch implementation of the Payment Channel Contract
 *
 * This implementation provides complete functionality for payment channels
 * using the Rooch blockchain and corresponding Move contracts.
 */
export class RoochPaymentChannelContract implements IPaymentChannelContract {
  private client: RoochClient;
  private contractAddress: string;
  private logger: DebugLogger;

  constructor(options: RoochContractOptions = {}) {
    const rpcUrl = options.rpcUrl || this.getDefaultRpcUrl(options.network || 'test');
    this.client = new RoochClient({ url: rpcUrl });
    this.contractAddress = options.contractAddress || DEFAULT_PAYMENT_CHANNEL_MODULE;
    this.logger = DebugLogger.get('RoochPaymentChannelContract');

    if (options.debug) {
      this.logger.setLevel('debug');
    }

    this.logger.debug(`RoochPaymentChannelContract initialized with rpcUrl: ${rpcUrl}`);
  }

  async openChannel(params: OpenChannelParams): Promise<OpenChannelResult> {
    try {
      this.logger.debug('Opening payment channel with params:', params);

      // Parse and validate DIDs first
      const payerParsed = parseDid(params.payerDid);
      const payeeParsed = parseDid(params.payeeDid);

      if (payerParsed.method !== 'rooch') {
        throw badRequest(`Invalid payer DID method: expected 'rooch', got '${payerParsed.method}'`);
      }
      if (payeeParsed.method !== 'rooch') {
        throw badRequest(`Invalid payee DID method: expected 'rooch', got '${payeeParsed.method}'`);
      }

      const signer = await this.convertSigner(params.signer);

      // Create transaction to open channel
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::open_channel_entry`,
        typeArgs: [params.assetId], // CoinType as type argument
        args: [Args.address(payeeParsed.identifier)],
        maxGas: 100000000,
      });

      this.logger.debug('Executing openChannel transaction');

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw mapTxFailureToPaymentKitError('openChannel', result.execution_info);
      }

      // Calculate the expected channel ID deterministically
      const channelId = calcChannelObjectId(
        payerParsed.identifier,
        payeeParsed.identifier,
        params.assetId
      );

      return {
        channelId,
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0), // TODO: Extract from result if available
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error opening channel:', error);
      throw wrapUnknownError('openChannel', error);
    }
  }

  async openChannelWithSubChannel(
    params: OpenChannelWithSubChannelParams
  ): Promise<OpenChannelResult> {
    try {
      this.logger.debug('Opening payment channel with sub-channel in one step:', params);

      // Parse and validate DIDs first
      const payerParsed = parseDid(params.payerDid);
      const payeeParsed = parseDid(params.payeeDid);

      if (payerParsed.method !== 'rooch') {
        throw badRequest(`Invalid payer DID method: expected 'rooch', got '${payerParsed.method}'`);
      }
      if (payeeParsed.method !== 'rooch') {
        throw badRequest(`Invalid payee DID method: expected 'rooch', got '${payeeParsed.method}'`);
      }

      const signer = await this.convertSigner(params.signer);

      // Create transaction to open channel with sub-channel
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::open_channel_with_sub_channel_entry`,
        typeArgs: [params.assetId], // CoinType as type argument
        args: [Args.address(payeeParsed.identifier), Args.string(params.vmIdFragment)],
        maxGas: 100000000,
      });

      this.logger.debug('Executing openChannelWithSubChannel transaction');

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw mapTxFailureToPaymentKitError('openChannelWithSubChannel', result.execution_info);
      }

      // Calculate the expected channel ID deterministically
      const channelId = calcChannelObjectId(
        payerParsed.identifier,
        payeeParsed.identifier,
        params.assetId
      );

      return {
        channelId,
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0), // TODO: Extract from result if available
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error opening channel with sub-channel:', error);
      throw wrapUnknownError('openChannelWithSubChannel', error);
    }
  }

  async authorizeSubChannel(params: AuthorizeSubChannelParams): Promise<TxResult> {
    try {
      this.logger.debug('Authorizing sub-channel with params:', params);

      const signer = await this.convertSigner(params.signer);

      // Create transaction to authorize sub-channel
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::authorize_sub_channel_entry`,
        args: [Args.objectId(params.channelId), Args.string(params.vmIdFragment)],
        maxGas: 100000000,
      });

      this.logger.debug('Executing authorizeSubChannel transaction');

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw mapTxFailureToPaymentKitError('authorizeSubChannel', result.execution_info);
      }

      return {
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0),
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error authorizing sub-channel:', error);
      throw wrapUnknownError('authorizeSubChannel', error);
    }
  }

  async claimFromChannel(params: ClaimParams): Promise<ClaimResult> {
    try {
      this.logger.debug('Claiming from channel with params:', params);

      const signer = await this.convertSigner(params.signer);
      const { subRav, signature } = params.signedSubRAV;

      // Create transaction to claim from channel
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::claim_from_channel_entry`,
        args: [
          Args.objectId(subRav.channelId),
          Args.string(subRav.vmIdFragment),
          Args.u256(subRav.accumulatedAmount),
          Args.u64(subRav.nonce),
          Args.vec('u8', Array.from(signature)),
        ],
        maxGas: 100000000,
      });

      this.logger.debug('Executing claimFromChannel transaction');

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw mapTxFailureToPaymentKitError('claimFromChannel', result.execution_info);
      }

      // Parse claimed amount from events
      const claimedAmount = this.parseClaimedAmountFromEvents(result.output?.events);

      return {
        txHash: result.execution_info.tx_hash || '',
        claimedAmount,
        blockHeight: BigInt(0),
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error claiming from channel:', error);
      throw wrapUnknownError('claimFromChannel', error);
    }
  }

  async closeChannel(params: CloseParams): Promise<TxResult> {
    try {
      this.logger.debug('Closing channel with params:', params);

      const signer = await this.convertSigner(params.signer);

      const transaction = this.createTransaction();

      if (params.cooperative && params.closeProofs) {
        // Cooperative close with proofs
        const serializedProofs = CloseProofsSchema.serialize(params.closeProofs).toBytes();

        transaction.callFunction({
          target: `${this.contractAddress}::close_channel_entry`,
          args: [Args.objectId(params.channelId), Args.vec('u8', serializedProofs)],
          maxGas: 100000000,
        });
      } else {
        // Force close (initiate cancellation)
        transaction.callFunction({
          target: `${this.contractAddress}::initiate_cancellation_entry`,
          args: [Args.objectId(params.channelId)],
          maxGas: 100000000,
        });
      }

      this.logger.debug('Executing closeChannel transaction');

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw mapTxFailureToPaymentKitError('closeChannel', result.execution_info);
      }

      return {
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0),
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error closing channel:', error);
      throw wrapUnknownError('closeChannel', error);
    }
  }

  async getChannelStatus(params: ChannelStatusParams): Promise<ChannelInfo> {
    try {
      this.logger.debug('Getting channel status for channel:', params.channelId);

      // Get channel state from blockchain
      const channelObject = await this.client.getObjectStates({
        ids: [params.channelId],
      });

      if (!channelObject || channelObject.length === 0 || !channelObject[0]) {
        throw notFound(`Channel ${params.channelId} not found`);
      }

      const channelState = channelObject[0];

      // Parse channel data from BCS - no need for view functions anymore
      const channelData = parsePaymentChannelData(channelState.value);

      // Convert status number to string
      const statusString = this.convertChannelStatus(channelData.status);

      const channel_sender = new RoochAddress(channelData.sender);
      const channel_receiver = new RoochAddress(channelData.receiver);
      return {
        channelId: params.channelId,
        payerDid: `did:rooch:${channel_sender.toBech32Address()}`,
        payeeDid: `did:rooch:${channel_receiver.toBech32Address()}`,
        assetId: channelData.coin_type,
        epoch: channelData.channel_epoch,
        status: statusString,
      };
    } catch (error) {
      this.logger.error('Error getting channel status:', error);
      throw wrapUnknownError('getChannelStatus', error);
    }
  }

  async getSubChannel(params: SubChannelParams): Promise<SubChannelInfo> {
    try {
      this.logger.debug('Getting sub-channel info for:', params);

      // First get the channel to obtain the sub_channels table ID
      const channelObject = await this.client.getObjectStates({
        ids: [params.channelId],
      });

      if (!channelObject || channelObject.length === 0 || !channelObject[0]) {
        throw notFound(`Channel ${params.channelId} not found`);
      }

      const channelData = parsePaymentChannelData(channelObject[0].value);

      // Get the sub-channel data from the sub_channels Table
      const subChannelData = await this.getSubChannelData(
        channelData.sub_channels,
        params.vmIdFragment
      );

      if (!subChannelData) {
        throw notFound(
          `Sub-channel ${params.vmIdFragment} not found in channel ${params.channelId}`
        );
      }

      return {
        channelId: params.channelId,
        epoch: channelData.channel_epoch,
        vmIdFragment: params.vmIdFragment,
        publicKey: subChannelData.pk_multibase,
        methodType: subChannelData.method_type,
        lastClaimedAmount: subChannelData.last_claimed_amount,
        lastConfirmedNonce: subChannelData.last_confirmed_nonce,
      };
    } catch (error) {
      this.logger.error('Error getting sub-channel info:', error);
      throw wrapUnknownError('getSubChannel', error);
    }
  }

  async getAssetInfo(assetId: string): Promise<AssetInfo> {
    this.logger.debug('Getting asset info for:', assetId);
    let canonicalAssetId = normalizeAssetId(assetId);
    // TODO: Add support for other assets
    if (canonicalAssetId === RGAS_CANONICAL_TAG) {
      let assetInfo: AssetInfo = {
        assetId: canonicalAssetId,
        symbol: this.parseAssetSymbol(assetId),
        decimals: 8,
      };
      return assetInfo;
    }
    throw badRequest(`Unsupported asset type: ${assetId}`);
  }

  async getAssetPrice(assetId: string): Promise<bigint> {
    try {
      this.logger.debug('Getting asset price for:', assetId);

      // Normalize asset ID to canonical string
      const canonicalAssetId = normalizeAssetId(assetId);

      //Currently only support RGas
      if (canonicalAssetId === RGAS_CANONICAL_TAG) {
        // RGas pricing calculation:
        // - 1 RGas = 0.01 USD
        // - RGas has 8 decimals, so 1 RGas = 10^8 base units
        // - 1 USD = 1,000,000,000,000 pUSD (pico-USD, not micro-USD!)
        // - So 1 RGas = 0.01 * 1,000,000,000,000 = 10,000,000,000 pUSD
        // - Therefore: 1 base unit = 10,000,000,000 pUSD / 10^8 = 100 pUSD
        return BigInt(100); // 100 pUSD per smallest RGas unit
      }

      // Unknown asset type
      throw badRequest(`Unsupported asset type: ${assetId}`);
    } catch (error) {
      this.logger.error('Error getting asset price:', error);
      throw wrapUnknownError('getAssetPrice', error);
    }
  }

  async getChainId(): Promise<bigint> {
    try {
      this.logger.debug('Getting chain ID');

      // Use RoochClient's getChainId method
      const chainId = await this.client.getChainId();
      return BigInt(chainId);
    } catch (error) {
      this.logger.error('Error getting chain ID:', error);
      throw wrapUnknownError('getChainId', error);
    }
  }

  async depositToHub(params: DepositParams): Promise<TxResult> {
    try {
      this.logger.debug('Depositing to payment hub with params:', params);

      // Parse and validate owner DID
      const ownerParsed = parseDid(params.ownerDid);
      if (ownerParsed.method !== 'rooch') {
        throw badRequest(`Invalid owner DID method: expected 'rooch', got '${ownerParsed.method}'`);
      }

      const signer = await this.convertSigner(params.signer);

      // Create transaction to deposit to hub
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::deposit_to_hub_entry`,
        typeArgs: [params.assetId], // CoinType as type argument
        args: [Args.address(ownerParsed.identifier), Args.u256(params.amount)],
        maxGas: 100000000,
      });

      this.logger.debug('Executing depositToHub transaction');

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw mapTxFailureToPaymentKitError('depositToHub', result.execution_info);
      }

      return {
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0),
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error depositing to hub:', error);
      throw wrapUnknownError('depositToHub', error);
    }
  }

  async withdrawFromHub(params: WithdrawParams): Promise<TxResult> {
    try {
      this.logger.debug('Withdrawing from payment hub with params:', params);

      // Parse and validate owner DID
      const ownerParsed = parseDid(params.ownerDid);
      if (ownerParsed.method !== 'rooch') {
        throw badRequest(`Invalid owner DID method: expected 'rooch', got '${ownerParsed.method}'`);
      }

      const signer = await this.convertSigner(params.signer);

      // Create transaction to withdraw from hub
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::withdraw_from_hub_entry`,
        typeArgs: [params.assetId], // CoinType as type argument
        args: [Args.u256(params.amount)],
        maxGas: 100000000,
      });

      this.logger.debug('Executing withdrawFromHub transaction');

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw mapTxFailureToPaymentKitError('withdrawFromHub', result.execution_info);
      }

      return {
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0),
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error withdrawing from hub:', error);
      throw wrapUnknownError('withdrawFromHub', error);
    }
  }

  async getHubBalance(ownerDid: string, assetId: string): Promise<bigint> {
    try {
      this.logger.debug('Getting hub balance for DID:', ownerDid, 'asset:', assetId);

      // Get PaymentHub object
      const paymentHub = await this.getPaymentHub(ownerDid);
      if (!paymentHub) {
        this.logger.debug('PaymentHub not found for owner:', ownerDid);
        return BigInt(0);
      }

      this.logger.debug('MultiCoinStore ID extracted:', paymentHub.multi_coin_store);
      // Query the specific field for this coin type in the multi_coin_store
      const fieldKey = deriveCoinTypeFieldKey(assetId);
      const fieldStates = await this.client.getFieldStates({
        objectId: paymentHub.multi_coin_store,
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
        // Parse BCS bytes using DynamicFieldCoinStoreSchema
        try {
          this.logger.debug(
            'Parsing DynamicField<String, CoinStoreField> from BCS hex:',
            fieldValue
          );
          const parsed = parseDynamicFieldCoinStore(fieldValue);

          this.logger.debug('Parsed DynamicField:', parsed);

          // Extract balance from the parsed CoinStoreField and ensure it's bigint
          return safeBalanceToBigint(parsed.value.balance.value);
        } catch (parseError) {
          this.logger.warn('Failed to parse CoinStoreField BCS data:', parseError);
          return BigInt(0);
        }
      } else if (fieldValue && typeof fieldValue === 'object' && 'value' in fieldValue) {
        // If already parsed
        const coinStoreField = (fieldValue as any).value;
        if (coinStoreField && typeof coinStoreField === 'object' && 'balance' in coinStoreField) {
          return BigInt(coinStoreField.balance as string);
        }
      }

      this.logger.warn('Could not parse balance from field state');
      return BigInt(0);
    } catch (error) {
      this.logger.error('Error getting hub balance:', error);
      // Return 0 instead of throwing for balance queries
      return BigInt(0);
    }
  }

  async getAllHubBalances(ownerDid: string): Promise<Record<string, bigint>> {
    try {
      this.logger.debug('Getting all hub balances for DID:', ownerDid);

      // Get PaymentHub object
      const paymentHub = await this.getPaymentHub(ownerDid);
      if (!paymentHub) {
        this.logger.debug('PaymentHub not found for owner:', ownerDid);
        return {};
      }

      this.logger.debug(
        'MultiCoinStore ID extracted for all balances:',
        paymentHub.multi_coin_store
      );

      // List all field states in multi_coin_store to get all coin types and balances
      const balances: Record<string, bigint> = {};
      let cursor = null;
      // We only need to get the first 100 fields for now
      const pageSize = 100;

      // while (true) {
      const fieldStates = await this.client.listFieldStates({
        objectId: paymentHub.multi_coin_store,
        cursor,
        limit: pageSize.toString(),
      });

      if (!fieldStates || !fieldStates.data) {
        return balances;
      }

      for (const state of fieldStates.data) {
        try {
          // Parse DynamicField<String, CoinStoreField>
          const fieldValue = state.state.value;

          if (typeof fieldValue === 'string' && fieldValue.startsWith('0x')) {
            // Parse BCS bytes using DynamicFieldCoinStoreSchema
            try {
              this.logger.debug(
                'Parsing DynamicField<String, CoinStoreField> from BCS hex:',
                fieldValue
              );
              const parsed = parseDynamicFieldCoinStore(fieldValue);

              this.logger.debug('Parsed DynamicField:', parsed);

              // Extract coin type and balance from the parsed data
              const coinType = parsed.name;
              const balance = safeBalanceToBigint(parsed.value.balance.value);

              if (coinType && balance > 0) {
                balances[coinType] = balance;
              }
            } catch (parseError) {
              this.logger.warn('Failed to parse CoinStoreField BCS data:', parseError);
              continue;
            }
          } else {
            this.logger.warn('Could not parse balance from field state');
            throw new Error('Could not parse balance from field state');
          }
        } catch (parseError) {
          this.logger.warn('Failed to parse field state for balance:', parseError);
          continue;
        }
      }

      // if (!fieldStates.has_next_page) {
      //   break;
      // }
      // }
      // cursor = fieldStates.next_cursor;
      // }

      return balances;
    } catch (error) {
      this.logger.error('Error getting all hub balances:', error);
      // Return empty object instead of throwing
      return {};
    }
  }

  async getActiveChannelsCounts(ownerDid: string): Promise<Record<string, number>> {
    try {
      this.logger.debug('Getting active channels counts for DID:', ownerDid);

      // Get PaymentHub object
      const paymentHub = await this.getPaymentHub(ownerDid);
      if (!paymentHub) {
        this.logger.debug('PaymentHub not found for owner:', ownerDid);
        return {};
      }

      this.logger.debug('Active channels table ID:', paymentHub.active_channels);

      // List all field states in active_channels table to get all coin types and their counts
      const channelCounts: Record<string, number> = {};
      let cursor = null;
      const pageSize = 100;

      const fieldStates = await this.client.listFieldStates({
        objectId: paymentHub.active_channels,
        cursor,
        limit: pageSize.toString(),
      });

      if (!fieldStates || !fieldStates.data) {
        return channelCounts;
      }

      for (const state of fieldStates.data) {
        try {
          // Parse DynamicField<String, u64> for active channels counts
          const fieldValue = state.state.value;

          // Parse BCS bytes using DynamicFieldU64Schema
          try {
            this.logger.debug('Parsing DynamicField<String, u64> from BCS hex:', fieldValue);
            const parsed = parseDynamicFieldU64(fieldValue);

            this.logger.debug('Parsed DynamicField:', parsed);

            // Extract coin type and count from the parsed data
            const coinType = parsed.name;
            const count = parsed.value;

            if (coinType && count > 0) {
              channelCounts[coinType] = count;
            }
          } catch (parseError) {
            this.logger.warn('Failed to parse u64 BCS data:', parseError);
            continue;
          }
        } catch (parseError) {
          this.logger.warn('Failed to parse field state for active channels count:', parseError);
          continue;
        }
      }

      // if (!fieldStates.has_next_page) {
      //   break;
      // }
      // cursor = fieldStates.next_cursor;

      return channelCounts;
    } catch (error) {
      this.logger.error('Error getting active channels counts:', error);
      // Return empty object instead of throwing
      return {};
    }
  }

  // PaymentHub ID calculation and field key derivation are now in ChannelUtils.ts

  // Get PaymentHub object for a given owner DID
  private async getPaymentHub(ownerDid: string): Promise<PaymentHub | null> {
    try {
      this.logger.debug('Getting PaymentHub for DID:', ownerDid);

      // Parse and validate owner DID
      const ownerParsed = parseDid(ownerDid);
      if (ownerParsed.method !== 'rooch') {
        throw new Error(`Invalid owner DID method: expected 'rooch', got '${ownerParsed.method}'`);
      }

      // Calculate hub ID
      const hubId = calculatePaymentHubId(ownerParsed.identifier);

      // Get PaymentHub object state
      const hubObjectViews = await this.client.getObjectStates({ ids: [hubId] });

      if (!hubObjectViews || hubObjectViews.length === 0 || !hubObjectViews[0]) {
        this.logger.debug('PaymentHub not found for owner:', ownerDid);
        return null;
      }

      const hubObjectView = hubObjectViews[0];

      // Parse PaymentHub using BCS deserialization
      try {
        const hubValue = hubObjectView.value;

        if (typeof hubValue === 'string' && hubValue.startsWith('0x')) {
          // Parse BCS bytes using PaymentHubSchema
          this.logger.debug('Parsing PaymentHub from BCS hex:', hubValue);
          const parsed = parsePaymentHubData(hubValue);

          this.logger.debug('Parsed PaymentHub:', parsed);

          return parsed;
        } else {
          throw new Error('Unexpected PaymentHub value format');
        }
      } catch (parseError) {
        this.logger.error('Failed to parse PaymentHub object:', parseError);
        return null;
      }
    } catch (error) {
      this.logger.error('Error getting PaymentHub:', error);
      return null;
    }
  }

  // Helper methods
  private async convertSigner(signer: SignerInterface | Signer): Promise<Signer> {
    // If it implements SignerInterface, convert it to DidAccountSigner
    if (isSignerInterface(signer)) {
      return DidAccountSigner.create(signer);
    }
    // Fallback: assume it's Signer
    return signer;
  }

  private createTransaction(): Transaction {
    return new Transaction();
  }

  private getDefaultRpcUrl(network: string): string {
    // Map our network names to Rooch SDK network names
    const networkMap: { [key: string]: string } = {
      local: 'localnet',
      dev: 'devnet',
      test: 'testnet',
      main: 'mainnet',
    };

    const roochNetwork = networkMap[network] || network;
    return getRoochNodeUrl(roochNetwork as any);
  }

  private parseChannelIdFromEvents(events?: EventView[]): string {
    if (!events) {
      throw internalError('No events found to parse channel ID');
    }

    for (const event of events) {
      if (event.event_type.includes('PaymentChannelOpenedEvent')) {
        // Parse the channel_id from event data using BCS
        try {
          // The event data contains the channel_id field
          const eventDataHex = event.event_data.startsWith('0x')
            ? event.event_data.slice(2)
            : event.event_data;
          const eventDataBytes = new Uint8Array(
            eventDataHex.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
          );

          // For now, extract channel_id manually - this would need proper BCS schema
          // The PaymentChannelOpenedEvent should contain channel_id as first field
          return event.event_data; // Return the raw event data for now
        } catch (error) {
          this.logger.error('Failed to parse channel ID from event:', error);
          throw internalError(`Failed to parse channel ID from event: ${error}`);
        }
      }
    }

    throw internalError('PaymentChannelOpenedEvent not found in transaction events');
  }

  private parseClaimedAmountFromEvents(events?: EventView[]): bigint {
    if (!events) {
      return BigInt(0);
    }

    for (const event of events) {
      if (event.event_type.includes('ChannelClaimedEvent')) {
        // Parse the amount from event data
        // TODO: Implement proper BCS event parsing
        return BigInt(0);
      }
    }

    return BigInt(0);
  }

  // parseChannelData method moved to ChannelUtils.parsePaymentChannelData

  /**
   * Get sub-channel data by VM ID fragment
   * @param subChannelsTableId The ObjectID of the sub_channels Table
   * @param vmIdFragment The VM ID fragment to query
   * @returns SubChannel data or null if not found
   */
  private async getSubChannelData(
    subChannelsTableId: string,
    vmIdFragment: string
  ): Promise<SubChannel | null> {
    try {
      this.logger.debug(
        `Getting sub-channel data for: ${vmIdFragment} from table: ${subChannelsTableId}`
      );

      // Create field key from vm_id_fragment - this follows Rooch's FieldKey::derive_from_string logic
      const fieldKey = deriveFieldKeyFromString(vmIdFragment);

      // Query specific field by key using getFieldStates API
      const fieldStates = await this.client.getFieldStates({
        objectId: subChannelsTableId,
        fieldKey: [fieldKey],
      });

      if (!fieldStates || fieldStates.length === 0 || !fieldStates[0]) {
        this.logger.debug(`Sub-channel ${vmIdFragment} not found in table ${subChannelsTableId}`);
        return null;
      }

      const fieldState = fieldStates[0];

      // Parse the DynamicField<String, SubChannel> from BCS
      const dynamicField = parseDynamicFieldSubChannel(fieldState.value);

      return dynamicField.value;
    } catch (error) {
      this.logger.error('Error getting sub-channel data:', error);
      return null;
    }
  }

  private convertChannelStatus(status: number): 'active' | 'closing' | 'closed' {
    switch (status) {
      case 0:
        return 'active';
      case 1:
        return 'closing';
      case 2:
        return 'closed';
      default:
        return 'closed';
    }
  }

  private parseAssetSymbol(assetId: string): string {
    // Extract symbol from asset ID
    // Example: '0x3::gas_coin::RGas' -> 'RGas'
    const parts = assetId.split('::');
    return parts[parts.length - 1] || 'UNKNOWN';
  }
}
