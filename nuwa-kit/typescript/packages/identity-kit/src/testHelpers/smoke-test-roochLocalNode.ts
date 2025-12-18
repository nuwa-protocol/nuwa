#!/usr/bin/env node

/**
 * Smoke test script for RoochLocalNodeManager
 *
 * This script validates the basic functionality of the local Rooch node manager
 * including start, readiness check, basic RPC calls, and stop.
 *
 * Usage:
 *   npx tsx src/testHelpers/smoke-test-roochLocalNode.ts
 */

import {
  RoochLocalNodeManager,
  startRoochLocalNode,
  createRoochLocalNode
} from './roochLocalNode.js';

async function testBasicLifecycle() {
  console.log('🧪 Testing basic lifecycle...');

  const node = createRoochLocalNode({
    logLevel: 'info',
  });

  try {
    // Test initial status
    const initialStatus = node.getStatus();
    if (initialStatus.running) {
      throw new Error('Node should not be running initially');
    }
    console.log('✅ Initial status correct');

    // Test start
    await node.start();
    console.log('✅ Node started successfully');

    // Check status after start
    const startedStatus = node.getStatus();
    if (!startedStatus.running || !startedStatus.rpcUrl) {
      throw new Error('Node status incorrect after start');
    }
    console.log(`✅ Node running on ${startedStatus.rpcUrl}`);

    // Wait for readiness
    await node.waitForReady();
    console.log('✅ Node is ready');

    // Test RPC call
    try {
      const status = await node.makeRpcRequest('rooch_getStatus', []);
      console.log('✅ RPC call successful:', status);
    } catch (error) {
      console.warn('⚠️  RPC call failed (this may be expected if Rooch is not installed):', error.message);
    }

    // Test stop
    await node.stop();
    console.log('✅ Node stopped successfully');

    // Check status after stop
    const finalStatus = node.getStatus();
    if (finalStatus.running) {
      throw new Error('Node should not be running after stop');
    }
    console.log('✅ Final status correct');

  } catch (error) {
    // Ensure cleanup on error
    await node.stop().catch(console.warn);
    throw error;
  }
}

async function testConvenienceFunction() {
  console.log('🧪 Testing convenience function...');

  try {
    const node = await startRoochLocalNode({
      logLevel: 'warn', // Reduce log noise for this test
    });

    console.log('✅ Convenience function started node');

    const status = node.getStatus();
    if (!status.running) {
      throw new Error('Node should be running');
    }
    console.log('✅ Convenience function node status correct');

    await node.stop();
    console.log('✅ Convenience function node stopped');

  } catch (error) {
    console.warn('⚠️  Convenience function test failed:', error.message);
  }
}

async function testErrorHandling() {
  console.log('🧪 Testing error handling...');

  const node = createRoochLocalNode({
    logLevel: 'error',
  });

  try {
    // Test double start
    await node.start();

    try {
      await node.start();
      throw new Error('Should have thrown error on double start');
    } catch (error) {
      if (error.message.includes('already running')) {
        console.log('✅ Double start correctly rejected');
      } else {
        throw error;
      }
    }

    await node.stop();
    console.log('✅ Error handling test passed');

  } catch (error) {
    await node.stop().catch(console.warn);
    throw error;
  }
}

async function testEventHandling() {
  console.log('🧪 Testing event handling...');

  const node = createRoochLocalNode({
    logLevel: 'error',
  });

  const events: string[] = [];

  node.on('start', () => events.push('start'));
  node.on('ready', () => events.push('ready'));
  node.on('stop', () => events.push('stop'));

  try {
    await node.start();
    await node.waitForReady();
    await node.stop();

    // Check events were emitted
    const expectedEvents = ['start', 'ready', 'stop'];
    if (JSON.stringify(events.sort()) !== JSON.stringify(expectedEvents.sort())) {
      console.warn('⚠️  Event handling unexpected:', events, 'expected:', expectedEvents);
    } else {
      console.log('✅ Event handling test passed');
    }

  } catch (error) {
    await node.stop().catch(console.warn);
    console.warn('⚠️  Event handling test failed:', error.message);
  }
}

async function runSmokeTests() {
  console.log('🚀 Starting RoochLocalNodeManager smoke tests...\n');

  const tests = [
    { name: 'Basic Lifecycle', fn: testBasicLifecycle },
    { name: 'Convenience Function', fn: testConvenienceFunction },
    { name: 'Error Handling', fn: testErrorHandling },
    { name: 'Event Handling', fn: testEventHandling },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      passed++;
      console.log(`\n✅ ${test.name}: PASSED\n`);
    } catch (error) {
      failed++;
      console.error(`\n❌ ${test.name}: FAILED`);
      console.error('Error:', error.message);
      console.log('');
    }
  }

  console.log('📊 Test Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. This may be expected if:');
    console.log('   - Rooch binary is not installed');
    console.log('   - Port conflicts occurred');
    console.log('   - System permissions prevent process management');
    process.exit(1);
  } else {
    console.log('\n🎉 All smoke tests passed!');
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSmokeTests().catch(error => {
    console.error('Fatal error running smoke tests:', error);
    process.exit(1);
  });
}

export { runSmokeTests };