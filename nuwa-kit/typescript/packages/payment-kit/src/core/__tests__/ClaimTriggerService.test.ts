import { ClaimTriggerService } from '../ClaimTriggerService';
import type { IPaymentChannelContract } from '../../contracts/IPaymentChannelContract';
import type { RAVRepository } from '../../storage/interfaces/RAVRepository';
import type { ChannelRepository } from '../../storage/interfaces/ChannelRepository';
import type { SignedSubRAV } from '../types';

// Mock dependencies
const mockContract: jest.Mocked<IPaymentChannelContract> = {
  claimFromChannel: jest.fn(),
} as any;

const mockSigner = {
  getDid: jest.fn().mockResolvedValue('did:example:payee'),
} as any;

const mockRavRepo: jest.Mocked<RAVRepository> = {
  getLatest: jest.fn(),
  markAsClaimed: jest.fn(),
} as any;

const mockChannelRepo: jest.Mocked<ChannelRepository> = {
  updateSubChannelState: jest.fn(),
} as any;

describe('ClaimTriggerService', () => {
  let service: ClaimTriggerService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    service = new ClaimTriggerService({
      policy: {
        minClaimAmount: BigInt(1000),
        maxConcurrentClaims: 2,
        maxRetries: 3,
        retryDelayMs: 1000,
        requireHubBalance: true,
      },
      contract: mockContract,
      signer: mockSigner,
      ravRepo: mockRavRepo,
      channelRepo: mockChannelRepo,
      debug: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    service.destroy();
  });

  describe('maybeQueue', () => {
    it('should queue claim when delta meets threshold', async () => {
      const channelId = 'channel123';
      const vmIdFragment = 'key-1';
      const delta = BigInt(2000); // Above threshold

      await service.maybeQueue(channelId, vmIdFragment, delta);

      const status = service.getStatus();
      expect(status.queued).toBe(1);
      expect(status.active).toBe(0);
    });

    it('should not queue claim when delta below threshold', async () => {
      const channelId = 'channel123';
      const vmIdFragment = 'key-1';
      const delta = BigInt(500); // Below threshold

      await service.maybeQueue(channelId, vmIdFragment, delta);

      const status = service.getStatus();
      expect(status.queued).toBe(0);
    });

    it('should not queue duplicate claims for same sub-channel', async () => {
      const channelId = 'channel123';
      const vmIdFragment = 'key-1';
      const delta = BigInt(2000);

      // Queue first claim
      await service.maybeQueue(channelId, vmIdFragment, delta);
      expect(service.getStatus().queued).toBe(1);

      // Try to queue second claim for same sub-channel
      await service.maybeQueue(channelId, vmIdFragment, delta);
      expect(service.getStatus().queued).toBe(1); // Should still be 1
    });

    it('should update delta for existing queued task', async () => {
      const channelId = 'channel123';
      const vmIdFragment = 'key-1';
      const delta1 = BigInt(2000);
      const delta2 = BigInt(3000);

      // Queue first claim
      await service.maybeQueue(channelId, vmIdFragment, delta1);
      expect(service.getStatus().queued).toBe(1);

      // Update with higher delta
      await service.maybeQueue(channelId, vmIdFragment, delta2);
      expect(service.getStatus().queued).toBe(1); // Still only one task
    });

    it('should respect concurrent claims limit', async () => {
      const delta = BigInt(2000);

      // Queue claims up to limit
      await service.maybeQueue('channel1', 'key-1', delta);
      await service.maybeQueue('channel2', 'key-1', delta);
      expect(service.getStatus().queued).toBe(2);

      // Try to queue beyond limit
      await service.maybeQueue('channel3', 'key-1', delta);
      expect(service.getStatus().queued).toBe(2); // Should not increase
    });
  });

  describe('claim processing', () => {
    const mockSignedRAV: SignedSubRAV = {
      subRav: {
        version: 1,
        chainId: BigInt(4),
        channelId: 'channel123',
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        nonce: BigInt(5),
        accumulatedAmount: BigInt(5000),
      },
      signature: new Uint8Array([1, 2, 3]),
    };

    it('should process successful claim', async () => {
      const channelId = 'channel123';
      const vmIdFragment = 'key-1';
      const delta = BigInt(2000);

      mockRavRepo.getLatest.mockResolvedValue(mockSignedRAV);
      mockContract.claimFromChannel.mockResolvedValue({
        txHash: 'tx123',
        claimedAmount: BigInt(5000),
      });

      // Queue and process claim
      await service.maybeQueue(channelId, vmIdFragment, delta);

      // Fast-forward time to trigger processing
      jest.advanceTimersByTime(1000);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockContract.claimFromChannel).toHaveBeenCalledWith({
        signedSubRAV: mockSignedRAV,
        signer: mockSigner,
      });

      expect(mockChannelRepo.updateSubChannelState).toHaveBeenCalledWith(
        channelId,
        vmIdFragment,
        expect.objectContaining({
          lastClaimedAmount: BigInt(5000),
          lastConfirmedNonce: BigInt(5),
        })
      );

      expect(mockRavRepo.markAsClaimed).toHaveBeenCalledWith(channelId, vmIdFragment, BigInt(5));
    });

    it('should handle claim failure with retry', async () => {
      const channelId = 'channel123';
      const vmIdFragment = 'key-1';
      const delta = BigInt(2000);

      mockRavRepo.getLatest.mockResolvedValue(mockSignedRAV);
      mockContract.claimFromChannel.mockRejectedValue(new Error('Claim failed'));

      // Queue claim
      await service.maybeQueue(channelId, vmIdFragment, delta);

      // Process first attempt (should fail and schedule retry)
      jest.advanceTimersByTime(1000);
      await new Promise(resolve => setTimeout(resolve, 0));

      const status = service.getStatus();
      expect(status.failedCount).toBe(0); // Not permanently failed yet
      expect(status.backoffCount).toBe(1); // Should be in backoff
    });

    it('should handle missing signed RAV', async () => {
      const channelId = 'channel123';
      const vmIdFragment = 'key-1';
      const delta = BigInt(2000);

      mockRavRepo.getLatest.mockResolvedValue(null);

      // Queue claim
      await service.maybeQueue(channelId, vmIdFragment, delta);

      // Process (should fail due to missing RAV)
      jest.advanceTimersByTime(1000);
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should be scheduled for retry
      const status = service.getStatus();
      expect(status.backoffCount).toBe(1);
    });
  });

  describe('getStatus', () => {
    it('should return correct status information', async () => {
      const status = service.getStatus();

      expect(status).toMatchObject({
        active: 0,
        queued: 0,
        successCount: 0,
        failedCount: 0,
        backoffCount: 0,
        avgProcessingTimeMs: 0,
      });
    });
  });
});
