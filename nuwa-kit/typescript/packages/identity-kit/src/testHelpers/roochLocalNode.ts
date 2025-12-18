/**
 * Local Rooch node manager for E2E testing
 *
 * This module provides a minimal local Rooch node manager with clean lifecycle management,
 * including start, readiness check, and stop functionality with robust cleanup.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { mkdir, rm, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { once, EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);

/**
 * Configuration options for the local Rooch node
 */
export interface RoochLocalNodeOptions {
  /** Port for the JSON-RPC server (default: random available port) */
  port?: number;
  /** Directory for Rooch data (default: temp directory) */
  dataDir?: string;
  /** Path to Rooch binary (default: discover from PATH) */
  roochPath?: string;
  /** Chain ID to use (default: dev) */
  chainId?: string;
  /** Timeout for node startup (default: 30 seconds) */
  startupTimeout?: number;
  /** Timeout for readiness check (default: 5 seconds) */
  readinessTimeout?: number;
  /** Log level (default: info) */
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

/**
 * Node status information
 */
export interface RoochNodeStatus {
  /** Whether the node is running */
  running: boolean;
  /** Whether the node is ready to accept requests */
  ready: boolean;
  /** JSON-RPC server URL */
  rpcUrl: string;
  /** Process ID (if running) */
  pid?: number;
  /** Port number */
  port: number;
  /** Data directory path */
  dataDir: string;
}

/**
 * Events emitted by the local node manager
 */
export interface RoochLocalNodeEvents {
  /** Emitted when the node process starts */
  start: [];
  /** Emitted when the node is ready to accept requests */
  ready: [{ rpcUrl: string }];
  /** Emitted when the node process stops */
  stop: [{ code: number | null; signal: string | null }];
  /** Emitted when an error occurs */
  error: [Error];
  /** Emitted on stdout output */
  stdout: [data: Buffer];
  /** Emitted on stderr output */
  stderr: [data: Buffer];
}

/**
 * declare EventEmitter class with typed events
 */
declare interface RoochLocalNodeManager {
  on<EventName extends keyof RoochLocalNodeEvents>(
    event: EventName,
    listener: (...args: RoochLocalNodeEvents[EventName]) => void,
  ): this;
  once<EventName extends keyof RoochLocalNodeEvents>(
    event: EventName,
    listener: (...args: RoochLocalNodeEvents[EventName]) => void,
  ): this;
  emit<EventName extends keyof RoochLocalNodeEvents>(
    event: EventName,
    ...args: RoochLocalNodeEvents[EventName],
  ): boolean;
}

/**
 * Local Rooch node manager for E2E testing
 *
 * Provides clean lifecycle management for a local Rooch node instance,
 * including automatic port discovery, data directory management,
 * and robust cleanup with signal handling.
 */
export class RoochLocalNodeManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private options: Required<Omit<RoochLocalNodeOptions, 'port' | 'dataDir'>> & {
    port: number | null;
    dataDir: string | null;
  };
  private status: RoochNodeStatus;
  private cleanupCallbacks: Array<() => Promise<void>> = [];

  constructor(options: RoochLocalNodeOptions = {}) {
    super();

    // Set default options
    this.options = {
      port: options.port ?? null,
      dataDir: options.dataDir ?? null,
      roochPath: options.roochPath ?? 'rooch',
      chainId: options.chainId ?? 'dev',
      startupTimeout: options.startupTimeout ?? 30000,
      readinessTimeout: options.readinessTimeout ?? 5000,
      logLevel: options.logLevel ?? 'info',
    };

    // Initialize status
    this.status = {
      running: false,
      ready: false,
      rpcUrl: '',
      port: 0,
      dataDir: '',
    };

    // Setup process cleanup handlers
    this.setupProcessCleanup();
  }

  /**
   * Get current node status
   */
  public getStatus(): Readonly<RoochNodeStatus> {
    return { ...this.status };
  }

  /**
   * Start the local Rooch node
   *
   * @throws {Error} If node is already running or fails to start
   */
  public async start(): Promise<void> {
    if (this.status.running) {
      throw new Error('Rooch node is already running');
    }

    try {
      // Discover available port if not specified
      if (!this.options.port) {
        this.options.port = await this.findAvailablePort();
      }

      // Create data directory if not specified
      if (!this.options.dataDir) {
        this.options.dataDir = await this.createTempDataDir();
      }

      // Find Rooch binary
      const roochBinary = await this.findRoochBinary();

      // Build command arguments
      const args = [
        'node',
        'start',
        '--host', '0.0.0.0',
        '--port', this.options.port.toString(),
        '--json-rpc-port', this.options.port.toString(),
        '--chain-id', this.options.chainId,
        '--data-dir', this.options.dataDir,
        '--log-level', this.options.logLevel,
      ];

      // Start the process
      this.process = spawn(roochBinary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          RUST_LOG: this.options.logLevel,
        },
      });

      // Update status
      this.status.running = true;
      this.status.pid = this.process.pid;
      this.status.port = this.options.port;
      this.status.dataDir = this.options.dataDir;
      this.status.rpcUrl = `http://127.0.0.1:${this.options.port}`;

      // Setup event handlers
      this.setupProcessEvents();

      // Wait for node to be ready
      await this.waitForReady();

