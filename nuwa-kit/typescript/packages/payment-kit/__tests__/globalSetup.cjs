// Global test setup to clear billing strategy registry
// Note: This uses dynamic import to handle ES modules

module.exports = async function () {
  try {
    // Clear billing strategy registry and cache before each test file
    const { clearRegistry, clearCache } = await import('../src/billing/core/strategy-registry.js');
    clearRegistry();
    clearCache();
  } catch (error) {
    // If module is not available, skip registry cleanup
    console.warn('Could not clear billing strategy registry:', error.message);
  }
};