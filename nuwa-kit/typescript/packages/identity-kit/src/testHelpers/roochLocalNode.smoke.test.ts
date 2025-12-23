/**
 * Internal smoke test for RoochLocalNode functionality
 *
 * This test validates the core lifecycle management of the local node manager:
 * - Start node with ROOCH_E2E_BIN
 * - Verify health check passes
 * - Test graceful shutdown
 * - Confirm no process/port leakage
 *
 * Run with: ROOCH_E2E_BIN=/path/to/rooch npm test -- roochLocalNode.smoke.test.ts
 */

import { RoochLocalNode, startLocalRoochNode, ensureRoochReady } from './roochLocalNode';
import { TestEnv } from './env';

describe('RoochLocalNode Smoke Test', () => {
  const hasBinary = !!process.env.ROOCH_E2E_BIN;
  const binaryExists = process.env.ROOCH_E2E_BIN ?
    require('fs').existsSync(process.env.ROOCH_E2E_BIN) : false;

  // Skip tests if no Rooch binary is available
  if (!hasBinary || !binaryExists) {
    console.log('⚠️  Skipping RoochLocalNode smoke tests - set ROOCH_E2E_BIN to enable');

    test.skip('all tests - ROOCH_E2E_BIN not set or binary not found', () => {
      // Placeholder test when ROOCH_E2E_BIN is not available
    });
    return;
  }

  let nodeHandle: any;

  afterAll(async () => {
    // Cleanup if test failed
    if (nodeHandle && nodeHandle.isRunning()) {
      try {
        await nodeHandle.stop();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
  });

  test('should start and stop node with default options', async () => {
    console.log('🧪 Testing basic node lifecycle...');

    // Start node
    nodeHandle = await startLocalRoochNode();
    expect(nodeHandle).toBeDefined();
    expect(nodeHandle.rpcUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(nodeHandle.port).toBeGreaterThan(0);
    expect(nodeHandle.pid).toBeGreaterThan(0);
    expect(nodeHandle.dataDir).toMatch(/rooch-data-/);
    expect(nodeHandle.logsDir).toMatch(/rooch-logs-/);
    expect(typeof nodeHandle.stop).toBe('function');
    expect(typeof nodeHandle.isRunning).toBe('function');

    console.log(`✅ Node started: ${nodeHandle.rpcUrl} (PID: ${nodeHandle.pid})`);

    // Verify node is running
    expect(nodeHandle.isRunning()).toBe(true);

    // Test health check function
    await ensureRoochReady(nodeHandle.rpcUrl);
    console.log('✅ Health check passed');

    // Stop node
    await nodeHandle.stop();
    console.log('✅ Node stopped gracefully');

    // Verify node is no longer running
    expect(nodeHandle.isRunning()).toBe(false);
  }, 60000); // 60 second timeout for startup

  test('should support custom configuration', async () => {
    console.log('🧪 Testing custom configuration...');

    const customOptions = {
      network: 'local' as const,
      debug: true,
      serverArgs: ['--log-level', 'debug']
    };

    nodeHandle = await startLocalRoochNode(customOptions);
    expect(nodeHandle.rpcUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(nodeHandle.isRunning()).toBe(true);

    console.log(`✅ Custom node started: ${nodeHandle.rpcUrl}`);

    await nodeHandle.stop();
    console.log('✅ Custom node stopped');
  }, 45000);

  test('should find available ports dynamically', async () => {
    console.log('🧪 Testing dynamic port allocation...');

    const port1 = await RoochLocalNode.findAvailablePort();
    const port2 = await RoochLocalNode.findAvailablePort();

    expect(port1).toBeGreaterThan(0);
    expect(port2).toBeGreaterThan(0);
    // Ports should be different since we're asking for available ports sequentially
    expect(port1).not.toBe(port2);

    console.log(`✅ Found available ports: ${port1}, ${port2}`);
  }, 10000);

  test('should integrate with TestEnv autoStartLocalNode', async () => {
    console.log('🧪 Testing TestEnv integration...');

    // Test with autoStartLocalNode enabled
    const env = await TestEnv.bootstrap({
      autoStartLocalNode: true,
      network: 'local'
    });

    expect(env).toBeDefined();
    expect(env.rpcUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(env.client).toBeDefined();

    console.log(`✅ TestEnv with auto-start node: ${env.rpcUrl}`);

    // Basic connectivity test
    await env.client.getChainId();
    console.log('✅ TestEnv client connectivity verified');

  }, 60000);
});

console.log('🧪 RoochLocalNode Smoke Test Suite');
console.log('Set ROOCH_E2E_BIN=/path/to/rooch to run tests');
console.log('Optional: set TESTBOX_KEEP_TMP=1 to preserve temporary directories');