import { beforeAll, afterAll, afterEach } from 'vitest';
import { config } from 'dotenv';
// Load test environment variables
config();
// Mock environment variables if not set
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:3000';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-key';
process.env.PACKAGE_ID = process.env.PACKAGE_ID || '0x1';
beforeAll(() => {
  console.log('Setting up test environment...');
});
afterAll(() => {
  console.log('Cleaning up test environment...');
});
afterEach(() => {
  // Clean up any test state between tests
});
