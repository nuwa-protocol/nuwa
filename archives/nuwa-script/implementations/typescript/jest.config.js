/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  // preset: 'ts-jest', // We'll define transform explicitly instead
  testEnvironment: 'node',
  transform: {
    // Use ts-jest for .ts files (and .tsx if you had them)
    '^.+\\.tsx?$': ['ts-jest', {
      // ts-jest configuration options can go here if needed,
      // e.g., specifying tsconfig:
      // tsconfig: 'tsconfig.json'
      useESM: true
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  extensionsToTreatAsEsm: ['.ts'],
  // Optional: specify test file pattern if needed
  // testMatch: [
  //   '**/tests/**/*.test.ts'
  // ],
};

export default config;
