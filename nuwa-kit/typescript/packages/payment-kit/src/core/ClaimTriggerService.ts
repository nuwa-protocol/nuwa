import type { IPaymentChannelContract } from '../contracts/IPaymentChannelContract';
import type { RAVRepository } from '../storage/interfaces/RAVRepository';
import type { ChannelRepository } from '../storage/interfaces/ChannelRepository';
import type { SignedSubRAV } from './types';
import { DebugLogger, type SignerInterface } from '@nuwa-ai/identity-kit';

/**
 * Claim policy configuration
 */
export interface ClaimPolicy {
  /** Minimum accumulated amount to trigger a claim */
  minClaimAmount: bigint;

  /** Maximum number of concurrent claims across all sub-channels */
  maxConcurrentClaims: number;

  /** Maximum retry attempts for failed claims */
  maxRetries: number;

  /** Delay between retry attempts in milliseconds */
  retryDelayMs: number;

  /** Whether to check PaymentHub balance before triggering claims */
  requireHubBalance: boolean;

  /** Fixed backoff when insufficient funds detected (ms) */
  insufficientFundsBackoffMs: number;

  /** Whether to count insufficient funds as failures in stats */
  countInsufficientAsFailure: boolean;
}

/**
 * Default claim policy for reactive claims
 */
export const DEFAULT_REACTIVE_CLAIM_POLICY: ClaimPolicy = {
  // 1 RGas minimum (10,000,000 base units)
  minClaimAmount: BigInt('10000000'),
  // Reactive mode can be more aggressive with concurrency
  maxConcurrentClaims: 10,
  maxRetries: 3,
  retryDelayMs: 60_000,
  requireHubBalance: true,
  insufficientFundsBackoffMs: 30_000,
  countInsufficientAsFailure: false,
};

/**
 * Configuration for ClaimTriggerService
 */
export interface ClaimTriggerOptions {
  /** Claim triggering policy (optional, uses DEFAULT_REACTIVE_CLAIM_POLICY if not provided) */
  policy?: Partial<ClaimPolicy>;

  /** Contract instance for on-chain claim operations */
  contract: IPaymentChannelContract;

  /** Signer for claim transactions (payee signer) */
  signer: SignerInterface;

  /** RAV repository to get latest signed SubRAVs */
  ravRepo: RAVRepository;

  /** Channel repository for SubChannelInfo state updates */
  channelRepo: ChannelRepository;

  /** Debug logging */
  debug?: boolean;
}

/**
 * Claim task in the queue
 */
interface ClaimTask {
  channelId: string;
  vmIdFragment: string;
  delta: bigint;
  attempts: number;
  nextRetryAt: number;
  createdAt: number;
}

/**
 * Statistics for observability
 */
export interface ClaimTriggerStats {
  /** Number of active claims currently processing */
  active: number;

  /** Number of tasks queued for processing */
  queued: number;

  /** Total successful claims */
  successCount: number;

  /** Total failed claims */
  failedCount: number;

  /** Total skipped claims (e.g., insufficient funds precheck) */
  skippedCount: number;

  /** Total insufficient funds occurrences */
  insufficientFundsCount: number;

  /** Number of tasks in backoff (waiting for retry) */
  backoffCount: number;

  /** Average claim processing time in milliseconds */
  avgProcessingTimeMs: number;
}

/**
 * Result of a single claim execution attempt
 */
type ClaimExecutionResult =
  | {
      status: 'skipped';
      reason:
        | 'insufficient_funds'
        | 'below_threshold'
        | 'concurrency_limit'
        | 'already_processing'
        | 'already_queued';
      context?: Record<string, unknown>;
    }
  | {
      status: 'succeeded';
      txHash: string;
      claimedAmount?: bigint;
    };

/**
 * Event-driven Claim Trigger Service
 *
 * Replaces polling-based ClaimScheduler with reactive claim triggering.
 * Claims are triggered by incoming requests when delta reaches threshold.
 *
 * Features:
 * - Concurrent claim processing with limits
 * - Retry with exponential backoff
 * - Prevents duplicate claims for same sub-channel
 * - Comprehensive statistics and observability
 */
export class ClaimTriggerService {
  private readonly policy: ClaimPolicy;
  private readonly contract: IPaymentChannelContract;
  private readonly signer: SignerInterface;
  private readonly ravRepo: RAVRepository;
  private readonly channelRepo: ChannelRepository;
  private readonly logger: DebugLogger;

  // Concurrency control
  private readonly activeClaims = new Set<string>(); // "${channelId}:${vmIdFragment}"
  private readonly claimQueue = new Map<string, ClaimTask>();

  // Statistics
  private readonly stats = {
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    insufficientFundsCount: 0,
    totalProcessingTime: 0,
  };

