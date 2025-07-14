/**
 * Rooch Payment Channel Contract interface
 * Implementation of NIP-4 Payment Channel protocol on Rooch blockchain
 */

import {
  RoochClient,
  Transaction,
  Args,
  Signer,
  EventView,
  getRoochNodeUrl,
} from '@roochnetwork/rooch-sdk';
import type { SignedSubRAV, AssetInfo, TransactionResult } from '../core/types';
import { SubRAVCodec } from '../core/subrav';
import { DebugLogger } from '@nuwa-ai/identity-kit';

export interface RoochContractOptions {
  rpcUrl?: string;
  network?: 'local' | 'dev' | 'test' | 'main';
  contractAddress?: string;
  debug?: boolean;
}

/**
 * Advanced transaction options for payment channel operations
 */
export interface PaymentChannelTxnOptions {
  maxGas?: number;
  customArgs?: Record<string, any>;
}

/**
 * Result of a channel opening operation
 */
export interface OpenChannelResult {
  channelId: string;
  txHash: string;
  events?: EventView[];
}

/**
 * Result of claim operation
 */
export interface ClaimResult {
  txHash: string;
  claimedAmount: bigint;
  events?: EventView[];
}

/**
 * Channel information from blockchain
 */
export interface ChannelInfo {
  exists: boolean;
  sender?: string;
  receiver?: string;
  coinType?: string;
  status?: 'active' | 'cancelling' | 'closed';
  epoch?: bigint;
}

/**
 * Sub-channel information from blockchain
 */
export interface SubChannelInfo {
  authorized: boolean;
  publicKey?: string;
  methodType?: string;
  lastClaimedAmount?: bigint;
  lastConfirmedNonce?: bigint;
}

/**
 * Rooch Payment Channel Contract wrapper
 * Provides typed interface to the rooch_framework::payment_channel Move module
 */
export class RoochPaymentChannelContract {
  private client: RoochClient;
  private contractAddress: string;
  private debug: boolean;
  private logger: DebugLogger;

  constructor(options: RoochContractOptions = {}) {
    this.debug = options.debug || false;
    this.logger = DebugLogger.get('RoochPaymentChannelContract');
    if (this.debug) {
      this.logger.setLevel('debug');
    }

    // Set contract address - using rooch_framework::payment_channel as default
    this.contractAddress = options.contractAddress || '0x3::payment_channel';

    // Initialize RPC URL
    let rpcUrl = options.rpcUrl;
    if (!rpcUrl) {
      rpcUrl = this.getRoochNodeUrl(options.network || 'test');
    }

    this.logger.debug(`RoochPaymentChannelContract initialized with rpcUrl: ${rpcUrl}`);
    this.client = new RoochClient({ url: rpcUrl });
  }

