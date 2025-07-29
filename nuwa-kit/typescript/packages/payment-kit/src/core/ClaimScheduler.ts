/**
 * ClaimScheduler - Automated claiming for Payee
 * Monitors unclaimed RAVs and triggers claim transactions based on policies
 */

import type { SignedSubRAV } from './types';
import type { RAVRepository } from '../storage/interfaces/RAVRepository';
import type { IPaymentChannelContract } from '../contracts/IPaymentChannelContract';
import type { SignerInterface } from '@nuwa-ai/identity-kit';
import { DebugLogger } from '@nuwa-ai/identity-kit';

export interface ClaimPolicy {
  /** Minimum accumulated amount to trigger claim (in smallest unit) */
  minClaimAmount: bigint;
  
  /** Maximum interval between claims in milliseconds */
  maxIntervalMs: number;
  
  /** Maximum number of concurrent claim operations */
  maxConcurrentClaims?: number;
  
  /** Retry attempts for failed claims */
  maxRetries?: number;
  
  /** Delay between retries in milliseconds */
  retryDelayMs?: number;
}

export interface ClaimSchedulerOptions {
  /** RAV storage instance */
  store: RAVRepository;
  
  /** Payment channel contract instance */
  contract: IPaymentChannelContract;
  
  /** Signer for claim transactions */
  signer: SignerInterface;
  
  /** Claiming policy configuration */
  policy: ClaimPolicy;
  
  /** Polling interval in milliseconds (default: 30s) */
  pollIntervalMs?: number;
  
  /** Enable debug logging */
  debug?: boolean;
}

export interface ScheduledClaimResult {
  channelId: string;
  vmIdFragment: string;
  claimedAmount: bigint;
  txHash: string;
  timestamp: number;
}

export interface ClaimAttempt {
  channelId: string;
  vmIdFragment: string;
  nonce: bigint;
  attempt: number;
  lastError?: string;
  nextRetryAt?: number;
}

/**
 * Automated claim scheduler for Payee
 * 
 * Responsibilities:
 * 1. Poll for unclaimed RAVs periodically
 * 2. Apply claim policies (amount threshold, time threshold)
 * 3. Execute claim transactions with retry logic
 * 4. Track claim status and handle failures
 * 5. Prevent concurrent claims for same sub-channel
 */
export class ClaimScheduler {
  private store: RAVRepository;
  private contract: IPaymentChannelContract;
  private signer: SignerInterface;
  private policy: ClaimPolicy;
  private pollIntervalMs: number;
  private logger: DebugLogger;

  private isRunning = false;
  private pollTimer?: NodeJS.Timeout;
  private activeClaims = new Set<string>(); // channelId:vmIdFragment
  private failedAttempts = new Map<string, ClaimAttempt>();
  private lastClaimTimes = new Map<string, number>();

  constructor(options: ClaimSchedulerOptions) {
    this.store = options.store;
    this.contract = options.contract;
    this.signer = options.signer;
    this.policy = {
      maxConcurrentClaims: 5,
      maxRetries: 3,
      retryDelayMs: 60_000, // 1 minute
      ...options.policy,
    };
    this.pollIntervalMs = options.pollIntervalMs || 30_000; // 30 seconds
    this.logger = DebugLogger.get('ClaimScheduler');
    if (options.debug) {
      this.logger.setLevel('debug');
    }
  }

  /**
   * Start the claim scheduler
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('ClaimScheduler is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting ClaimScheduler', {
      pollIntervalMs: this.pollIntervalMs,
      policy: this.policy,
    });

    this.scheduleNextPoll();
  }

  /**
   * Stop the claim scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    this.logger.info('ClaimScheduler stopped');
  }

  /**
   * Manually trigger claim check for a specific channel
   */
  async triggerClaim(channelId: string, vmIdFragment?: string): Promise<ScheduledClaimResult[]> {
    this.logger.debug('Manual claim trigger', { channelId, vmIdFragment });
    
          if (vmIdFragment) {
        // Claim specific sub-channel
        const latest = await this.store.getLatest(channelId, vmIdFragment);
        if (!latest) {
          return [];
        }
        const unclaimedRAVs = new Map([[vmIdFragment, latest]]);
        return this.processClaims(channelId, unclaimedRAVs, true);
      } else {
      // Claim all unclaimed RAVs for channel
      const unclaimedRAVs = await this.store.getUnclaimedRAVs(channelId);
      return this.processClaims(channelId, unclaimedRAVs, true);
    }
  }