  // Processing workers
  private processingInterval?: NodeJS.Timeout;
  private readonly processingIntervalMs = 1000; // Check queue every 1s

  constructor(options: ClaimTriggerOptions) {
    // Merge user policy with defaults
    this.policy = {
      ...DEFAULT_REACTIVE_CLAIM_POLICY,
      ...options.policy,
    };

    // Runtime safety check: ensure minClaimAmount is defined
    if (this.policy.minClaimAmount === undefined || this.policy.minClaimAmount === null) {
      throw new Error(
        'Internal error: policy.minClaimAmount should never be undefined after merging with defaults'
      );
    }
    this.contract = options.contract;
    this.signer = options.signer;
    this.ravRepo = options.ravRepo;
    this.channelRepo = options.channelRepo;

    this.logger = DebugLogger.get('ClaimTriggerService');
    this.logger.setLevel(options.debug ? 'debug' : 'info');

    this.logger.info('ClaimTriggerService initialized', {
      minClaimAmount: this.policy.minClaimAmount.toString(),
      maxConcurrentClaims: this.policy.maxConcurrentClaims,
      maxRetries: this.policy.maxRetries,
      requireHubBalance: this.policy.requireHubBalance,
    });

    // Start background processing
    this.startProcessing();
  }

  /**
   * Maybe queue a claim based on delta and policy
   * Called from PaymentProcessor.persist()
   */
  async maybeQueue(channelId: string, vmIdFragment: string, delta: bigint): Promise<void> {
    const key = this.buildKey(channelId, vmIdFragment);

    this.logger.debug('maybeQueue called', {
      channelId,
      vmIdFragment,
      delta: delta.toString(),
      minClaimAmount: this.policy.minClaimAmount.toString(),
    });

    // Check if delta meets minimum threshold
    if (delta < this.policy.minClaimAmount) {
      this.logger.debug('Delta below threshold, skipping', {
        delta: delta.toString(),
        threshold: this.policy.minClaimAmount.toString(),
      });
      this.stats.skippedCount++;
      return;
    }

    // Check if already processing this sub-channel
    if (this.activeClaims.has(key)) {
      this.logger.debug('Claim already in progress, skipping', { channelId, vmIdFragment });
      this.stats.skippedCount++;
      return;
    }

    // Check if already queued
    if (this.claimQueue.has(key)) {
      this.logger.debug('Claim already queued, updating delta', {
        channelId,
        vmIdFragment,
        oldDelta: this.claimQueue.get(key)!.delta.toString(),
        newDelta: delta.toString(),
      });
      // Update delta in existing task
      this.claimQueue.get(key)!.delta = delta;
      return;
    }

    // Check global concurrency limit (active + queued)
    const totalInFlight = this.activeClaims.size + this.claimQueue.size;
    if (totalInFlight >= this.policy.maxConcurrentClaims) {
      this.logger.debug('Concurrent claims limit reached, skipping', {
        totalInFlight,
        limit: this.policy.maxConcurrentClaims,
      });
      this.stats.skippedCount++;
      return;
    }

    // Queue the claim task
    const task: ClaimTask = {
      channelId,
      vmIdFragment,
      delta,
      attempts: 0,
      nextRetryAt: Date.now(),
      createdAt: Date.now(),
    };

    this.claimQueue.set(key, task);
    this.logger.info('Claim queued', { channelId, vmIdFragment, delta: delta.toString() });
  }

  /**
   * Get current status and statistics
   */
  getStatus(): ClaimTriggerStats {
    const now = Date.now();
    const backoffCount = Array.from(this.claimQueue.values()).filter(
      task => task.nextRetryAt > now
    ).length;

    return {
      active: this.activeClaims.size,
      queued: this.claimQueue.size,
      successCount: this.stats.successCount,
      failedCount: this.stats.failedCount,
      skippedCount: this.stats.skippedCount,
      insufficientFundsCount: this.stats.insufficientFundsCount,
      backoffCount,
      avgProcessingTimeMs:
        this.stats.successCount > 0 ? this.stats.totalProcessingTime / this.stats.successCount : 0,
    };
  }

  /**
   * Stop background processing
   */
  destroy(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    this.logger.info('ClaimTriggerService destroyed');
  }

  private buildKey(channelId: string, vmIdFragment: string): string {
    return `${channelId}:${vmIdFragment}`;
  }

  private startProcessing(): void {
    this.processingInterval = setInterval(() => {
      this.processQueue().catch(error => {
        this.logger.error('Queue processing error', { error });
      });
    }, this.processingIntervalMs);
  }