      this.emit('start');
      console.log(`Rooch node started on port ${this.options.port}, PID: ${this.process.pid}`);
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the local Rooch node
   *
   * @param timeout Timeout in milliseconds to force kill (default: 10 seconds)
   */
  public async stop(timeout = 10000): Promise<void> {
    if (!this.process || !this.status.running) {
      return;
    }

    const pid = this.process.pid;

    try {
      // Try graceful shutdown first
      this.process.kill('SIGTERM');

      // Wait for graceful shutdown with timeout
      await Promise.race([
        once(this.process, 'exit'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for process to exit')), timeout)
        ),
      ]);
    } catch (error) {
      // Force kill if graceful shutdown failed
      console.warn('Graceful shutdown failed, force killing process:', error);
      this.process.kill('SIGKILL');
    }

    await this.cleanup();
    this.emit('stop', { code: this.process.exitCode, signal: this.process.signalCode });
    console.log(`Rooch node stopped, PID: ${pid}`);
  }

  /**
   * Check if the node is ready to accept requests
   */
  public async isReady(): Promise<boolean> {
    if (!this.status.running || !this.status.rpcUrl) {
      return false;
    }

    try {
      const response = await this.makeRpcRequest('rooch_getStatus', []);
      return typeof response === 'object' && response !== null;
    } catch {
      return false;
    }
  }

  /**
   * Wait for the node to be ready
   *
   * @param timeout Timeout in milliseconds (default: options.readinessTimeout)
   */
  public async waitForReady(timeout?: number): Promise<void> {
    const timeoutMs = timeout ?? this.options.readinessTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await this.isReady()) {
        this.status.ready = true;
        this.emit('ready', { rpcUrl: this.status.rpcUrl });
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Rooch node failed to become ready within ${timeoutMs}ms`);
  }

  /**
   * Make a JSON-RPC request to the node
   */
  public async makeRpcRequest(method: string, params: any[] = []): Promise<any> {
    if (!this.status.rpcUrl) {
      throw new Error('Node RPC URL not available');
    }

    const response = await fetch(this.status.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: randomBytes(16).toString('hex'),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(`RPC error: ${result.error.message || JSON.stringify(result.error)}`);
    }

    return result.result;
  }

  /**
   * Find an available port
   */
  private async findAvailablePort(): Promise<number> {
    // Simple port discovery - try ports in a range
    const startPort = 50000;
    const maxPort = 65535;

    for (let port = startPort; port <= maxPort; port++) {
      try {
        const net = await import('node:net');
        const server = new net.Server();

        await new Promise<void>((resolve, reject) => {
          server.listen(port, '127.0.0.1', () => {
            server.close(resolve);
          });
          server.on('error', reject);
        });

        return port;
      } catch {
        // Port in use, try next
        continue;
      }
    }

    throw new Error('No available ports found');
  }

  /**
   * Create a temporary data directory
   */
  private async createTempDataDir(): Promise<string> {
    const os = await import('node:os');
    const tmpdir = os.tmpdir();
    const randomSuffix = randomBytes(8).toString('hex');
    const dataDir = join(tmpdir, `rooch-test-${randomSuffix}`);

    await mkdir(dataDir, { recursive: true });

    // Register cleanup callback
    this.cleanupCallbacks.push(async () => {
      try {
        await rm(dataDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to cleanup data directory:', error);
      }
    });

    return dataDir;
  }

  /**
   * Find the Rooch binary in PATH
   */
  private async findRoochBinary(): Promise<string> {
    const { which } = await import('which');

    try {
      if (this.options.roochPath !== 'rooch') {
        // Check if custom path exists
        await access(this.options.roochPath);
        return this.options.roochPath;
      }

      // Find in PATH
      return await which('rooch');
    } catch (error) {
      throw new Error(`Rooch binary not found: ${this.options.roochPath}. Please install Rooch or specify roochPath option.`);
    }
  }

  /**
   * Setup process event handlers
   */
  private setupProcessEvents(): void {
    if (!this.process) return;

    this.process.on('stdout', (data: Buffer) => {
      this.emit('stdout', data);
    });

    this.process.on('stderr', (data: Buffer) => {
      this.emit('stderr', data);
    });

    this.process.on('exit', (code: number | null, signal: string | null) => {
      this.status.running = false;
      this.status.ready = false;
      this.process = null;

      if (code !== 0 && code !== null) {
        const error = new Error(`Rooch process exited with code ${code}`);
        this.emit('error', error);
      }
    });

    this.process.on('error', (error: Error) => {
      this.status.running = false;
      this.status.ready = false;
      this.process = null;
      this.emit('error', error);
    });
  }

  /**
   * Setup process cleanup handlers for robust shutdown
   */
  private setupProcessCleanup(): void {
    const cleanup = async () => {
      if (this.status.running) {
        console.log('Cleaning up Rooch node...');
        try {
          await this.stop(5000); // Shorter timeout for cleanup
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
      }
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('beforeExit', cleanup);
    process.once('exit', cleanup);
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    this.status.running = false;
    this.status.ready = false;
    this.process = null;
    this.status.rpcUrl = '';

    // Run cleanup callbacks
    const callbacks = [...this.cleanupCallbacks];
    this.cleanupCallbacks = [];

    await Promise.all(callbacks.map(cb =>
      cb().catch(error => console.warn('Cleanup callback failed:', error))
    ));
  }
}

/**
 * Default instance for convenience
 */
export const roochLocalNode = new RoochLocalNodeManager();

/**
 * Convenience function to create and start a local Rooch node
 *
 * @param options Configuration options
 * @returns Promise that resolves to the node manager instance
 */
export async function startRoochLocalNode(options?: RoochLocalNodeOptions): Promise<RoochLocalNodeManager> {
  const node = new RoochLocalNodeManager(options);
  await node.start();
  return node;
}

/**
 * Convenience function to create a local Rooch node without starting it
 *
 * @param options Configuration options
 * @returns Node manager instance
 */
export function createRoochLocalNode(options?: RoochLocalNodeOptions): RoochLocalNodeManager {
  return new RoochLocalNodeManager(options);
}