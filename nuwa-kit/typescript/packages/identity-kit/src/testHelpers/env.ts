import { RoochClient } from '@roochnetwork/rooch-sdk';
import { DebugLogger } from '../utils/DebugLogger';
import { VDRRegistry } from '../vdr/VDRRegistry';
import { RoochVDR } from '../vdr/roochVDR';
import { KeyManager } from '../keys/KeyManager';
import { MemoryKeyStore } from '../keys/KeyStore';
import { 
  TestEnvOptions, 
  EnvironmentCheck, 
  CreateSelfDidResult, 
  CreateSelfDidOptions,
  CreateCadopDidOptions 
} from './types';

/**
 * Test environment for Rooch DID integration testing
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
      debug: options.debug
    });
    
    // Register VDR if not already registered
    if (!this.vdrRegistry.getVDR('rooch')) {
      this.vdrRegistry.registerVDR(this.roochVDR);
    }

    if (options.debug) {
      this.logger.debug('TestEnv initialized', {
        rpcUrl: this.rpcUrl,
        network: this.network
      });
    }
  }

  /**
   * Bootstrap test environment
   */
  static async bootstrap(options: TestEnvOptions = {}): Promise<TestEnv> {
    const resolvedOptions = await TestEnv.resolveOptions(options);
    
    // Check environment
    const check = await TestEnv.checkEnvironment(resolvedOptions);
    if (check.shouldSkip) {
      throw new Error(`Test environment not available: ${check.reason}`);
    }
    
    return new TestEnv(resolvedOptions);
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
        reason: 'ROOCH_NODE_URL not set in CI environment'
      };
    }
    
    return {
      shouldSkip: false,
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767'
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
        rpcUrl: options.rpcUrl
      };
    } catch (error) {
      const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
      
      if (isCI) {
        return {
          shouldSkip: true,
          reason: `Cannot connect to Rooch node at ${options.rpcUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
      
      // For local development, we might want to continue with a warning
      console.warn(`Warning: Cannot connect to Rooch node at ${options.rpcUrl}. Some tests may fail.`);
      return {
        shouldSkip: false,
        rpcUrl: options.rpcUrl
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
      debug: false
    };

    return { ...defaults, ...options };
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