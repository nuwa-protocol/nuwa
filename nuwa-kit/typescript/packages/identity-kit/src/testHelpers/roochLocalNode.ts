// Rooch Local Node Manager for test helpers
// Provides lightweight local node management without external dependencies

import { spawn, ChildProcess } from 'child_process';
import { createServer } from 'net';
import { mkdtemp, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';
import type { RoochNodeOptions, RoochNodeHandle } from './types';

/**
 * Rooch Local Node Manager
 *
 * Provides lightweight local Rooch node management for testing scenarios.
 * Uses only Node.js built-in modules without external dependencies.
 */
export class RoochLocalNode {
  /**
   * Start a local Rooch node
   *
   * @param opts Configuration options
   * @returns Handle to the running node
   */
  static async start(opts: RoochNodeOptions = {}): Promise<RoochNodeHandle> {
    // 1. Validate binary path
    const binaryPath = opts.binaryPath || process.env.ROOCH_E2E_BIN;
    if (!binaryPath) {
      throw new Error('Rooch binary path not found. Set ROOCH_E2E_BIN environment variable or provide binaryPath option.');
    }

    if (!existsSync(binaryPath)) {
      throw new Error(`Rooch binary not found at: ${binaryPath}`);
    }

    // 2. Allocate port if not specified
    const port = opts.port || await this.findAvailablePort();

    // 3. Create temporary directories
    const dataDir = opts.dataDir || await mkdtemp(join(tmpdir(), 'rooch-data-'));
    const logsDir = opts.logsDir || await mkdtemp(join(tmpdir(), 'rooch-logs-'));

    // 4. Initialize Rooch config (required before starting server)
    await this.initializeConfig(binaryPath, dataDir);

    // 5. Prepare spawn arguments
    const args = [
      'server', 'start',
      '-n', opts.network || 'local',
      '-d', dataDir,
      '--port', port.toString(),
      '--config-dir', dataDir,
      ...(opts.serverArgs || [])
    ];

    const child: ChildProcess = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ROOCH_CONFIG_DIR: dataDir
      }
    });

    // Handle stdout and stderr to prevent pipe buffer from filling up
    if (child.stdout) {
      child.stdout.on('data', (data) => {
        console.log(`[Rooch ${port}] ${data.toString()}`);
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        console.error(`[Rooch ${port}] ${data.toString()}`);
      });
    }

    try {

      if (!child.pid) {
        throw new Error('Failed to spawn Rooch process');
      }

      // 5. Wait for startup and perform health check
      await this.ensureReady(`http://127.0.0.1:${port}`, child);

      return {
        rpcUrl: `http://127.0.0.1:${port}`,
        port,
        pid: child.pid,
        dataDir,
        logsDir,
        stop: () => this.stop(child, port, dataDir, logsDir),
        isRunning: () => this.isRunning(child.pid!)
      };

    } catch (error) {
      // Cleanup on failure
      try {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      } catch {}

      // Cleanup directories unless TESTBOX_KEEP_TMP is set
      if (process.env.TESTBOX_KEEP_TMP !== '1') {
        try {
          await rm(dataDir, { recursive: true, force: true });
          await rm(logsDir, { recursive: true, force: true });
        } catch {}
      }

      throw error;
    }
  }

  /**
   * Ensure a Rooch node is ready by checking chain ID
   *
   * @param rpcUrl RPC URL of the node
   * @param child Optional child process to check for exit
   * @param timeout Timeout in milliseconds
   */
  static async ensureReady(rpcUrl: string, child?: ChildProcess, timeout = 30000): Promise<void> {
    const startTime = Date.now();
    const method = 'rooch_getChainID';

    while (Date.now() - startTime < timeout) {
      // Check if process is still running (if provided)
      if (child && (child.killed || child.exitCode !== null)) {
        throw new Error(`Rooch node process exited unexpectedly with code ${child.exitCode}`);
      }

      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method,
            params: []
          }),
          signal: AbortSignal.timeout(5000)
        });

        const data = await response.json();
        if (!data.error && data.result !== null) {
          return; // Node is ready
        }
      } catch (error) {
        // Node not ready yet, continue waiting
      }

      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Rooch node not ready after ${timeout}ms at ${rpcUrl}`);
  }

  /**
   * Initialize Rooch configuration in a directory
   *
   * @param binaryPath Path to rooch binary
   * @param configDir Directory to initialize config in
   */
  private static async initializeConfig(binaryPath: string, configDir: string): Promise<void> {
    const { execFileSync } = await import('child_process');

    try {
      execFileSync(binaryPath, ['init', '--config-dir', configDir, '--skip-password'], {
        stdio: 'pipe'
      });
    } catch (error: any) {
      throw new Error(`Failed to initialize Rooch config: ${error?.message || error}`);
    }
  }

  /**
   * Find an available port starting from the given port
   *
   * @param startPort Starting port number
   * @returns Available port number
   */
  static async findAvailablePort(startPort = 6767): Promise<number> {
    for (let port = startPort; port < startPort + 100; port++) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error(`No available ports found starting from ${startPort}`);
  }

  /**
   * Check if a port is available
   *
   * @param port Port number to check
   * @returns True if port is available
   */
  static async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();

      server.listen(port, () => {
        server.close(() => resolve(true));
      });

      server.on('error', () => resolve(false));
    });
  }

  /**
   * Stop a running node with cleanup
   *
   * @param child Child process to stop
   * @param port Port number to cleanup
   * @param dataDir Data directory to cleanup
   * @param logsDir Logs directory to cleanup
   */
  private static async stop(
    child: ChildProcess,
    port: number,
    dataDir: string,
    logsDir: string
  ): Promise<void> {
    // 1. Graceful shutdown with SIGTERM
    if (!child.killed) {
      child.kill('SIGTERM');

      // Wait for graceful exit (max 10 seconds)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
          resolve();
        }, 10000);

        child.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    // 2. Ensure port is fully released
    await this.waitForPortRelease(port);

    // 3. Cleanup temporary directories (unless TESTBOX_KEEP_TMP)
    if (process.env.TESTBOX_KEEP_TMP !== '1') {
      try {
        await Promise.all([
          rm(dataDir, { recursive: true, force: true }),
          rm(logsDir, { recursive: true, force: true })
        ]);
      } catch (error) {
        // Log cleanup errors but don't fail
        console.warn('Warning: Failed to cleanup temporary directories:', error);
      }
    }
  }

  /**
   * Check if a process is running
   *
   * @param pid Process ID
   * @returns True if process is running
   */
  private static isRunning(pid: number): boolean {
    try {
      process.kill(pid, 0); // Signal 0 just checks if process exists
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for a port to be released
   *
   * @param port Port number
   * @param maxWait Maximum wait time in milliseconds
   */
  private static async waitForPortRelease(port: number, maxWait = 5000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (await this.isPortAvailable(port)) {
        return; // Port is released
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Force cleanup on Unix-like systems
    if (process.platform !== 'win32') {
      try {
        const { execSync } = await import('child_process');
        execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
          stdio: 'ignore',
          timeout: 2000
        });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Convenience function to start a local Rooch node
 *
 * @param opts Configuration options
 * @returns Handle to the running node
 */
export async function startLocalRoochNode(opts: RoochNodeOptions = {}): Promise<RoochNodeHandle> {
  return await RoochLocalNode.start(opts);
}

/**
 * Convenience function to check if a Rooch node is ready
 *
 * @param rpcUrl RPC URL of the node
 * @param timeout Timeout in milliseconds
 */
export async function ensureRoochReady(rpcUrl: string, timeout = 30000): Promise<void> {
  await RoochLocalNode.ensureReady(rpcUrl, undefined, timeout);
}