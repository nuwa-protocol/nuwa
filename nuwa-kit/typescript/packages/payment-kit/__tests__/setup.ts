// Test setup for payment-kit
// Add any global test configuration here

import { config } from 'dotenv';
import { webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';

// Load environment variables from .env file
config({ path: '.env' });

// Mock crypto if not available in test environment
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto as any;
}

// Mock TextEncoder/TextDecoder if not available
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as any;
  globalThis.TextDecoder = TextDecoder as any;
} 