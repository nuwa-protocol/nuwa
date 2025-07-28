// Test setup for payment-kit
// Add any global test configuration here

// Load environment variables from .env file
require('dotenv').config({ path: '.env' });

// Mock crypto if not available in test environment
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = require('crypto');
  globalThis.crypto = webcrypto;
}

// Mock TextEncoder/TextDecoder if not available
if (typeof TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
} 