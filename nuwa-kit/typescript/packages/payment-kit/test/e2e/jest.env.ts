/**
 * Environment setup for E2E tests
 * This file runs before the test framework is set up
 */

// Set default environment variables for E2E tests
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Only set default ROOCH_NODE_URL if PAYMENT_E2E=1 is set
// This preserves CI skip semantics where tests should be skipped without PAYMENT_E2E=1
if (process.env.PAYMENT_E2E === '1' && !process.env.ROOCH_NODE_URL) {
  process.env.ROOCH_NODE_URL = 'http://localhost:6767';
}

// Enable debug logs in test environment if requested
if (process.env.DEBUG_E2E === '1') {
  process.env.DEBUG = 'payment-kit:*';
}

// Ensure fetch is available (for Node.js environments that don't have it)
if (typeof global.fetch === 'undefined') {
  // In newer Node.js versions (18+), fetch is available globally
  // For older versions, you might need to polyfill it
  try {
    // Try to import node-fetch as a polyfill
    const { default: fetch } = require('node-fetch');
    global.fetch = fetch as any;
  } catch (error) {
    // If node-fetch is not available, that's okay in modern Node.js
    console.warn('Warning: fetch not available globally, assuming Node.js 18+ with built-in fetch');
  }
}
