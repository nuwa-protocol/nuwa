#!/usr/bin/env node
/**
 * Rooch Node Test Runner
 *
 * Runs any command with an auto-provisioned local Rooch node.
 * Downloads binary (if needed), starts node, exports ROOCH_NODE_URL,
 * runs command, and cleans up.
 *
 * Environment Variables:
 * - ROOCH_E2E_PORT: Port for node (default: 0 for dynamic)
 * - ROOCH_E2E_KEEP_TMP=1: Preserve temp directories and logs
 *
 * Usage:
 *   node scripts/e2e/rooch/with-rooch-node.mjs [--port PORT] [--keep] -- <command> [args...]
 *
 * Examples:
 *   pnpm rooch:e2e:with -- pnpm test
 *   ROOCH_E2E_PORT=7000 pnpm rooch:e2e:with -- node test.js
 *   ROOCH_E2E_KEEP_TMP=1 pnpm rooch:e2e:with -- npm run test:e2e
 */

import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENSURE_BINARY_PATH = path.join(__dirname, 'ensure-binary.mjs');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const separatorIndex = args.indexOf('--');

  if (separatorIndex === -1) {
    console.error('Usage: with-rooch-node.mjs [--port PORT] [--keep] -- <command> [args...]');
    process.exit(1);
  }

  const runnerArgs = args.slice(0, separatorIndex);
  const command = args[separatorIndex + 1];
  const commandArgs = args.slice(separatorIndex + 2);

  if (!command) {
    console.error('Error: No command specified after --');
    process.exit(1);
  }

  // Parse runner options
  const options = {
    port: 0,
    keep: false
  };

  for (let i = 0; i < runnerArgs.length; i++) {
    const arg = runnerArgs[i];
    if (arg === '--port' && runnerArgs[i + 1]) {
      const parsedPort = parseInt(runnerArgs[i + 1], 10);
      if (isNaN(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
        console.error(`Error: Invalid port number: ${runnerArgs[i + 1]}`);
        process.exit(1);
      }
      options.port = parsedPort;
      i++;
    } else if (arg === '--keep') {
      options.keep = true;
    }
  }

  // Allow environment variable overrides
  if (process.env.ROOCH_E2E_PORT) {
    const parsedPort = parseInt(process.env.ROOCH_E2E_PORT, 10);
    if (isNaN(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
      console.error(`Error: Invalid port number in ROOCH_E2E_PORT: ${process.env.ROOCH_E2E_PORT}`);
      process.exit(1);
    }
    options.port = parsedPort;
  }
  if (process.env.ROOCH_E2E_KEEP_TMP === '1') {
    options.keep = true;
  }

  return { command, commandArgs, options };
}

/**
 * Get binary path by calling ensure-binary or using existing ROOCH_E2E_BIN
 */
async function getBinaryPath() {
  const { existsSync } = await import('fs');

  // If ROOCH_E2E_BIN is already set and exists, use it
  if (process.env.ROOCH_E2E_BIN) {
    if (existsSync(process.env.ROOCH_E2E_BIN)) {
      console.error(`Using existing binary: ${process.env.ROOCH_E2E_BIN}`);
      return process.env.ROOCH_E2E_BIN;
    }
    console.error(`ROOCH_E2E_BIN set but binary not found, downloading...`);
  }

  // For local development, check if 'rooch' command exists in PATH
  // This allows developers to skip binary download if they have rooch installed
  if (process.env.NODE_ENV !== 'ci' && process.env.CI !== 'true') {
    try {
      execSync('which rooch', { stdio: 'ignore' });
      console.error(`Found 'rooch' command in PATH, using system binary`);
      return 'rooch';
    } catch {
      // rooch not in PATH, continue with download
      console.error(`'rooch' command not found in PATH, downloading binary...`);
    }
  }

  try {
    const result = execSync(`node "${ENSURE_BINARY_PATH}"`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'inherit']
    });
    return result.trim();
  } catch (error) {
    throw new Error(`Failed to ensure binary: ${error.message}`);
  }
}

/**
 * Setup signal handlers for cleanup
 */
