module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Optional: Specify roots if tests are not at the project root
  // roots: ['<rootDir>/src'], 
  // Optional: Match test files (adjust if needed)
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
    '**/?(*.)+(e2e.test).+(ts|tsx|js)', // Ensure .e2e.test.ts is matched
  ],
  // Optional: Module mapping if needed for imports
  // moduleNameMapper: {
  //   '^@/services/(.*)$': '<rootDir>/src/app/services/$1',
  // },
  setupFiles: [
    'dotenv/config' // load .env file
  ]
};
