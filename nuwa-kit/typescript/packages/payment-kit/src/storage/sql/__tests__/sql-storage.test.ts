/**
 * SQL Storage Integration Tests
 *
 * Tests for PostgreSQL/Supabase implementations of storage repositories
 * Requires a test database to run
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import { SqlRAVRepository, type SqlRAVRepositoryOptions } from '../rav.sql';
import { SqlChannelRepository, type SqlChannelRepositoryOptions } from '../channel.sql';
import {
  SqlPendingSubRAVRepository,
  type SqlPendingSubRAVRepositoryOptions,
} from '../pendingSubRav.sql';
import { SubRAVUtils } from '../../../core/SubRav';
import type { ChannelInfo, SubChannelInfo, SignedSubRAV, SubRAV } from '../../../core/types';

// Prefer SUPABASE_DB_URL if provided
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

// Test configuration
const TEST_DB_CONFIG: any = SUPABASE_DB_URL
  ? {
      connectionString: SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
      statement_timeout: 60000,
    }
  : {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'nuwa_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'password',
      max: 3, // Increase connection pool size
      idleTimeoutMillis: 30000,
      // Supabase specific settings
      // Enable SSL for Supabase hosts
      ssl: process.env.TEST_DB_HOST?.includes('supabase')
        ? {
            rejectUnauthorized: false,
          }
        : false,
      // Connection timeout
      connectionTimeoutMillis: 30000,
      // Statement timeout
      statement_timeout: 60000,
    };

// Check if PostgreSQL is available
function isPostgreSQLAvailable(): boolean {
  // Check if pg module is available
  try {
    require('pg');
  } catch (error) {
    console.log('Skipping SQL tests - pg module not available');
    return false;
  }

  // Check if required environment variables are set
  const hasRequiredEnv = !!(
    process.env.SUPABASE_DB_URL ||
    process.env.TEST_DB_NAME ||
    process.env.TEST_DB_HOST ||
    process.env.TEST_DB_USER ||
    process.env.TEST_DB_PASSWORD
  );

  if (!hasRequiredEnv) {
    console.log('Skipping SQL tests - no PostgreSQL environment variables configured');
    console.log(
      'Set SUPABASE_DB_URL, or TEST_DB_NAME/TEST_DB_HOST/TEST_DB_USER/TEST_DB_PASSWORD to enable'
    );
    return false;
  }

  // Check if explicitly disabled
  if (process.env.SKIP_SQL_TESTS === 'true') {
    console.log('Skipping SQL tests - SKIP_SQL_TESTS=true');
    return false;
  }

  return true;
}

describe('SQL Storage Repositories', () => {
  let pool: Pool;
  let ravRepo: SqlRAVRepository;
  let channelRepo: SqlChannelRepository;
  let pendingRepo: SqlPendingSubRAVRepository;

  // Test data constants - use 32-byte addresses for ObjectId compatibility
  const TEST_CHANNEL_ID = '0x0000000000000000000000001234567890abcdef1234567890abcdef12345678';

  // Increase timeout for database operations
  jest.setTimeout(30000);

  async function resetSchema(prefix: string = 'test_') {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DROP TABLE IF EXISTS ${prefix}pending_sub_ravs CASCADE`);
      await client.query(`DROP TABLE IF EXISTS ${prefix}ravs CASCADE`);
      await client.query(`DROP TABLE IF EXISTS ${prefix}claims CASCADE`);
      await client.query(`DROP TABLE IF EXISTS ${prefix}sub_channel_states CASCADE`);
      await client.query(`DROP TABLE IF EXISTS ${prefix}channels CASCADE`);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    // Skip tests if PostgreSQL is not available
    if (!isPostgreSQLAvailable()) {
      return;
    }

    try {
      pool = new Pool(TEST_DB_CONFIG as any);

      // Test connection
      const client = await pool.connect();
      client.release();

      // Reset schema and create repositories with auto-migration enabled
      await resetSchema('test_');

      const repoOptions: SqlRAVRepositoryOptions = {
        pool,
        tablePrefix: 'test_',
        autoMigrate: true,
        allowUnsafeAutoMigrateInProd: true, // Allow for testing
      };

      // Create new instances each time to ensure initialize() runs
      ravRepo = new SqlRAVRepository(repoOptions);
      channelRepo = new SqlChannelRepository(repoOptions as SqlChannelRepositoryOptions);
      pendingRepo = new SqlPendingSubRAVRepository(
        repoOptions as SqlPendingSubRAVRepositoryOptions
      );

      // Wait for tables to be created
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.warn('Failed to connect to test database:', error);
      console.log('Skipping SQL tests - database connection failed');
      return;
    }
  });

  afterAll(async () => {
    if (pool && !pool.ended) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    if (!pool) return;
    // Drop and recreate schema for each test to avoid schema drift issues
    await resetSchema('test_');

    const repoOptions: SqlRAVRepositoryOptions = {
      pool,
      tablePrefix: 'test_',
      autoMigrate: true,
      allowUnsafeAutoMigrateInProd: true,
    };

    ravRepo = new SqlRAVRepository(repoOptions);
    channelRepo = new SqlChannelRepository(repoOptions as SqlChannelRepositoryOptions);
    pendingRepo = new SqlPendingSubRAVRepository(repoOptions as SqlPendingSubRAVRepositoryOptions);

    await new Promise(resolve => setTimeout(resolve, 500));
  }, 20000);

  describe('SqlRAVRepository', () => {
    let testSignedSubRAV: SignedSubRAV;

    beforeEach(() => {
      if (!ravRepo) return;

      const subRav = SubRAVUtils.create({
        chainId: BigInt(4),
        channelId: TEST_CHANNEL_ID,
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        accumulatedAmount: BigInt(1000000),
        nonce: BigInt(1),
      });

      testSignedSubRAV = {
        subRav,
        signature: new Uint8Array(64), // Mock signature
      };
    });

    it('should save and retrieve a signed SubRAV', async () => {
      if (!ravRepo) return;

      await ravRepo.save(testSignedSubRAV);

      const retrieved = await ravRepo.getLatest(
        testSignedSubRAV.subRav.channelId,
        testSignedSubRAV.subRav.vmIdFragment
      );

      expect(retrieved).not.toBeNull();
      expect(retrieved!.subRav.channelId).toBe(testSignedSubRAV.subRav.channelId);
      expect(retrieved!.subRav.nonce).toBe(testSignedSubRAV.subRav.nonce);
      expect(retrieved!.subRav.accumulatedAmount).toBe(testSignedSubRAV.subRav.accumulatedAmount);
    });

    it('should handle multiple RAVs for same channel/vm', async () => {
      if (!ravRepo) return;

      // Save multiple RAVs with increasing nonces
      for (let i = 1; i <= 3; i++) {
        const subRav = SubRAVUtils.create({
          ...testSignedSubRAV.subRav,
          nonce: BigInt(i),
          accumulatedAmount: BigInt(i * 1000000),
        });

        await ravRepo.save({ subRav, signature: testSignedSubRAV.signature });
      }

      // Should get the latest (highest nonce)
      const latest = await ravRepo.getLatest(
        testSignedSubRAV.subRav.channelId,
        testSignedSubRAV.subRav.vmIdFragment
      );

      expect(latest!.subRav.nonce).toBe(BigInt(3));
      expect(latest!.subRav.accumulatedAmount).toBe(BigInt(3000000));
    });

    it('should list all RAVs for a channel', async () => {
      if (!ravRepo) return;

      // Save RAVs for different vm fragments
      for (let vm = 1; vm <= 2; vm++) {
        for (let nonce = 1; nonce <= 2; nonce++) {
          const subRav = SubRAVUtils.create({
            ...testSignedSubRAV.subRav,
            vmIdFragment: `key-${vm}`,
            nonce: BigInt(nonce),
            accumulatedAmount: BigInt(nonce * 1000000),
          });

          await ravRepo.save({ subRav, signature: testSignedSubRAV.signature });
        }
      }

      const ravs: SignedSubRAV[] = [];
      for await (const rav of ravRepo.list(testSignedSubRAV.subRav.channelId)) {
        ravs.push(rav);
      }

      expect(ravs).toHaveLength(4); // 2 VMs × 2 nonces each
    });

    it('should track claimed RAVs', async () => {
      if (!ravRepo) return;

      await ravRepo.save(testSignedSubRAV);

      // Initially should be unclaimed
      let unclaimed = await ravRepo.getUnclaimedRAVs(testSignedSubRAV.subRav.channelId);
      expect(unclaimed.size).toBe(1);

      // Mark as claimed
      await ravRepo.markAsClaimed(
        testSignedSubRAV.subRav.channelId,
        testSignedSubRAV.subRav.vmIdFragment,
        testSignedSubRAV.subRav.nonce
      );

      // Should no longer be unclaimed
      unclaimed = await ravRepo.getUnclaimedRAVs(testSignedSubRAV.subRav.channelId);
      expect(unclaimed.size).toBe(0);
    });

    it('should provide repository statistics', async () => {
      if (!ravRepo) return;

      // Start with empty stats
      let stats = await ravRepo.getStats();
      expect(stats.totalRAVs).toBe(0);

      // Add some RAVs
      await ravRepo.save(testSignedSubRAV);

      stats = await ravRepo.getStats();
      expect(stats.totalRAVs).toBe(1);
      expect(stats.unclaimedRAVs).toBe(1);
    });

    it('should cleanup claimed RAVs', async () => {
      if (!ravRepo) return;

      await ravRepo.save(testSignedSubRAV);

      // Mark as claimed
      await ravRepo.markAsClaimed(
        testSignedSubRAV.subRav.channelId,
        testSignedSubRAV.subRav.vmIdFragment,
        testSignedSubRAV.subRav.nonce
      );

      // Cleanup should remove claimed RAVs
      const deletedCount = await ravRepo.cleanup();
      expect(deletedCount).toBe(1);

      // Verify it's gone
      const latest = await ravRepo.getLatest(
        testSignedSubRAV.subRav.channelId,
        testSignedSubRAV.subRav.vmIdFragment
      );
      expect(latest).toBeNull();
    });
  });

  describe('SqlChannelRepository', () => {
    let testChannel: ChannelInfo;

    beforeEach(() => {
      if (!channelRepo) return;

      testChannel = {
        channelId: TEST_CHANNEL_ID,
        payerDid: 'did:rooch:0x123',
        payeeDid: 'did:rooch:0x456',
        assetId: '0x3::gas_coin::RGas',
        epoch: BigInt(1),
        status: 'active',
      };
    });

    it('should save and retrieve channel metadata', async () => {
      if (!channelRepo) return;

      await channelRepo.setChannelMetadata(testChannel.channelId, testChannel);

      const retrieved = await channelRepo.getChannelMetadata(testChannel.channelId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.channelId).toBe(testChannel.channelId);
      expect(retrieved!.payerDid).toBe(testChannel.payerDid);
      expect(retrieved!.status).toBe(testChannel.status);
    });

    it('should update existing channel metadata', async () => {
      if (!channelRepo) return;

      await channelRepo.setChannelMetadata(testChannel.channelId, testChannel);

      // Update status
      const updatedChannel = { ...testChannel, status: 'closed' as const };
      await channelRepo.setChannelMetadata(testChannel.channelId, updatedChannel);

      const retrieved = await channelRepo.getChannelMetadata(testChannel.channelId);
      expect(retrieved!.status).toBe('closed');
    });

    it('should manage sub-channel states', async () => {
      if (!channelRepo) return;

      const vmIdFragment = 'key-1';

      // Initially should be null
      let state = await channelRepo.getSubChannelState(testChannel.channelId, vmIdFragment);
      expect(state).toBeNull();

      // Update state
      await channelRepo.updateSubChannelState(testChannel.channelId, vmIdFragment, {
        lastConfirmedNonce: BigInt(5),
        lastClaimedAmount: BigInt(5000000),
      } as any);

      // Verify update
      state = await channelRepo.getSubChannelState(testChannel.channelId, vmIdFragment);
      expect((state as any)!.lastConfirmedNonce).toBe(BigInt(5));
      expect((state as any)!.lastClaimedAmount).toBe(BigInt(5000000));
    }, 60000); // 60 second timeout for this specific test

    it('should list channels with pagination', async () => {
      if (!channelRepo) return;

      // Create multiple channels
      for (let i = 0; i < 5; i++) {
        const channel = {
          ...testChannel,
          channelId: `0x${i.toString().padStart(40, '0')}`,
          payerDid: `did:rooch:payer-${i}`,
        };
        await channelRepo.setChannelMetadata(channel.channelId, channel);
      }

      // Test pagination
      const result = await channelRepo.listChannelMetadata(undefined, { limit: 3, offset: 0 });
      expect(result.items).toHaveLength(3);
      expect(result.totalCount).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it('should filter channels by payer', async () => {
      if (!channelRepo) return;

      // Create channels with different payers
      const payer1 = 'did:rooch:payer-1';
      const payer2 = 'did:rooch:payer-2';

      for (let i = 0; i < 3; i++) {
        await channelRepo.setChannelMetadata(`channel-${i}`, {
          ...testChannel,
          channelId: `channel-${i}`,
          payerDid: i < 2 ? payer1 : payer2,
        });
      }

      // Filter by payer1
      const result = await channelRepo.listChannelMetadata({ payerDid: payer1 });
      expect(result.items).toHaveLength(2);
      expect(result.items.every(ch => ch.payerDid === payer1)).toBe(true);
    });
  });

  describe('SqlPendingSubRAVRepository', () => {
    let testSubRAV: SubRAV;

    beforeEach(() => {
      if (!pendingRepo) return;

      testSubRAV = SubRAVUtils.create({
        chainId: BigInt(4),
        channelId: TEST_CHANNEL_ID,
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        accumulatedAmount: BigInt(1000000),
        nonce: BigInt(1),
      });
    });

    it('should save and find pending SubRAVs', async () => {
      if (!pendingRepo) return;

      await pendingRepo.save(testSubRAV);

      const found = await pendingRepo.find(
        testSubRAV.channelId,
        testSubRAV.vmIdFragment,
        testSubRAV.nonce
      );
      expect(found).not.toBeNull();
      expect(found!.channelId).toBe(testSubRAV.channelId);
      expect(found!.nonce).toBe(testSubRAV.nonce);
    });

    it('should remove pending SubRAVs', async () => {
      if (!pendingRepo) return;

      await pendingRepo.save(testSubRAV);

      // Verify it exists
      let found = await pendingRepo.find(
        testSubRAV.channelId,
        testSubRAV.vmIdFragment,
        testSubRAV.nonce
      );
      expect(found).not.toBeNull();

      // Remove it
      await pendingRepo.remove(testSubRAV.channelId, testSubRAV.vmIdFragment, testSubRAV.nonce);

      // Verify it's gone
      found = await pendingRepo.find(
        testSubRAV.channelId,
        testSubRAV.vmIdFragment,
        testSubRAV.nonce
      );
      expect(found).toBeNull();
    });

    it('should provide statistics', async () => {
      if (!pendingRepo) return;

      // Add multiple pending SubRAVs
      for (let i = 1; i <= 3; i++) {
        const subRAV = SubRAVUtils.create({
          ...testSubRAV,
          nonce: BigInt(i),
        });
        await pendingRepo.save(subRAV);
      }

      const stats = await pendingRepo.getStats();
      expect(stats.totalCount).toBe(3);
      expect(stats.byChannel[testSubRAV.channelId]).toBe(3);
      expect(stats.oldestTimestamp).toBeDefined();
      expect(stats.newestTimestamp).toBeDefined();
    });

    it('should cleanup old proposals', async () => {
      if (!pendingRepo) return;

      await pendingRepo.save(testSubRAV);

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup with very short max age (everything should be cleaned)
      const deletedCount = await pendingRepo.cleanup(1); // 1ms max age
      expect(deletedCount).toBe(1);

      // Verify it's gone
      const found = await pendingRepo.find(
        testSubRAV.channelId,
        testSubRAV.vmIdFragment,
        testSubRAV.nonce
      );
      expect(found).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      if (!pool || !ravRepo) return;

      // Create a test RAV for this error test
      const subRav = SubRAVUtils.create({
        chainId: BigInt(4),
        channelId: TEST_CHANNEL_ID,
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        accumulatedAmount: BigInt(1000000),
        nonce: BigInt(1),
      });

      const testRAV = {
        subRav,
        signature: new Uint8Array(64),
      };

      // Close the pool to simulate connection error
      await pool.end();

      // Operations should throw meaningful errors
      await expect(ravRepo.save(testRAV)).rejects.toThrow();
    });
  });
});

// Helper to run SQL tests conditionally
export function runSqlTests(): boolean {
  return isPostgreSQLAvailable();
}