  private async processQueue(): Promise<void> {
    const now = Date.now();

    // Find tasks ready for processing
    const readyTasks: ClaimTask[] = [];
    for (const [key, task] of this.claimQueue) {
      if (task.nextRetryAt <= now && !this.activeClaims.has(key)) {
        readyTasks.push(task);
      }
    }

    if (readyTasks.length === 0) {
      return;
    }

    this.logger.debug('Processing queue', { readyTasks: readyTasks.length });

    // Process tasks up to concurrency limit
    const slotsAvailable = this.policy.maxConcurrentClaims - this.activeClaims.size;
    const tasksToProcess = readyTasks.slice(0, slotsAvailable);

    for (const task of tasksToProcess) {
      const key = this.buildKey(task.channelId, task.vmIdFragment);

      // Remove from queue and mark as active
      this.claimQueue.delete(key);
      this.activeClaims.add(key);

      // Process task asynchronously
      this.processClaimTask(task, key).finally(() => {
        this.activeClaims.delete(key);
      });
    }
  }

  private async processClaimTask(task: ClaimTask, key: string): Promise<void> {
    const startTime = Date.now();
    task.attempts++;

    this.logger.info('Processing claim', {
      channelId: task.channelId,
      vmIdFragment: task.vmIdFragment,
      delta: task.delta.toString(),
      attempt: task.attempts,
    });

    try {
      const result = await this.executeClaim(task.channelId, task.vmIdFragment);

      if (result.status === 'succeeded') {
        // Success
        const processingTime = Date.now() - startTime;
        this.stats.successCount++;
        this.stats.totalProcessingTime += processingTime;

        this.logger.info('Claim successful', {
          channelId: task.channelId,
          vmIdFragment: task.vmIdFragment,
          processingTimeMs: processingTime,
          txHash: result.txHash,
        });
        return;
      }

      if (result.status === 'skipped') {
        // Skipped due to preconditions (e.g., insufficient funds)
        this.stats.skippedCount++;
        if (result.reason === 'insufficient_funds') {
          this.stats.insufficientFundsCount++;
        }
        // Schedule backoff for insufficient funds
        const backoffMs =
          result.reason === 'insufficient_funds'
            ? this.policy.insufficientFundsBackoffMs
            : this.policy.retryDelayMs;
        task.nextRetryAt = Date.now() + backoffMs;
        this.logger.warn('Claim skipped due to precondition', {
          channelId: task.channelId,
          vmIdFragment: task.vmIdFragment,
          reason: result.reason,
          backoffMs,
        });
        // Re-queue for later
        this.claimQueue.set(key, task);
        return;
      }
    } catch (error) {
      this.logger.error('Claim failed', {
        channelId: task.channelId,
        vmIdFragment: task.vmIdFragment,
        attempt: task.attempts,
        error,
      });

      // Check if should retry
      if (task.attempts < this.policy.maxRetries) {
        // Check if this is an insufficient funds error - use longer backoff
        const isInsufficientFunds = (error as any)?.code === 'HUB_INSUFFICIENT_FUNDS';
        let backoffMs: number;

        if (isInsufficientFunds) {
          // For insufficient funds, use a longer fixed delay to give user time to deposit
          backoffMs = 30000; // 30 seconds fixed delay for balance issues
          this.logger.warn(
            'Claim failed due to insufficient hub balance - using extended retry delay',
            {
              channelId: task.channelId,
              vmIdFragment: task.vmIdFragment,
              backoffMs,
              message: 'User may need to deposit funds to PaymentHub',
            }
          );
        } else {
          // For other errors, use exponential backoff
          backoffMs = this.policy.retryDelayMs * Math.pow(2, task.attempts - 1);
        }

        task.nextRetryAt = Date.now() + backoffMs;

        // Re-queue for retry
        this.claimQueue.set(key, task);

        this.logger.info('Claim scheduled for retry', {
          channelId: task.channelId,
          vmIdFragment: task.vmIdFragment,
          attempt: task.attempts,
          nextRetryAt: new Date(task.nextRetryAt).toISOString(),
          backoffMs,
          errorType: isInsufficientFunds ? 'insufficient_funds' : 'other',
        });
      } else {
        // Max retries reached
        this.stats.failedCount++;
        this.logger.error('Claim failed permanently after max retries', {
          channelId: task.channelId,
          vmIdFragment: task.vmIdFragment,
          maxRetries: this.policy.maxRetries,
        });
      }
    }
  }