function setupSignalHandlers(nodeHandle, commandProcess, keepOptions) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];

  const handler = async (signal) => {
    console.error(`\nReceived ${signal}, shutting down...`);

    let hadErrors = false;

    // Kill command process
    if (commandProcess && !commandProcess.killed) {
      commandProcess.kill('SIGTERM');
    }

    // Stop Rooch node
    if (nodeHandle && !keepOptions.keep) {
      try {
        await nodeHandle.stop();
      } catch (error) {
        console.error(`Error stopping node: ${error.message}`);
        hadErrors = true;
      }
    }

    // Exit with appropriate code
    process.exit(hadErrors ? 1 : 0);
  };

  signals.forEach(sig => process.on(sig, handler));
}

/**
 * Main runner logic
 */
async function main() {
  let nodeHandle = null;
  let commandProcess = null;

  try {
    // 1. Parse arguments
    const { command, commandArgs, options } = parseArgs();

    // 2. Ensure binary
    console.error('Ensuring Rooch binary...');
    const binaryPath = await getBinaryPath();
    console.error(`Binary: ${binaryPath}`);

    // Set ROOCH_E2E_BIN for testHelpers
    process.env.ROOCH_E2E_BIN = binaryPath;

    // 3. Import testHelpers and start local node
    console.error('Starting local Rooch node...');

    // Prefer package resolution for test helpers; fall back to repo-local dist path
    let startLocalRoochNode;
    try {
      const testHelpersModule = await import('@nuwa-ai/identity-kit/testHelpers');
      startLocalRoochNode = testHelpersModule.startLocalRoochNode;
    } catch (packageImportError) {
      console.error('Package import failed, trying local path...');
      const TEST_HELPERS_PATH = path.join(__dirname, '../../../nuwa-kit/typescript/packages/identity-kit/dist/testHelpers/index.js');
      const testHelpersModule = await import(TEST_HELPERS_PATH);
      startLocalRoochNode = testHelpersModule.startLocalRoochNode;
    }

    nodeHandle = await startLocalRoochNode({
      binaryPath,
      port: options.port, // 0 = dynamic port allocation
    });

    console.error(`Node started: ${nodeHandle.rpcUrl}`);
    console.error(`Port: ${nodeHandle.port}`);
    console.error(`Data dir: ${nodeHandle.dataDir}`);
    if (options.keep) {
      console.error(`Keep mode: Temp dirs will be preserved`);
    }

    // 4. Export ROOCH_NODE_URL to child process
    const childEnv = {
      ...process.env,
      ROOCH_NODE_URL: nodeHandle.rpcUrl
    };

    // 5. Spawn command
    console.error(`Running: ${command} ${commandArgs.join(' ')}`);
    commandProcess = spawn(command, commandArgs, {
      stdio: 'inherit',
      env: childEnv
    });

    // 6. Setup signal handlers
    setupSignalHandlers(nodeHandle, commandProcess, options);

    // 7. Wait for command to complete
    const exitCode = await new Promise((resolve) => {
      commandProcess.on('close', resolve);
    });

    // 8. Cleanup
    if (nodeHandle && !options.keep) {
      console.error('Stopping Rooch node...');
      await nodeHandle.stop();
      console.error('Node stopped');
    } else if (options.keep) {
      console.error('');
      console.error('Node kept running:');
      console.error(`  RPC URL: ${nodeHandle.rpcUrl}`);
      console.error(`  Port: ${nodeHandle.port}`);
      console.error(`  PID: ${nodeHandle.pid}`);
      console.error(`  Data dir: ${nodeHandle.dataDir}`);
      console.error('');
      console.error(`To stop manually: kill ${nodeHandle.pid}`);
    }

    process.exit(exitCode || 0);

  } catch (error) {
    console.error(`Error: ${error.message}`);

    // Cleanup on error
    if (nodeHandle && !options.keep) {
      try {
        console.error('Cleaning up...');
        await nodeHandle.stop();
      } catch (cleanupError) {
        console.error(`Cleanup error: ${cleanupError.message}`);
      }
    }

    process.exit(1);
  }
}

// Run
main();
