/**
 * Jest setup for E2E tests
 * This file runs after the test framework has been set up
 */

import { jest } from '@jest/globals';

// Extend Jest timeout for all E2E tests
jest.setTimeout(120000); // 2 minutes

// Global test setup
beforeAll(async () => {
  // Check if E2E tests should run
  if (process.env.PAYMENT_E2E !== '1') {
    console.log('⚠️ Skipping E2E tests - PAYMENT_E2E environment variable not set to "1"');
    console.log('To run E2E tests, set: PAYMENT_E2E=1');
    return;
  }

  if (!process.env.ROOCH_NODE_URL) {
    console.log('⚠️ No ROOCH_NODE_URL specified, using default: http://localhost:6767');
  }

  console.log('🚀 Starting Payment Kit E2E Test Suite');
  console.log(`📡 Rooch Node URL: ${process.env.ROOCH_NODE_URL || 'http://localhost:6767'}`);
  console.log(`🔧 Node Environment: ${process.env.NODE_ENV || 'test'}`);
});

// Global test teardown
afterAll(async () => {
  if (process.env.PAYMENT_E2E !== '1') {
    return;
  }

  console.log('🏁 Payment Kit E2E Test Suite completed');
  
  // Wait a bit for any pending async operations to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process in tests, just log
}); 