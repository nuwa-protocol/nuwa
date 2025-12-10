#!/usr/bin/env tsx

/**
 * Example usage of the CAP Diagnostic Tool
 *
 * This example demonstrates how to use the diagnostic tool programmatically
 * to test CAP configurations.
 */

import { DiagnosticEngine } from '../src/core/diagnostic-engine.js';
import { CapResolver } from '../src/core/cap-resolver.js';
import { MCPManager } from '../src/core/mcp-manager.js';
import { LLMProvider } from '../src/core/llm-provider.js';
import type { DiagnosticConfig, Cap } from '../src/types/diagnostic.js';
import { logger } from '../src/utils/logger.js';

// Example CAP configuration
const exampleCap: Cap = {
  id: 'example-cap-001',
  metadata: {
    name: 'Example CAP',
    description: 'An example CAP for demonstration',
    version: '1.0.0',
    author: 'Example Author',
    tags: ['example', 'demo'],
  },
  core: {
    prompt: {
      value:
        'You are a helpful assistant. You can help users with various tasks. Your location is {{user_geo}}.',
    },
    model: {
      id: 'openai/gpt-4o-mini',
    },
    mcpServers: {
      // Example MCP server configuration
      // Note: This would need to be a real MCP server URL
      filesystem: {
        url: 'http://localhost:3001/mcp',
        transport: 'httpStream',
      },
    },
  },
};

// Configuration
const config: DiagnosticConfig = {
  llm: {
    provider: 'openrouter',
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    timeout: 30000,
  },
  mcp: {
    timeout: 30000,
    retries: 3,
  },
  diagnostic: {
    testMessages: ['Hello, can you help me?', 'What can you do?', 'Test your capabilities'],
    maxSteps: 3,
    maxRetries: 2,
  },
};

async function runDiagnosticExample() {
  logger.info('Starting CAP diagnostic example');

  try {
    // Initialize diagnostic engine
    const engine = new DiagnosticEngine(config);

    // Run full diagnosis
    logger.info('Running full CAP diagnosis');
    const result = await engine.diagnoseCap(exampleCap);

    // Display results
    console.log('\n=== Diagnostic Results ===');
    console.log(`CAP: ${result.capName} (${result.capId})`);
    console.log(`Success: ${result.success ? '✅' : '❌'}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Tests: ${result.summary.passedTests}/${result.summary.totalTests} passed`);

    if (result.summary.criticalIssues.length > 0) {
      console.log('\nCritical Issues:');
      result.summary.criticalIssues.forEach(issue => {
        console.log(`  - ${issue}`);
      });
    }

    if (result.summary.warnings.length > 0) {
      console.log('\nWarnings:');
      result.summary.warnings.forEach(warning => {
        console.log(`  - ${warning}`);
      });
    }

    if (result.summary.recommendations.length > 0) {
      console.log('\nRecommendations:');
      result.summary.recommendations.forEach(rec => {
        console.log(`  - ${rec}`);
      });
    }

    // Display individual test results
    console.log('\n=== Individual Test Results ===');
    result.tests.forEach(test => {
      const status = test.success ? '✅' : '❌';
      console.log(`${status} ${test.name} (${test.duration}ms)`);
      if (test.error) {
        console.log(`    Error: ${test.error}`);
      }
      if (test.details) {
        console.log(`    Details:`, test.details);
      }
    });
  } catch (error) {
    logger.error('Diagnostic example failed', { error });
    console.error('Error:', error);
  }
}

async function runComponentExample() {
  logger.info('Starting component usage example');

  try {
    // Example 1: Using CapResolver directly
    logger.info('Testing CapResolver');
    const resolver = new CapResolver(exampleCap, config);

    const resolvedConfig = await resolver.getResolvedConfig();
    console.log('\n=== Resolved Configuration ===');
    console.log('Prompt length:', resolvedConfig.prompt.length);
    console.log('Model ID:', exampleCap.core.model.id);
    console.log('Tools count:', Object.keys(resolvedConfig.tools).length);

    await resolver.cleanup();

    // Example 2: Testing MCP Manager
    logger.info('Testing MCP Manager');
    const mcpManager = MCPManager.getInstance();

    // Test individual MCP server
    const mcpTest = await mcpManager.testMCPServer('http://localhost:3001/mcp');
    console.log('\n=== MCP Server Test ===');
    console.log('Success:', mcpTest.success);
    console.log('Duration:', mcpTest.duration + 'ms');
    if (mcpTest.error) {
      console.log('Error:', mcpTest.error);
    }
    if (mcpTest.toolsCount !== undefined) {
      console.log('Tools available:', mcpTest.toolsCount);
    }

    // Example 3: Testing LLM Provider
    logger.info('Testing LLM Provider');
    const llmProvider = new LLMProvider(config.llm);

    const modelTest = await llmProvider.testModel('openai/gpt-4o-mini');
    console.log('\n=== LLM Model Test ===');
    console.log('Success:', modelTest.success);
    console.log('Duration:', modelTest.duration + 'ms');
    if (modelTest.error) {
      console.log('Error:', modelTest.error);
    }
  } catch (error) {
    logger.error('Component example failed', { error });
    console.error('Error:', error);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--component')) {
    await runComponentExample();
  } else {
    await runDiagnosticExample();
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
