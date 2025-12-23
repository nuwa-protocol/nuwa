import { RoochClient } from '@roochnetwork/rooch-sdk';
import { DebugLogger } from '../utils/DebugLogger';
import { VDRRegistry } from '../vdr/VDRRegistry';
import { RoochVDR } from '../vdr/roochVDR';
import { KeyManager } from '../keys/KeyManager';
import { MemoryKeyStore } from '../keys/KeyStore';
import { existsSync } from 'fs';
import {
  TestEnvOptions,
  EnvironmentCheck,
  CreateSelfDidResult,
  CreateSelfDidOptions,
  CreateCadopDidOptions,
  RoochNodeOptions,
  RoochNodeHandle,
} from './types';
import { RoochLocalNode } from './roochLocalNode';

/**
 * Test environment for Rooch DID integration testing
 *
 * Provides a pre-configured environment with:
 * - Rooch client and VDR registry
 * - Helper methods for creating test identities
 *
 * Note: Each createSelfDid() call returns its own dedicated IdentityEnv,
 * which is preferred for multi-party testing scenarios to avoid conflicts.
 */
export class TestEnv {
  private static instance?: TestEnv;
  private logger: DebugLogger;

  public readonly rpcUrl: string;
  public readonly network: string;
  public readonly client: RoochClient;
  public readonly vdrRegistry: VDRRegistry;
  public readonly roochVDR: RoochVDR;

  private constructor(options: Required<TestEnvOptions>) {
    this.logger = DebugLogger.get('TestEnv');
    this.rpcUrl = options.rpcUrl;
    this.network = options.network;

    // Initialize Rooch client
    this.client = new RoochClient({ url: this.rpcUrl });

    // Initialize VDR
    this.vdrRegistry = VDRRegistry.getInstance();
    this.roochVDR = new RoochVDR({
      rpcUrl: this.rpcUrl,
      network: options.network as any,
      debug: options.debug,
    });

    // Register VDR if not already registered
    if (!this.vdrRegistry.getVDR('rooch')) {
      this.vdrRegistry.registerVDR(this.roochVDR);
    }

    if (options.debug) {
      this.logger.debug('TestEnv initialized', {
        rpcUrl: this.rpcUrl,
        network: this.network,
      });
    }
  }

  /**
   * Bootstrap test environment
   */
  static async bootstrap(options: TestEnvOptions = {}): Promise<TestEnv> {
    const resolvedOptions = await TestEnv.resolveOptions(options);
    let localNode: RoochNodeHandle | undefined;

    // If autoStartLocalNode is enabled, try to start a local node
    if (resolvedOptions.autoStartLocalNode) {
      try {
        // First, check if existing node is available
        const check = await TestEnv.checkEnvironment(resolvedOptions);
        if (!check.shouldSkip) {
          // Existing node is available, use it
          return new TestEnv(resolvedOptions);
        }
      } catch (error) {
        // Continue to start local node
      }

      try {
        console.log('🚀 Starting local Rooch node for testing...');
        localNode = await RoochLocalNode.start({
          binaryPath: process.env.ROOCH_E2E_BIN,
          network: resolvedOptions.network,
          debug: resolvedOptions.debug
        });

        // Update RPC URL to use the local node
        resolvedOptions.rpcUrl = localNode.rpcUrl;
        console.log(`✅ Local Rooch node started at ${localNode.rpcUrl}`);

        // Register cleanup handlers
        const cleanup = async () => {
          try {
            if (localNode) {
              console.log('🛑 Stopping local Rooch node...');
              await localNode.stop();
              console.log('✅ Local Rooch node stopped');
            }
          } catch (error) {
            console.error('❌ Error stopping local node:', error);
          }
        };

        // Register cleanup for various exit scenarios
        process.once('exit', cleanup);
        process.once('SIGINT', cleanup);
        process.once('SIGTERM', cleanup);
        process.once('SIGUSR2', cleanup); // nodemon restart

      } catch (error) {
        throw new Error(`Failed to start local Rooch node: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    try {
      // Check environment (will test connectivity to local node if started)
      const check = await TestEnv.checkEnvironment(resolvedOptions);
      if (check.shouldSkip) {
        throw new Error(`Test environment not available: ${check.reason}`);
      }

      return new TestEnv(resolvedOptions);
    } catch (error) {
      // Cleanup local node if TestEnv creation failed
      if (localNode) {
        try {
          await localNode.stop();
        } catch {
          // Ignore cleanup errors during failure cleanup
        }
      }
      throw error;
    }
  }

  /**
   * Check if integration tests should be skipped
   */
  static skipIfNoNode(): boolean {
    const check = TestEnv.checkEnvironmentSync();
    return check.shouldSkip;
  }

  /**
   * Synchronous environment check
   */
  static checkEnvironmentSync(): EnvironmentCheck {
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const hasRpcUrl = !!process.env.ROOCH_NODE_URL;

    if (isCI && !hasRpcUrl) {
      return {
        shouldSkip: true,
        reason: 'ROOCH_NODE_URL not set in CI environment',
      };
    }

    return {
      shouldSkip: false,
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
    };
  }

  /**
   * Async environment check with RPC connectivity test
   */
  static async checkEnvironment(options: Required<TestEnvOptions>): Promise<EnvironmentCheck> {
    try {
      const client = new RoochClient({ url: options.rpcUrl });
      // Try to get chain ID to verify connectivity
      await client.getChainId();

      return {
        shouldSkip: false,
        rpcUrl: options.rpcUrl,
      };
    } catch (error) {
      const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

      if (isCI) {
        return {
          shouldSkip: true,
          reason: `Cannot connect to Rooch node at ${options.rpcUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }

      // For local development, we might want to continue with a warning
      console.warn(
        `Warning: Cannot connect to Rooch node at ${options.rpcUrl}. Some tests may fail.`
      );
      return {
        shouldSkip: false,
        rpcUrl: options.rpcUrl,
      };
    }
  }

  /**
   * Resolve options with defaults
   */
  private static async resolveOptions(options: TestEnvOptions): Promise<Required<TestEnvOptions>> {
    const defaults = {
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      network: 'test' as const,
      autoStartLocalNode: false,
      faucetAmount: BigInt(1000000), // 1M base units
      debug: false,
    };

    const resolved = { ...defaults, ...options };

    // If autoStartLocalNode is enabled, validate ROOCH_E2E_BIN
    if (resolved.autoStartLocalNode) {
      const binaryPath = process.env.ROOCH_E2E_BIN;
      if (!binaryPath) {
        throw new Error('ROOCH_E2E_BIN environment variable is required when autoStartLocalNode is enabled');
      }

      if (!existsSync(binaryPath)) {
        throw new Error(`Rooch binary not found at: ${binaryPath}. Set ROOCH_E2E_BIN to a valid Rooch binary path.`);
      }
    }

    return resolved;
  }

  /**
   * Fund an account via faucet (placeholder for future implementation)
   */
  async fundAccount(address: string, amount?: bigint): Promise<void> {
    // This is a placeholder - actual faucet implementation would depend on the network
    this.logger.debug('Funding account', { address, amount });
    // For now, we assume accounts have sufficient funds or skip funding
  }
}
