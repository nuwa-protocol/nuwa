import type { Config } from 'jest';

const config: Config = {
  // Base configuration
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',

  // Test file patterns for E2E tests
  testMatch: ['<rootDir>/test/e2e/**/*.e2e.test.ts'],

  // Longer timeouts for E2E tests involving blockchain operations
  testTimeout: 120000, // 2 minutes per test

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/test/e2e/jest.setup.ts'],

  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Transform configuration
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          moduleResolution: 'node',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          module: 'esnext',
        },
      },
    ],
    '^.+\\.jsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },

  // Transform ignore patterns - allow transforming ES modules in node_modules
  transformIgnorePatterns: ['node_modules/(?!(fastmcp|@modelcontextprotocol|ai))'],

  // File extensions to consider
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Coverage configuration (optional for E2E)
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.e2e.test.ts',
    '!test/**/*',
  ],

  // Ignore patterns
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/', '<rootDir>/build/'],

  // Module paths
  modulePaths: ['<rootDir>/src'],

  // Enable experimental ESM support
  extensionsToTreatAsEsm: ['.ts'],

  // Run tests serially to avoid conflicts with blockchain state
  maxWorkers: 1,

  // Verbose output for better debugging
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles to help debug hanging tests
  detectOpenHandles: true,

  // Environment variables for E2E tests
  setupFiles: ['<rootDir>/test/e2e/jest.env.ts'],
};

export default config;
