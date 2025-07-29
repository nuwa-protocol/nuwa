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
  DepositToHubParams,
} from '../contracts/IPaymentChannelContract';
import type { 
  AssetInfo,
  SignedSubRAV,
  SubRAV,
  ChannelInfo,
} from '../core/types';
import { SubRAVCodec } from '../core/SubRav';
import { DebugLogger, SignerInterface, DidAccountSigner, parseDid } from '@nuwa-ai/identity-kit';

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

/**
 * BCS Schema definitions for PaymentChannel related structs
 * These must match the Move contract definitions exactly
 */

// CancellationInfo struct
export interface CancellationInfo {
  initiated_time: bigint;
  pending_amount: bigint;
}

export const CancellationInfoSchema: any = bcs.struct('CancellationInfo', {
  initiated_time: bcs.u64(),
  pending_amount: bcs.u256(),
});

// SubChannel struct  
export interface SubChannel {
  pk_multibase: string;
  method_type: string;
  last_claimed_amount: bigint;
  last_confirmed_nonce: bigint;
}

export const SubChannelSchema: any = bcs.struct('SubChannel', {
  pk_multibase: bcs.string(),
  method_type: bcs.string(),
  last_claimed_amount: bcs.u256(),
  last_confirmed_nonce: bcs.u64(),
});

// PaymentChannel struct - matches Move contract exactly
export interface PaymentChannelData {
  sender: string;
  receiver: string;
  coin_type: string;
  sub_channels: string; // ObjectID as hex string (Table handle)
  status: number;
  channel_epoch: bigint;
  cancellation_info: CancellationInfo | null;
}

export const PaymentChannelSchema: any = bcs.struct('PaymentChannel', {
  sender: bcs.Address,
  receiver: bcs.Address,
  coin_type: bcs.string(),
  sub_channels: bcs.ObjectId, // Table<String, SubChannel> stored as ObjectID
  status: bcs.u8(),
  channel_epoch: bcs.u64(),
  cancellation_info: bcs.option(CancellationInfoSchema),
});

// PaymentHub struct - for future reference
export interface PaymentHubData {
  multi_coin_store: string; // ObjectID as hex string
  active_channels: string; // ObjectID as hex string (Table handle)
}

export const PaymentHubSchema: any = bcs.struct('PaymentHub', {
  multi_coin_store: bcs.ObjectId,
  active_channels: bcs.ObjectId, // Table<String, u64>
});

// DynamicField struct for parsing Table fields
export interface DynamicField<K, V> {
  name: K;
  value: V;
}

export const DynamicFieldSubChannelSchema: any = bcs.struct('DynamicField', {
  name: bcs.string(),
  value: SubChannelSchema,
});

export interface ChannelKey {
  sender: string;
  receiver: string;
  coin_type: string;
}

/**
 * BCS Schema for ChannelKey - matches Move contract exactly
 * 
 * Note: This uses bcs.Address which is the correct type for Move address,
 * but in test environments, the Rooch SDK may have dependency issues 
 * (e.g., import_bs58check.default.decode is not a function).
 * The implementation is correct and will work in production environments.
 */
export const ChannelKeySchema: any = bcs.struct('ChannelKey', {
  sender: bcs.Address,
  receiver: bcs.Address,
  coin_type: bcs.string(),
});