  private scheduleNextPoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.pollTimer = setTimeout(() => {
      this.pollAndProcess().catch(error => {
        this.logger.error('Poll error:', error);
      }).finally(() => {
        this.scheduleNextPoll();
      });
    }, this.pollIntervalMs);
  }

  private async pollAndProcess(): Promise<void> {
    try {
      this.logger.debug('Polling for unclaimed RAVs');
      
      // Get all channels with unclaimed RAVs
      // Note: This is a simplified approach. In production, you might want to
      // maintain a list of active channels or use database queries to find them.
      const channelIds = await this.getActiveChannels();
      
      for (const channelId of channelIds) {
        const unclaimedRAVs = await this.store.getUnclaimedRAVs(channelId);
        
        if (unclaimedRAVs.size > 0) {
          await this.processClaims(channelId, unclaimedRAVs, false);
        }
      }
      
      // Process retry queue
      await this.processRetries();
      
    } catch (error) {
      this.logger.error('Error in poll cycle:', error);
    }
  }

  private async processClaims(
    channelId: string, 
    unclaimedRAVs: Map<string, SignedSubRAV>,
    forceAllClaims: boolean
  ): Promise<ScheduledClaimResult[]> {
    const results: ScheduledClaimResult[] = [];
    
    for (const [vmIdFragment, rav] of unclaimedRAVs) {
      if (!rav) continue;
      
      const key = this.getClaimKey(channelId, vmIdFragment);
      
      // Skip if already processing this sub-channel
      if (this.activeClaims.has(key)) {
        this.logger.debug('Skipping claim - already in progress', { channelId, vmIdFragment });
        continue;
      }
      
      // Check if we've hit concurrent claim limit
      if (this.activeClaims.size >= this.policy.maxConcurrentClaims!) {
        this.logger.debug('Skipping claim - concurrent limit reached');
        break;
      }
      
      // Apply claim policies
      if (!forceAllClaims && !this.shouldClaim(channelId, vmIdFragment, rav)) {
        continue;
      }
      
      // Execute claim
      try {
        this.activeClaims.add(key);
        const result = await this.executeClaim(channelId, vmIdFragment, rav);
        results.push(result);
        
        // Update tracking
        this.lastClaimTimes.set(key, Date.now());
        this.failedAttempts.delete(key);
        
      } catch (error) {
        this.logger.error('Claim failed', { channelId, vmIdFragment, error });
        this.handleClaimFailure(channelId, vmIdFragment, rav, error);
      } finally {
        this.activeClaims.delete(key);
      }
    }
    
    return results;
  }

  private shouldClaim(channelId: string, vmIdFragment: string, rav: SignedSubRAV): boolean {
    const key = this.getClaimKey(channelId, vmIdFragment);
    const now = Date.now();
    
    // Check amount threshold
    if (rav.subRav.accumulatedAmount < this.policy.minClaimAmount) {
      this.logger.debug('Amount below threshold', {
        channelId,
        vmIdFragment,
        amount: rav.subRav.accumulatedAmount.toString(),
        threshold: this.policy.minClaimAmount.toString(),
      });
      return false;
    }
    
    // Check time threshold
    const lastClaimTime = this.lastClaimTimes.get(key) || 0;
    const timeSinceLastClaim = now - lastClaimTime;
    
    if (timeSinceLastClaim < this.policy.maxIntervalMs) {
      this.logger.debug('Time threshold not met', {
        channelId,
        vmIdFragment,
        timeSinceLastClaim,
        threshold: this.policy.maxIntervalMs,
      });
      return false;
    }
    
    return true;
  }

  private async executeClaim(
    channelId: string, 
    vmIdFragment: string, 
    rav: SignedSubRAV
  ): Promise<ScheduledClaimResult> {
    this.logger.info('Executing claim', {
      channelId,
      vmIdFragment,
      nonce: rav.subRav.nonce.toString(),
      amount: rav.subRav.accumulatedAmount.toString(),
    });
    
    const result = await this.contract.claimFromChannel({
      signedSubRAV: rav,
      signer: this.signer,
    });
    
    // Mark as claimed in store
    await this.store.markAsClaimed(channelId, vmIdFragment, rav.subRav.nonce);
    
    const claimResult: ScheduledClaimResult = {
      channelId,
      vmIdFragment,
      claimedAmount: rav.subRav.accumulatedAmount,
      txHash: result.txHash,
      timestamp: Date.now(),
    };
    
    this.logger.info('Claim successful', claimResult);
    return claimResult;
  }

  private handleClaimFailure(
    channelId: string,
    vmIdFragment: string,
    rav: SignedSubRAV,
    error: any
  ): void {
    const key = this.getClaimKey(channelId, vmIdFragment);
    const existing = this.failedAttempts.get(key);
    const attempt = (existing?.attempt || 0) + 1;
    
    if (attempt <= this.policy.maxRetries!) {
      const nextRetryAt = Date.now() + this.policy.retryDelayMs!;
      
      this.failedAttempts.set(key, {
        channelId,
        vmIdFragment,
        nonce: rav.subRav.nonce,
        attempt,
        lastError: error.message || 'Unknown error',
        nextRetryAt,
      });
      
      this.logger.warn('Claim failed, will retry', {
        channelId,
        vmIdFragment,
        attempt,
        nextRetryAt: new Date(nextRetryAt),
        error: error.message,
      });
    } else {
      this.logger.error('Claim failed permanently', {
        channelId,
        vmIdFragment,
        maxRetries: this.policy.maxRetries,
        error: error.message,
      });
      
      // Remove from retry queue
      this.failedAttempts.delete(key);
    }
  }

  private async processRetries(): Promise<void> {
    const now = Date.now();
    const readyRetries: ClaimAttempt[] = [];
    
    for (const [key, attempt] of this.failedAttempts.entries()) {
      if (attempt.nextRetryAt && attempt.nextRetryAt <= now) {
        readyRetries.push(attempt);
      }
    }
    
    for (const retry of readyRetries) {
      if (this.activeClaims.size >= this.policy.maxConcurrentClaims!) {
        break;
      }
      
      const rav = await this.store.getLatest(retry.channelId, retry.vmIdFragment);
      if (rav && rav.subRav.nonce === retry.nonce) {
        // Retry the claim
        const unclaimedRAVs = new Map([[retry.vmIdFragment, rav]]);
        await this.processClaims(retry.channelId, unclaimedRAVs, true);
      } else {
        // RAV has changed, remove from retry queue
        this.failedAttempts.delete(this.getClaimKey(retry.channelId, retry.vmIdFragment));
      }
    }
  }

  private getClaimKey(channelId: string, vmIdFragment: string): string {
    return `${channelId}:${vmIdFragment}`;
  }

  private async getActiveChannels(): Promise<string[]> {
    // This is a placeholder implementation
    // In practice, you might want to:
    // 1. Maintain a registry of active channels
    // 2. Query the database for channels with recent activity
    // 3. Listen to blockchain events for new channels
    
    // For now, return empty array - channels will be processed via manual triggers
    return [];
  }

  /**
   * Get current scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeClaims: this.activeClaims.size,
      failedAttempts: this.failedAttempts.size,
      lastPollTime: Date.now(),
      policy: this.policy,
    };
  }

  /**
   * Get failed claim attempts for monitoring
   */
  getFailedAttempts(): ClaimAttempt[] {
    return Array.from(this.failedAttempts.values());
  }
} 