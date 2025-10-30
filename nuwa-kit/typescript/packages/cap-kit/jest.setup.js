// Jest setup file for ESM support
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Set up any global test utilities or configurations here
process.env.NODE_ENV = 'test';

// Mock any modules that might cause issues in test environment
// Add any global mocks or test utilities as needed

export { };
