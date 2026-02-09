import { Args, RoochClient, Signer, Transaction } from '@roochnetwork/rooch-sdk';
import { logger } from '../utils/logger.js';

export interface GasSubsidyConfig {
  enabled: boolean;
  amountRaw: string;
  maxGas: number;
}

export interface GasSubsidyResult {
  attempted: boolean;
  status: 'success' | 'failed' | 'skipped';
  amountRaw?: string;
  txHash?: string;
  reason?: string;
}

interface RoochExecutionResult {
  execution_info: {
    status: {
      type: string;
    };
    tx_hash?: string;
  };
}

interface RoochClientLike {
  signAndExecuteTransaction(input: {
    transaction: Transaction;
    signer: Signer;
  }): Promise<RoochExecutionResult>;
}

export class GasSubsidyService {
  private readonly client: RoochClientLike;

  constructor(
    private readonly config: GasSubsidyConfig,
    private readonly signer: Signer,
    networkUrl: string,
    client?: RoochClientLike
  ) {
    this.client = client || new RoochClient({ url: networkUrl });
  }

  async subsidizeAgentDid(agentDid: string): Promise<GasSubsidyResult> {
    if (!this.config.enabled) {
      return {
        attempted: false,
        status: 'skipped',
        reason: 'subsidy disabled',
      };
    }

    try {
      const recipient = this.extractRecipientAddress(agentDid);
      const amountRaw = this.config.amountRaw;
      const amount = BigInt(amountRaw);

      if (amount <= 0n) {
        return {
          attempted: false,
          status: 'skipped',
          reason: 'subsidy amount is non-positive',
        };
      }

      const tx = new Transaction();
      tx.callFunction({
        target: '0x3::transfer::transfer_coin',
        typeArgs: ['0x3::gas_coin::RGas'],
        args: [Args.address(recipient), Args.u256(amount)],
        maxGas: this.config.maxGas,
      });

      const result = await this.client.signAndExecuteTransaction({
        transaction: tx,
        signer: this.signer,
      });

      const executed = result.execution_info.status.type === 'executed';
      const txHash = result.execution_info.tx_hash || undefined;
      if (!executed) {
        return {
          attempted: true,
          status: 'failed',
          amountRaw,
          txHash,
          reason: `transaction failed: ${result.execution_info.status.type}`,
        };
      }

      return {
        attempted: true,
        status: 'success',
        amountRaw,
        txHash,
      };
    } catch (error) {
      logger.error('Gas subsidy transfer failed', { agentDid, error });
      return {
        attempted: true,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private extractRecipientAddress(agentDid: string): string {
    if (!agentDid.startsWith('did:rooch:')) {
      throw new Error(`unsupported DID method for subsidy: ${agentDid}`);
    }
    const identifier = agentDid.slice('did:rooch:'.length);
    if (!identifier) {
      throw new Error(`invalid DID identifier: ${agentDid}`);
    }
    return identifier;
  }
}
