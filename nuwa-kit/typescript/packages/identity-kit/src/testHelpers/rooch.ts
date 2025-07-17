import { TestEnv } from './env';

/**
 * Utility functions for Rooch testing
 */
export const RoochTestUtils = {
  /**
   * Check if we should skip integration tests
   */
  shouldSkip(): boolean {
    return TestEnv.skipIfNoNode();
  },

  /**
   * Get environment check result
   */
  checkEnvironment(): any {
    return TestEnv.checkEnvironmentSync();
  }
};

/**
 * Convenience function to bootstrap a Rooch test environment
 * This is an alias for TestEnv.bootstrap() for backward compatibility
 */
export async function bootstrapRoochTestEnv(options: any = {}): Promise<TestEnv> {
  return TestEnv.bootstrap(options);
} 