const RGAS_CANONICAL_TAG: string = '0x0000000000000000000000000000000000000000000000000000000000000003::gas_coin::RGas';

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
        throw new Error(`Invalid payer DID method: expected 'rooch', got '${payerParsed.method}'`);
      }
      if (payeeParsed.method !== 'rooch') {
        throw new Error(`Invalid payee DID method: expected 'rooch', got '${payeeParsed.method}'`);
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
        throw new Error(`Transaction failed: ${JSON.stringify(result.execution_info)}`);
      }

      // Calculate the expected channel ID deterministically
      const channelId = this.calcChannelObjectId(payerParsed.identifier, payeeParsed.identifier, params.assetId);
      
      return {
        channelId,
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0), // TODO: Extract from result if available
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error opening channel:', error);
      throw error;
    }
  }

  async openChannelWithSubChannel(params: OpenChannelWithSubChannelParams): Promise<OpenChannelResult> {
    try {
      this.logger.debug('Opening payment channel with sub-channel in one step:', params);
      
      // Parse and validate DIDs first
      const payerParsed = parseDid(params.payerDid);
      const payeeParsed = parseDid(params.payeeDid);
      
      if (payerParsed.method !== 'rooch') {
        throw new Error(`Invalid payer DID method: expected 'rooch', got '${payerParsed.method}'`);
      }
      if (payeeParsed.method !== 'rooch') {
        throw new Error(`Invalid payee DID method: expected 'rooch', got '${payeeParsed.method}'`);
      }
      
      const signer = await this.convertSigner(params.signer);
      
      // Create transaction to open channel with sub-channel
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::open_channel_with_sub_channel_entry`,
        typeArgs: [params.assetId], // CoinType as type argument
        args: [
          Args.address(payeeParsed.identifier),
          Args.string(params.vmIdFragment),
        ],
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
        throw new Error(`Transaction failed: ${JSON.stringify(result.execution_info)}`);
      }

      // Calculate the expected channel ID deterministically
      const channelId = this.calcChannelObjectId(payerParsed.identifier, payeeParsed.identifier, params.assetId);
      
      return {
        channelId,
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0), // TODO: Extract from result if available
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error opening channel with sub-channel:', error);
      throw error;
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
        args: [
          Args.objectId(params.channelId),
          Args.string(params.vmIdFragment),
        ],
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
        throw new Error(`Transaction failed: ${JSON.stringify(result.execution_info)}`);
      }

      return {
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0),
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error authorizing sub-channel:', error);
      throw error;
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
        throw new Error(`Transaction failed: ${JSON.stringify(result.execution_info)}`);
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
      throw error;
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
          args: [
            Args.objectId(params.channelId),
            Args.vec('u8', serializedProofs),
          ],
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
        throw new Error(`Transaction failed: ${JSON.stringify(result.execution_info)}`);
      }

      return {
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0),
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error closing channel:', error);
      throw error;
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
        throw new Error(`Channel ${params.channelId} not found`);
      }

      const channelState = channelObject[0];
      
      // Parse channel data from BCS - no need for view functions anymore
      const channelData = this.parseChannelData(channelState.value);
      
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
      throw error;
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
        throw new Error(`Channel ${params.channelId} not found`);
      }

      const channelData = this.parseChannelData(channelObject[0].value);
      
      // Get the sub-channel data from the sub_channels Table
      const subChannelData = await this.getSubChannelData(
        channelData.sub_channels,
        params.vmIdFragment
      );

      if (!subChannelData) {
        throw new Error(`Sub-channel ${params.vmIdFragment} not found in channel ${params.channelId}`);
      }

      return {
        vmIdFragment: params.vmIdFragment,
        publicKey: subChannelData.pk_multibase,
        methodType: subChannelData.method_type,
        lastClaimedAmount: subChannelData.last_claimed_amount,
        lastConfirmedNonce: subChannelData.last_confirmed_nonce,
      };
    } catch (error) {
      this.logger.error('Error getting sub-channel info:', error);
      throw error;
    }
  }

  async getAssetInfo(assetId: string): Promise<AssetInfo> {
    this.logger.debug('Getting asset info for:', assetId);
    let canonicalAssetId = this.normalizeAssetId(assetId);
    // TODO: Add support for other assets
    if (canonicalAssetId === RGAS_CANONICAL_TAG) {
      let assetInfo: AssetInfo = {
        assetId: canonicalAssetId,
        symbol: this.parseAssetSymbol(assetId),
        decimals: 8,
      };
      return assetInfo;
    }
    throw new Error(`Unsupported asset type: ${assetId}`);
  }

  async getAssetPrice(assetId: string): Promise<bigint> {
    try {
      this.logger.debug('Getting asset price for:', assetId);
      
      // Normalize asset ID to canonical string
      const canonicalAssetId = this.normalizeAssetId(assetId);
      
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
      throw new Error(`Unsupported asset type: ${assetId}`);
    } catch (error) {
      this.logger.error('Error getting asset price:', error);
      throw error;
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
      throw error;
    }
  }

  async depositToHub(params: DepositToHubParams): Promise<TxResult> {
    try {
      this.logger.debug('Depositing to payment hub with params:', params);
      
      // Parse and validate target DID
      const targetParsed = parseDid(params.targetDid);
      if (targetParsed.method !== 'rooch') {
        throw new Error(`Invalid target DID method: expected 'rooch', got '${targetParsed.method}'`);
      }
      
      const signer = await this.convertSigner(params.signer);
      
      // Create transaction to deposit to hub
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::deposit_to_hub_entry`,
        typeArgs: [params.assetId], // CoinType as type argument
        args: [
          Args.address(targetParsed.identifier),
          Args.u256(params.amount),
        ],
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
        throw new Error(`Transaction failed: ${JSON.stringify(result.execution_info)}`);
      }

      return {
        txHash: result.execution_info.tx_hash || '',
        blockHeight: BigInt(0),
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error depositing to hub:', error);
      throw error;
    }
  }

  // Helper methods
  private async convertSigner(signer: SignerInterface): Promise<Signer> {
    if (signer instanceof Signer) {
      return signer;
    }
    return DidAccountSigner.create(signer);
  }

  /**
   * Calculate channel object ID using the same logic as Move contract
   * 
   * This replicates object::custom_object_id<ChannelKey, PaymentChannel>(key)
   * from payment_channel.move using proper BCS serialization.
   * 
   * @param senderAddress - Sender address
   * @param receiverAddress - Receiver address
   * @param coinType - Coin type string
   * @returns Channel object ID as hex string
   */
  private calcChannelObjectId(senderAddress: string, receiverAddress: string, coinType: string): string {
    
    let coin_type = this.normalizeAssetId(coinType);
    this.logger.debug('Calculating channel object ID for:', { senderAddress, receiverAddress, coin_type });
    
    // Create ChannelKey struct - this must match the Move struct exactly
    const channelKey: ChannelKey  = {
      sender: senderAddress,
      receiver: receiverAddress,
      coin_type: coin_type,
    };
    
    // Create PaymentChannel struct tag  
    const paymentChannelStructTag = {
      address: '0x3',
      module: 'payment_channel', 
      name: 'PaymentChannel',
      type_params: [],
    };
    
    // Implement custom_object_id logic:
    // 1. BCS serialize the ChannelKey struct (not JSON!)
    // 2. Append the PaymentChannel struct tag canonical string as bytes
    // 3. SHA3-256 hash the combined bytes
    // 4. Return as ObjectID
    
    // BCS serialize the ChannelKey
    const idBytes = ChannelKeySchema.serialize(channelKey).toBytes();
    
    // Get PaymentChannel struct tag canonical string as bytes
    const typeBytes = new TextEncoder().encode(Serializer.structTagToCanonicalString(paymentChannelStructTag));
    
    // Concatenate: bcs(ChannelKey) + canonical_string(PaymentChannel)
    const bytes = new Uint8Array(idBytes.length + typeBytes.length);
    bytes.set(idBytes);
    bytes.set(typeBytes, idBytes.length);
    
    // SHA3-256 hash
    const hash = sha3_256(bytes);
    return `0x${toHEX(hash)}`;
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
      throw new Error('No events found to parse channel ID');
    }

    for (const event of events) {
      if (event.event_type.includes('PaymentChannelOpenedEvent')) {
        // Parse the channel_id from event data using BCS
        try {
          // The event data contains the channel_id field
          const eventDataHex = event.event_data.startsWith('0x') ? 
            event.event_data.slice(2) : event.event_data;
          const eventDataBytes = new Uint8Array(
            eventDataHex.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
          );
          
          // For now, extract channel_id manually - this would need proper BCS schema
          // The PaymentChannelOpenedEvent should contain channel_id as first field
          return event.event_data; // Return the raw event data for now
        } catch (error) {
          this.logger.error('Failed to parse channel ID from event:', error);
          throw new Error(`Failed to parse channel ID from event: ${error}`);
        }
      }
    }

    throw new Error('PaymentChannelOpenedEvent not found in transaction events');
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

  /**
   * Parse PaymentChannel data from BCS hex string
   * @param value BCS encoded hex string from object state
   * @returns Parsed PaymentChannelData
   */
  private parseChannelData(value: string): PaymentChannelData {
    try {
      // Remove '0x' prefix if present
      const bcsHex = value.startsWith('0x') ? value.slice(2) : value;
      const bcsBytes = new Uint8Array(
        bcsHex.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
      );
      
      // Parse using BCS schema
      const parsed = PaymentChannelSchema.parse(bcsBytes);
      
      return {
        sender: parsed.sender,
        receiver: parsed.receiver,
        coin_type: parsed.coin_type,
        sub_channels: parsed.sub_channels,
        status: parsed.status,
        channel_epoch: BigInt(parsed.channel_epoch),
        cancellation_info: parsed.cancellation_info ? {
          initiated_time: BigInt(parsed.cancellation_info.initiated_time),
          pending_amount: BigInt(parsed.cancellation_info.pending_amount),
        } : null,
      };
    } catch (error) {
      this.logger.error('Error parsing PaymentChannel data:', error);
      throw new Error(`Failed to parse PaymentChannel data: ${error}`);
    }
  }

  /**
   * Get sub-channel data by VM ID fragment
   * @param subChannelsTableId The ObjectID of the sub_channels Table
   * @param vmIdFragment The VM ID fragment to query
   * @returns SubChannel data or null if not found
   */
  private async getSubChannelData(subChannelsTableId: string, vmIdFragment: string): Promise<SubChannel | null> {
    try {
      this.logger.debug(`Getting sub-channel data for: ${vmIdFragment} from table: ${subChannelsTableId}`);
      
      // Create field key from vm_id_fragment - this follows Rooch's FieldKey::derive_from_string logic
      const fieldKey = this.deriveFieldKeyFromString(vmIdFragment);
      
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
      const dynamicField = this.parseDynamicFieldSubChannel(fieldState.value);
      
      return dynamicField.value;
    } catch (error) {
      this.logger.error('Error getting sub-channel data:', error);
      return null;
    }
  }

  private convertChannelStatus(status: number): 'active' | 'closing' | 'closed' {
    switch (status) {
      case 0: return 'active';
      case 1: return 'closing';
      case 2: return 'closed';
      default: return 'closed';
    }
  }

  private parseAssetSymbol(assetId: string): string {
    // Extract symbol from asset ID
    // Example: '0x3::gas_coin::RGas' -> 'RGas'
    const parts = assetId.split('::');
    return parts[parts.length - 1] || 'UNKNOWN';
  }



  /**
   * Parse asset ID string to StructTag
   * @param assetId Asset ID string (e.g., "0x3::gas_coin::RGas" or "3::gas_coin::RGas")
   * @returns Parsed StructTag object
   */
  private parseAssetIdToStructTag(assetId: string): any {
    try {
      // Use Rooch SDK's built-in parser with address normalization
      const typeTag = Serializer.typeTagParseFromStr(assetId, true);
      
      // Ensure it's a struct type (not a primitive type)
      if (!('struct' in typeTag)) {
        throw new Error(`Asset ID must be a struct type, got: ${assetId}`);
      }
      
      return typeTag.struct;
    } catch (error) {
      this.logger.error('Error parsing asset ID to struct tag:', error);
      throw new Error(`Failed to parse asset ID: ${assetId}`);
    }
  }

  public normalizeAssetId(assetId: string): string {
    let coinTypeTag = this.parseAssetIdToStructTag(assetId);
    let canonicalString = this.structTagToCanonicalString(coinTypeTag);
    return canonicalString;
  }

  /**
   * Convert StructTag to canonical string representation
   * @param structTag StructTag object
   * @returns Canonical string representation
   */
  private structTagToCanonicalString(structTag: any): string {
    try {
      return Serializer.structTagToCanonicalString(structTag);
    } catch (error) {
      throw new Error(`Failed to convert struct tag to canonical string: ${error}`);
    }
  }

  /**
   * TODO: migrate this function to rooch-sdk
   * Derive a FieldKey from a string VM ID fragment.
   * This follows Rooch's FieldKey::derive_from_string logic:
   * hash(bcs(MoveString) || canonical_type_tag_string)
   * @param vmIdFragment The VM ID fragment string
   * @returns FieldKey as hex string
   */
  private deriveFieldKeyFromString(vmIdFragment: string): string {
    this.logger.debug(`Deriving FieldKey from VM ID fragment: ${vmIdFragment}`);
    
    try {
      // BCS serialize the vmIdFragment as MoveString using Rooch's bcs library
      const keyBytes = bcs.string().serialize(vmIdFragment).toBytes();
      
      // Get the canonical type tag string for String type
      // Must use full canonical address format (32-byte) as specified in Rust implementation
      const stringTypeTag = "0x0000000000000000000000000000000000000000000000000000000000000001::string::String";
      const typeTagBytes = new TextEncoder().encode(stringTypeTag);
      
      // Concatenate: bcs(key) + canonical_type_tag_string
      const combinedBytes = new Uint8Array(keyBytes.length + typeTagBytes.length);
      combinedBytes.set(keyBytes);
      combinedBytes.set(typeTagBytes, keyBytes.length);
      
      // SHA3-256 hash
      const hash = sha3_256(combinedBytes);
      return `0x${toHEX(hash)}`;
    } catch (error) {
      this.logger.error('Error deriving field key:', error);
      throw new Error(`Failed to derive field key: ${error}`);
    }
  }

  /**
   * Parse a DynamicField<String, SubChannel> from BCS hex string.
   * @param value BCS encoded hex string from a DynamicField
   * @returns Parsed DynamicField<String, SubChannel> object
   */
  private parseDynamicFieldSubChannel(value: string): DynamicField<string, SubChannel> {
    this.logger.debug(`Parsing DynamicField<String, SubChannel> from BCS hex: ${value}`);
    
    try {
      // Remove '0x' prefix if present
      const bcsHex = value.startsWith('0x') ? value.slice(2) : value;
      const bcsBytes = new Uint8Array(
        bcsHex.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
      );
      
      // Parse using DynamicField BCS schema
      const parsed = DynamicFieldSubChannelSchema.parse(bcsBytes);
      
      return {
        name: parsed.name,
        value: {
          pk_multibase: parsed.value.pk_multibase,
          method_type: parsed.value.method_type,
          last_claimed_amount: BigInt(parsed.value.last_claimed_amount),
          last_confirmed_nonce: BigInt(parsed.value.last_confirmed_nonce),
        },
      };
    } catch (error) {
      this.logger.error('Error parsing DynamicField:', error);
      throw new Error(`Failed to parse DynamicField: ${error}`);
    }
  }
} 