  private async executeClaim(
    channelId: string,
    vmIdFragment: string
  ): Promise<ClaimExecutionResult> {
    this.logger.debug('Executing claim', { channelId, vmIdFragment });

    // Get latest signed SubRAV
    const latestSignedRAV = await this.ravRepo.getLatest(channelId, vmIdFragment);
    if (!latestSignedRAV) {
      throw new Error(`No signed SubRAV found for ${channelId}:${vmIdFragment}`);
    }

    // Get current sub-channel info for delta calculation
    const subChannelInfo = await this.channelRepo.getSubChannelState(channelId, vmIdFragment);
    if (!subChannelInfo) {
      throw new Error(`No SubChannelInfo found for channel ${channelId}:${vmIdFragment}`);
    }

    // Get channel metadata to access assetId and payerDid
    const channelMetadata = await this.channelRepo.getChannelMetadata(channelId);
    if (!channelMetadata) {
      throw new Error(`No ChannelInfo found for channel ${channelId}`);
    }

    // Calculate delta (amount to claim)
    const accumulatedAmount = latestSignedRAV.subRav.accumulatedAmount;
    const lastClaimedAmount = subChannelInfo.lastClaimedAmount;
    const delta =
      accumulatedAmount > lastClaimedAmount ? accumulatedAmount - lastClaimedAmount : 0n;

    this.logger.debug('Found latest signed SubRAV with detailed info', {
      channelId,
      vmIdFragment,
      nonce: latestSignedRAV.subRav.nonce.toString(),
      accumulatedAmount: accumulatedAmount.toString(),
      lastClaimedAmount: lastClaimedAmount.toString(),
      delta: delta.toString(),
      assetId: channelMetadata.assetId,
      payerDid: channelMetadata.payerDid,
      payeeDid: channelMetadata.payeeDid,
    });

    // Verify on-chain balance before attempting claim
    try {
      const onChainBalance = await this.contract.getHubBalance(
        channelMetadata.payerDid,
        channelMetadata.assetId
      );
      this.logger.debug('On-chain hub balance verification', {
        channelId,
        payerDid: channelMetadata.payerDid,
        assetId: channelMetadata.assetId,
        onChainBalance: onChainBalance.toString(),
        deltaToWithdraw: delta.toString(),
        sufficient: onChainBalance >= delta,
        minClaimAmount: this.policy.minClaimAmount.toString(),
      });

      if (onChainBalance < delta) {
        this.logger.warn('Insufficient on-chain hub balance detected before claim', {
          channelId,
          payerDid: channelMetadata.payerDid,
          assetId: channelMetadata.assetId,
          onChainBalance: onChainBalance.toString(),
          deltaToWithdraw: delta.toString(),
          deficit: (delta - onChainBalance).toString(),
        });

        // Return skipped result instead of throwing
        return {
          status: 'skipped',
          reason: 'insufficient_funds',
          context: {
            onChainBalance: onChainBalance.toString(),
            delta: delta.toString(),
            payerDid: channelMetadata.payerDid,
            assetId: channelMetadata.assetId,
          },
        };
      }
    } catch (balanceError) {
      // For balance API errors, log and continue (do not skip)
      this.logger.warn('Failed to verify on-chain balance before claim', {
        channelId,
        payerDid: channelMetadata.payerDid,
        assetId: channelMetadata.assetId,
        error: balanceError instanceof Error ? balanceError.message : String(balanceError),
      });
      // Continue with claim attempt
    }

    // Execute claim on-chain
    this.logger.debug('Attempting claim on-chain', {
      channelId,
      vmIdFragment,
    });

    const claimResult = await this.contract.claimFromChannel({
      signedSubRAV: latestSignedRAV,
      signer: this.signer,
    });

    this.logger.debug('Claim transaction submitted', {
      channelId,
      vmIdFragment,
      txHash: claimResult.txHash,
      claimedAmount: claimResult.claimedAmount?.toString(),
    });

    // Update local state after successful claim
    await Promise.all([
      // Update SubChannelInfo state
      this.channelRepo.updateSubChannelState(channelId, vmIdFragment, {
        lastClaimedAmount: latestSignedRAV.subRav.accumulatedAmount,
        lastConfirmedNonce: latestSignedRAV.subRav.nonce,
        lastUpdated: Date.now(),
      }),

      // Mark RAV as claimed
      this.ravRepo.markAsClaimed(channelId, vmIdFragment, latestSignedRAV.subRav.nonce),
    ]);

    this.logger.debug('Successfully updated local state after claim', {
      channelId,
      vmIdFragment,
      newLastClaimedAmount: latestSignedRAV.subRav.accumulatedAmount.toString(),
      newLastConfirmedNonce: latestSignedRAV.subRav.nonce.toString(),
    });

    this.logger.info('Local state updated after claim', {
      channelId,
      vmIdFragment,
      lastClaimedAmount: latestSignedRAV.subRav.accumulatedAmount.toString(),
      lastConfirmedNonce: latestSignedRAV.subRav.nonce.toString(),
    });

    return {
      status: 'succeeded',
      txHash: claimResult.txHash,
      claimedAmount: claimResult.claimedAmount,
    };
  }
}
