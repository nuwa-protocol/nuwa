/**
 * Simplified Performance tests for UsagePolicy refactoring
 * Focus on core performance metrics without excessive logging
 */

import { CostCalculator } from '../../src/billing/usage/CostCalculator.js';
import { DefaultUsageExtractor } from '../../src/billing/usage/DefaultUsageExtractor.js';
import { DefaultStreamProcessor } from '../../src/billing/usage/DefaultStreamProcessor.js';

// Test data
const sampleUsage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
const sampleResponseBody = {
  usage: {
    prompt_tokens: 1000,
    completion_tokens: 500,
    total_tokens: 1500,
  },
};

/**
 * Measure execution time with minimal overhead
 */
function measurePerformance<T>(fn: () => T, iterations: number = 1000): number {
  // Warm up
  for (let i = 0; i < 10; i++) {
    fn();
  }

  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = process.hrtime.bigint();

  return Number(end - start) / 1_000_000 / iterations; // ms per call
}

describe('Performance Tests (Simplified)', () => {
  // Suppress console output during tests
  let originalConsole: any;

  beforeAll(() => {
    originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  afterAll(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  test('Core operations performance benchmark', () => {
    const iterations = 1000;
    const extractor = new DefaultUsageExtractor();

    // Test 1: Usage extraction
    const extractionTime = measurePerformance(() => {
      return extractor.extractFromResponseBody(sampleResponseBody);
    }, iterations);

    // Test 2: Cost calculation with provider cost
    const providerCostTime = measurePerformance(() => {
      return CostCalculator.calculateProviderRequestCost('openai', 'gpt-4', 0.05, sampleUsage);
    }, iterations);

    // Test 3: Cost calculation with gateway pricing
    const gatewayCostTime = measurePerformance(() => {
      return CostCalculator.calculateProviderRequestCost('openai', 'gpt-4', undefined, sampleUsage);
    }, iterations);

    // Test 4: Multiplier application
    const multiplierTime = measurePerformance(() => {
      return CostCalculator.applyMultiplier(0.05);
    }, iterations);

    // Test 5: Stream processor creation
    const processorCreationTime = measurePerformance(() => {
      return new DefaultStreamProcessor('gpt-4', extractor, 0.1);
    }, iterations);

    // Output results
    originalConsole.log('\n📊 Performance Benchmark Results:');
    originalConsole.log(`  Usage Extraction: ${extractionTime.toFixed(4)}ms avg`);
    originalConsole.log(`  Provider Cost Calc: ${providerCostTime.toFixed(4)}ms avg`);
    originalConsole.log(`  Gateway Cost Calc: ${gatewayCostTime.toFixed(4)}ms avg`);
    originalConsole.log(`  Multiplier Apply: ${multiplierTime.toFixed(4)}ms avg`);
    originalConsole.log(`  Processor Creation: ${processorCreationTime.toFixed(4)}ms avg`);

    // Performance assertions (generous thresholds for CI environments)
    expect(extractionTime).toBeLessThan(10); // 10ms per extraction
    expect(providerCostTime).toBeLessThan(10); // 10ms per provider cost calc
    expect(gatewayCostTime).toBeLessThan(20); // 20ms per gateway cost calc (includes pricing lookup)
    expect(multiplierTime).toBeLessThan(1); // 1ms per multiplier application
    expect(processorCreationTime).toBeLessThan(10); // 10ms per processor creation
  });

  test('Memory usage should be reasonable', () => {
    const initialMemory = process.memoryUsage().heapUsed;
    const extractor = new DefaultUsageExtractor();

    // Perform many operations
    for (let i = 0; i < 100; i++) {
      extractor.extractFromResponseBody(sampleResponseBody);
      CostCalculator.calculateProviderRequestCost('openai', 'gpt-4', 0.05, sampleUsage);
      const processor = new DefaultStreamProcessor('gpt-4', extractor, 0.1);
      processor.processChunk('data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n');
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    originalConsole.log(
      `\n💾 Memory increase after 100 operations: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`
    );

    // Should not increase memory by more than 50MB
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
  });

  test('Concurrent operations should not degrade performance significantly', async () => {
    const concurrentCalls = 50;
    const promises: Promise<any>[] = [];
    const extractor = new DefaultUsageExtractor();

    const start = process.hrtime.bigint();

    for (let i = 0; i < concurrentCalls; i++) {
      promises.push(
        Promise.resolve().then(() => {
          extractor.extractFromResponseBody(sampleResponseBody);
          return CostCalculator.calculateProviderRequestCost('openai', 'gpt-4', 0.05, sampleUsage);
        })
      );
    }

    await Promise.all(promises);

    const end = process.hrtime.bigint();
    const totalTime = Number(end - start) / 1_000_000;
    const avgTime = totalTime / concurrentCalls;

    originalConsole.log(
      `\n🔄 Concurrent operations (${concurrentCalls} calls): ${avgTime.toFixed(4)}ms avg`
    );

    // Should handle concurrent calls reasonably well
    expect(avgTime).toBeLessThan(50); // 50ms per concurrent operation
  });
});