  /**
   * Open a new payment channel
   */
  async openChannel<CoinType = any>(params: {
    payerDid: string;
    payeeDid: string;
    asset: AssetInfo;
    collateral: bigint;
    signer: Signer;
    advanced?: PaymentChannelTxnOptions;
  }): Promise<OpenChannelResult> {
    try {
      this.logger.debug('Opening payment channel with params:', {
        payerDid: params.payerDid,
        payeeDid: params.payeeDid,
        asset: params.asset,
        collateral: params.collateral.toString(),
      });

      // Extract receiver address from DID
      const receiverAddress = this.extractAddressFromDID(params.payeeDid);

      // Create transaction
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::open_channel_entry`,
        typeArgs: [params.asset.assetId],
        args: [Args.address(receiverAddress)],
        maxGas: params.advanced?.maxGas || 100000000,
      });

      this.logger.debug('Executing transaction: open_channel_entry');

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: params.signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw new Error(`Transaction failed: ${JSON.stringify(result.execution_info)}`);
      }

      // Parse channel ID from events
      const channelId = this.parseChannelIdFromEvents(result.output?.events || []);
      
      this.logger.debug('Channel opened successfully:', {
        channelId,
        txHash: (result as any).transaction_hash,
      });

      return {
        channelId,
        txHash: (result as any).transaction_hash || 'unknown',
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error opening channel:', error);
      throw error;
    }
  }

  /**
   * Authorize a sub-channel for a specific verification method
   */
  async authorizeSubChannel(params: {
    channelId: string;
    vmIdFragment: string;
    signer: Signer;
    advanced?: PaymentChannelTxnOptions;
  }): Promise<{ txHash: string }> {
    try {
      this.logger.debug('Authorizing sub-channel:', {
        channelId: params.channelId,
        vmIdFragment: params.vmIdFragment,
      });

      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::authorize_sub_channel_entry`,
        args: [
          Args.objectId(params.channelId),
          Args.string(params.vmIdFragment),
        ],
        maxGas: params.advanced?.maxGas || 100000000,
      });

      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: params.signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw new Error(`Transaction failed: ${JSON.stringify(result.execution_info)}`);
      }

      this.logger.debug('Sub-channel authorized successfully');

      return {
        txHash: (result as any).transaction_hash || 'unknown',
      };
    } catch (error) {
      this.logger.error('Error authorizing sub-channel:', error);
      throw error;
    }
  }

  /**
   * Claim funds from channel using a SubRAV
   */
  async claimFromChannel(params: {
    signedSubRAV: SignedSubRAV;
    signer: Signer;
    advanced?: PaymentChannelTxnOptions;
  }): Promise<ClaimResult> {
    try {
      const subRav = params.signedSubRAV.subRav;
      this.logger.debug('Claiming from channel:', {
        channelId: subRav.channelId,
        vmIdFragment: subRav.vmIdFragment,
        accumulatedAmount: subRav.accumulatedAmount.toString(),
        nonce: subRav.nonce.toString(),
      });

      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::claim_from_channel_entry`,
        args: [
          Args.objectId(subRav.channelId),
          Args.string(subRav.vmIdFragment),
          Args.u256(subRav.accumulatedAmount),
          Args.u64(subRav.nonce),
          Args.vec('u8', Array.from(params.signedSubRAV.signature)),
        ],
        maxGas: params.advanced?.maxGas || 100000000,
      });

      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: params.signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw new Error(`Transaction failed: ${JSON.stringify(result.execution_info)}`);
      }

      // Parse claimed amount from events
      const claimedAmount = this.parseClaimedAmountFromEvents(result.output?.events || []);

      this.logger.debug('Claim successful:', {
        claimedAmount: claimedAmount.toString(),
        txHash: (result as any).transaction_hash,
      });

      return {
        txHash: (result as any).transaction_hash || 'unknown',
        claimedAmount,
        events: result.output?.events,
      };
    } catch (error) {
      this.logger.error('Error claiming from channel:', error);
      throw error;
    }
  }

  /**
   * Close a payment channel cooperatively
   */
  async closeChannel(params: {
    channelId: string;
    finalSubRAVs: SignedSubRAV[];
    cooperative: boolean;
    signer: Signer;
    advanced?: PaymentChannelTxnOptions;
  }): Promise<{ txHash: string }> {
    try {
      this.logger.debug('Closing channel:', {
        channelId: params.channelId,
        finalSubRAVsCount: params.finalSubRAVs.length,
        cooperative: params.cooperative,
      });

      if (!params.cooperative) {
        throw new Error('Non-cooperative channel closure not yet implemented');
      }

      // Serialize closure proofs for BCS encoding
      const proofs = params.finalSubRAVs.map((signedSubRAV) => ({
        vm_id_fragment: signedSubRAV.subRav.vmIdFragment,
        accumulated_amount: signedSubRAV.subRav.accumulatedAmount,
        nonce: signedSubRAV.subRav.nonce,
        sender_signature: Array.from(signedSubRAV.signature),
      }));

      // BCS encode the proofs
      const serializedProofs = this.encodeCloseProofs(proofs);

      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.contractAddress}::close_channel_entry`,
        args: [
          Args.objectId(params.channelId),
          Args.vec('u8', Array.from(serializedProofs)),
        ],
        maxGas: params.advanced?.maxGas || 100000000,
      });

      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: params.signer,
        option: { withOutput: true },
      });

      if (result.execution_info.status.type !== 'executed') {
        throw new Error(`Transaction failed: ${JSON.stringify(result.execution_info)}`);
      }

      this.logger.debug('Channel closed successfully');

      return {
        txHash: (result as any).transaction_hash || 'unknown',
      };
    } catch (error) {
      this.logger.error('Error closing channel:', error);
      throw error;
    }
  }

  /**
   * Get channel status from blockchain
   */
  async getChannelStatus(channelId: string): Promise<ChannelInfo> {
    try {
      this.logger.debug('Getting channel status:', { channelId });

      // First check if channel exists
      const existsResult = await this.client.executeViewFunction({
        target: `${this.contractAddress}::channel_exists`,
        args: [Args.objectId(channelId)],
      });

      if (existsResult?.vm_status !== 'Executed' || !existsResult.return_values?.[0]?.decoded_value) {
        return { exists: false };
      }

      // Get channel info
      const infoResult = await this.client.executeViewFunction({
        target: `${this.contractAddress}::get_channel_info`,
        args: [Args.objectId(channelId)],
      });

      if (infoResult?.vm_status !== 'Executed' || !infoResult.return_values) {
        return { exists: false };
      }

      const [sender, receiver, coinType, status] = infoResult.return_values.map(
        (rv) => rv.decoded_value
      );

      // Get channel epoch
      const epochResult = await this.client.executeViewFunction({
        target: `${this.contractAddress}::get_channel_epoch`,
        args: [Args.objectId(channelId)],
      });

      const epoch = epochResult?.return_values?.[0]?.decoded_value || 0;

      return {
        exists: true,
        sender: sender as string,
        receiver: receiver as string,
        coinType: coinType as string,
        status: this.convertStatusFromChain(status as number),
        epoch: BigInt(epoch as string | number),
      };
    } catch (error) {
      this.logger.error('Error getting channel status:', error);
      return { exists: false };
    }
  }

  /**
   * Get sub-channel authorization status
   */
  async getSubChannelStatus(channelId: string, vmIdFragment: string): Promise<SubChannelInfo> {
    try {
      this.logger.debug('Getting sub-channel status:', { channelId, vmIdFragment });

      // Check if sub-channel exists
      const existsResult = await this.client.executeViewFunction({
        target: `${this.contractAddress}::sub_channel_exists`,
        args: [Args.objectId(channelId), Args.string(vmIdFragment)],
      });

      if (existsResult?.vm_status !== 'Executed' || !existsResult.return_values?.[0]?.decoded_value) {
        return { authorized: false };
      }

      // Get sub-channel state
      const stateResult = await this.client.executeViewFunction({
        target: `${this.contractAddress}::get_sub_channel_state`,
        args: [Args.objectId(channelId), Args.string(vmIdFragment)],
      });

      // Get public key
      const pkResult = await this.client.executeViewFunction({
        target: `${this.contractAddress}::get_sub_channel_public_key`,
        args: [Args.objectId(channelId), Args.string(vmIdFragment)],
      });

      // Get method type
      const methodResult = await this.client.executeViewFunction({
        target: `${this.contractAddress}::get_sub_channel_method_type`,
        args: [Args.objectId(channelId), Args.string(vmIdFragment)],
      });

      const [lastClaimedAmount, lastConfirmedNonce] = stateResult?.return_values?.map(
        (rv) => rv.decoded_value
      ) || [0, 0];

      return {
        authorized: true,
        publicKey: pkResult?.return_values?.[0]?.decoded_value as string | undefined,
        methodType: methodResult?.return_values?.[0]?.decoded_value as string | undefined,
        lastClaimedAmount: BigInt(lastClaimedAmount as string | number),
        lastConfirmedNonce: BigInt(lastConfirmedNonce as string | number),
      };
    } catch (error) {
      this.logger.error('Error getting sub-channel status:', error);
      return { authorized: false };
    }
  }

  /**
   * Calculate channel ID deterministically
   */
  async calculateChannelId(sender: string, receiver: string, coinType: string): Promise<string> {
    try {
      const result = await this.client.executeViewFunction({
        target: `${this.contractAddress}::calc_channel_object_id`,
        args: [Args.address(sender), Args.address(receiver), Args.string(coinType)],
      });

      if (result?.vm_status !== 'Executed' || !result.return_values?.[0]?.decoded_value) {
        throw new Error('Failed to calculate channel ID');
      }

      return result.return_values[0].decoded_value as string;
    } catch (error) {
      this.logger.error('Error calculating channel ID:', error);
      throw error;
    }
  }

  // === Private Helper Methods ===

  private createTransaction(): Transaction {
    return new Transaction();
  }

  private extractAddressFromDID(did: string): string {
    // Extract address from did:rooch:address format
    const match = did.match(/^did:rooch:(.+)$/);
    if (!match) {
      throw new Error(`Invalid DID format: ${did}. Expected did:rooch:address`);
    }
    return match[1];
  }

  private parseChannelIdFromEvents(events: EventView[]): string {
    for (const event of events) {
      if (event.event_type === '0x3::payment_channel::PaymentChannelOpenedEvent') {
        try {
          const eventData = event.decoded_event_data as any;
          if (eventData?.channel_id) {
            return eventData.channel_id as string;
          }
          // Fallback to parsing event_data if decoded_event_data is not available
          // This would require BCS decoding of the event data
        } catch (error) {
          this.logger.debug('Error parsing event data:', error);
        }
      }
    }
    throw new Error('PaymentChannelOpenedEvent not found in transaction events');
  }

  private parseClaimedAmountFromEvents(events: EventView[]): bigint {
    for (const event of events) {
      if (event.event_type === '0x3::payment_channel::ChannelClaimedEvent') {
        try {
          const eventData = event.decoded_event_data as any;
          if (eventData?.amount) {
            return BigInt(eventData.amount);
          }
        } catch (error) {
          this.logger.debug('Error parsing claimed amount:', error);
        }
      }
    }
    // Return 0 if no claim event found (idempotent call)
    return BigInt(0);
  }

  private convertStatusFromChain(status: number): 'active' | 'cancelling' | 'closed' {
    switch (status) {
      case 0:
        return 'active';
      case 1:
        return 'cancelling';
      case 2:
        return 'closed';
      default:
        return 'closed';
    }
  }

  private encodeCloseProofs(proofs: any[]): Uint8Array {
    // TODO: Implement proper BCS encoding for CloseProofs struct
    // This is a placeholder - in actual implementation, we would use
    // the BCS schema from the Move contract
    
    // For now, return empty array - this needs to be implemented when
    // BCS encoding utilities are available
    this.logger.warn('BCS encoding for CloseProofs not yet implemented');
    return new Uint8Array(0);
  }

  private getRoochNodeUrl(network: 'local' | 'dev' | 'test' | 'main'): string {
    const networkMap: { [key: string]: string } = {
      local: 'localnet',
      dev: 'devnet',
      test: 'testnet',
      main: 'mainnet',
    };

    const roochNetwork = networkMap[network] || network;
    return getRoochNodeUrl(roochNetwork as any);
  }

  /**
   * Create a RoochPaymentChannelContract with default test configuration
   */
  static createDefault(
    network: 'local' | 'dev' | 'test' | 'main' = 'test',
    rpcUrl?: string
  ): RoochPaymentChannelContract {
    return new RoochPaymentChannelContract({
      rpcUrl,
      network,
      debug: false,
    });
  }
} 