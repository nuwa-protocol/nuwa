#!/usr/bin/env tsx

/**
 * Simplified CAP Diagnostic Tool
 *
 * This is a simplified version that focuses on core diagnostic functionality
 * without complex OpenRouter provider implementations.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Cap } from './types/cap.js';
import { CapValidator } from './utils/validation.js';
import { logger } from './utils/logger.js';

export interface SimpleDiagnosticResult {
  capId: string;
  capName: string;
  success: boolean;
  timestamp: number;
  duration: number;
  tests: {
    name: string;
    success: boolean;
    duration: number;
    error?: string;
    details?: any;
  }[];
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    criticalIssues: string[];
    warnings: string[];
    recommendations: string[];
  };
}

export class SimpleDiagnosticEngine {
  async diagnoseCap(cap: Cap): Promise<SimpleDiagnosticResult> {
    const startTime = Date.now();
    const capLogger = logger.child({ capId: cap.id, capName: cap.metadata?.displayName });

    capLogger.info('Starting simple CAP diagnosis');

    const tests: SimpleDiagnosticResult['tests'] = [];
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      // Test 1: CAP Validation
      const validationTest = await this.runValidationTest(cap);
      tests.push(validationTest);

      if (!validationTest.success) {
        criticalIssues.push(...(validationTest.details?.errors || []));
      }
      if (validationTest.details?.warnings) {
        warnings.push(...validationTest.details.warnings);
      }

      // Test 2: Configuration Test
      const configTest = await this.runConfigurationTest(cap);
      tests.push(configTest);

      if (!configTest.success) {
        criticalIssues.push(...(configTest.details?.errors || []));
      }
      if (configTest.details?.warnings) {
        warnings.push(...configTest.details.warnings);
      }

      // Test 3: Basic Connectivity Test
      const connectivityTest = await this.runConnectivityTest(cap);
      tests.push(connectivityTest);

      if (!connectivityTest.success) {
        criticalIssues.push(`Connectivity test failed: ${connectivityTest.error}`);
      }

      // Generate recommendations
      recommendations.push(...this.generateRecommendations(tests, cap));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      capLogger.error('Diagnosis failed with unexpected error', { error: errorMessage });

      tests.push({
        name: 'Unexpected Error',
        success: false,
        duration: Date.now() - startTime,
        error: errorMessage,
      });

      criticalIssues.push(`Unexpected error during diagnosis: ${errorMessage}`);
    }

    const duration = Date.now() - startTime;
    const summary = this.generateSummary(tests, criticalIssues, warnings, recommendations);

    const result: SimpleDiagnosticResult = {
      capId: cap.id,
      capName: cap.metadata?.displayName || 'Unknown',
      success: criticalIssues.length === 0,
      timestamp: Date.now(),
      duration,
      tests,
      summary,
    };

    capLogger.info('Simple CAP diagnosis completed', {
      success: result.success,
      duration,
      totalTests: tests.length,
      passedTests: summary.passedTests,
      failedTests: summary.failedTests,
    });

    return result;
  }

  private async runValidationTest(cap: Cap): Promise<SimpleDiagnosticResult['tests'][0]> {
    const startTime = Date.now();

    try {
      const validation = CapValidator.validate(cap);
      const promptValidation = CapValidator.validatePrompt(cap.core.prompt.value);
      const modelValidation = CapValidator.validateModel(cap.core.model.id);

      const allErrors = [
        ...validation.errors,
        ...promptValidation.errors,
        ...modelValidation.errors,
      ];

      const allWarnings = [
        ...validation.warnings,
        ...promptValidation.errors, // Treat prompt validation errors as warnings for now
        ...modelValidation.errors, // Treat model validation errors as warnings for now
      ];

      return {
        name: 'CAP Validation',
        success: validation.valid && promptValidation.valid && modelValidation.valid,
        duration: Date.now() - startTime,
        details: {
          errors: allErrors,
          warnings: allWarnings,
          valid: validation.valid,
        },
      };
    } catch (error) {
      return {
        name: 'CAP Validation',
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async runConfigurationTest(cap: Cap): Promise<SimpleDiagnosticResult['tests'][0]> {
    const startTime = Date.now();

    try {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Test prompt resolution
      try {
        const resolvedPrompt = await this.resolveVariables(cap.core.prompt.value);
        if (resolvedPrompt.length === 0) {
          errors.push('Resolved prompt is empty');
        }
      } catch (error) {
        errors.push(`Prompt resolution failed: ${error}`);
      }

      // Test model configuration
      if (!cap.core.model.id) {
        errors.push('Model ID is missing');
      }

      // Test MCP servers
      if (cap.core.mcpServers) {
        for (const [serverName, serverConfig] of Object.entries(cap.core.mcpServers)) {
          const config = serverConfig as any;
          if (!config.url) {
            errors.push(`MCP server ${serverName} is missing URL`);
          } else {
            try {
              new URL(config.url);
            } catch {
              errors.push(`MCP server ${serverName} has invalid URL: ${config.url}`);
            }
          }
        }
      }

      return {
        name: 'Configuration Test',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: {
          errors,
          warnings,
        },
      };
    } catch (error) {
      return {
        name: 'Configuration Test',
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async runConnectivityTest(cap: Cap): Promise<SimpleDiagnosticResult['tests'][0]> {
    const startTime = Date.now();

    try {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Test MCP server connectivity (basic URL check)
      if (cap.core.mcpServers) {
        for (const [serverName, serverConfig] of Object.entries(cap.core.mcpServers)) {
          const config = serverConfig as any;
          if (config.url) {
            try {
              // Simple HEAD request to check if server is reachable
              const response = await fetch(config.url, {
                method: 'HEAD',
                signal: AbortSignal.timeout(5000),
              });

              if (!response.ok) {
                warnings.push(`MCP server ${serverName} returned status ${response.status}`);
              }
            } catch (error) {
              errors.push(`MCP server ${serverName} is not reachable: ${error}`);
            }
          }
        }
      }

      return {
        name: 'Connectivity Test',
        success: errors.length === 0,
        duration: Date.now() - startTime,
        details: {
          errors,
          warnings,
        },
      };
    } catch (error) {
      return {
        name: 'Connectivity Test',
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async resolveVariables(prompt: string): Promise<string> {
    let resolvedPrompt = prompt;

    // Resolve {{user_geo}} variable
    if (resolvedPrompt.includes('{{user_geo}}')) {
      const userLocation = process.env.USER_LOCATION || 'UTC';
      resolvedPrompt = resolvedPrompt.replace(/\{\{user_geo\}\}/g, userLocation);
    }

    return resolvedPrompt;
  }

  private generateRecommendations(tests: SimpleDiagnosticResult['tests'], cap: Cap): string[] {
    const recommendations: string[] = [];

    // Check for common issues and provide recommendations
    const validationTest = tests.find(t => t.name === 'CAP Validation');
    if (validationTest && !validationTest.success) {
      recommendations.push('Fix validation errors before deploying the CAP');
    }

    const configTest = tests.find(t => t.name === 'Configuration Test');
    if (configTest && !configTest.success) {
      recommendations.push('Check MCP server configurations and network connectivity');
    }

    const connectivityTest = tests.find(t => t.name === 'Connectivity Test');
    if (connectivityTest && !connectivityTest.success) {
      recommendations.push('Ensure MCP servers are running and accessible');
    }

    // Add specific recommendations based on CAP configuration
    if (cap.core.mcpServers && Object.keys(cap.core.mcpServers).length === 0) {
      recommendations.push('Consider adding MCP servers to enhance CAP capabilities');
    }

    if (cap.core.prompt.value.length < 100) {
      recommendations.push('Consider expanding the CAP prompt for better context');
    }

    return recommendations;
  }

  private generateSummary(
    tests: SimpleDiagnosticResult['tests'],
    criticalIssues: string[],
    warnings: string[],
    recommendations: string[]
  ): SimpleDiagnosticResult['summary'] {
    const totalTests = tests.length;
    const passedTests = tests.filter(t => t.success).length;
    const failedTests = totalTests - passedTests;

    return {
      totalTests,
      passedTests,
      failedTests,
      criticalIssues,
      warnings,
      recommendations,
    };
  }
}

// CLI functionality
export async function runSimpleDiagnostic(files: string[]): Promise<void> {
  const engine = new SimpleDiagnosticEngine();
  const results: SimpleDiagnosticResult[] = [];

  for (const file of files) {
    try {
      const cap = await loadCapFile(file);
      logger.info('Diagnosing CAP', {
        file,
        capId: cap.id,
        capName: cap.metadata?.displayName,
      });

      const result = await engine.diagnoseCap(cap);
      results.push(result);

      // Display individual result
      displayResult(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to diagnose CAP', { file, error: errorMessage });

      const errorResult: SimpleDiagnosticResult = {
        capId: 'unknown',
        capName: file,
        success: false,
        timestamp: Date.now(),
        duration: 0,
        tests: [
          {
            name: 'File Loading',
            success: false,
            duration: 0,
            error: errorMessage,
          },
        ],
        summary: {
          totalTests: 1,
          passedTests: 0,
          failedTests: 1,
          criticalIssues: [errorMessage],
          warnings: [],
          recommendations: ['Check file format and accessibility'],
        },
      };

      results.push(errorResult);
      displayResult(errorResult);
    }
  }

  // Display overall summary
  displayOverallSummary(results);

  // Exit with appropriate code
  const hasFailures = results.some(r => !r.success);
  process.exit(hasFailures ? 1 : 0);
}

async function loadCapFile(filePath: string): Promise<Cap> {
  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  try {
    const fileContent = readFileSync(resolvedPath, 'utf-8');
    const capData = JSON.parse(fileContent);

    // Basic validation
    if (!capData.id || !capData.core) {
      throw new Error('Invalid CAP format: missing required fields');
    }

    return capData as Cap;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON format: ${error.message}`);
    }
    throw error;
  }
}

function displayResult(result: SimpleDiagnosticResult) {
  const status = result.success ? '✅ PASS' : '❌ FAIL';
  console.log(`\n${status} ${result.capName} (${result.capId})`);
  console.log(`Duration: ${result.duration}ms`);
  console.log(`Tests: ${result.summary.passedTests}/${result.summary.totalTests} passed`);

  if (result.summary.criticalIssues.length > 0) {
    console.log('Critical Issues:');
    result.summary.criticalIssues.forEach(issue => {
      console.log(`  - ${issue}`);
    });
  }

  if (result.summary.warnings.length > 0) {
    console.log('Warnings:');
    result.summary.warnings.forEach(warning => {
      console.log(`  - ${warning}`);
    });
  }

  if (result.summary.recommendations.length > 0) {
    console.log('Recommendations:');
    result.summary.recommendations.forEach(rec => {
      console.log(`  - ${rec}`);
    });
  }
}

function displayOverallSummary(results: SimpleDiagnosticResult[]) {
  const total = results.length;
  const passed = results.filter(r => r.success).length;
  const failed = total - passed;

  console.log(`\n=== Overall Summary ===`);
  console.log(`Total CAPs: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log(`\nFailed CAPs:`);
    results
      .filter(r => !r.success)
      .forEach(result => {
        console.log(`  - ${result.capName} (${result.capId})`);
      });
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: tsx simple-diagnostic.ts <cap-files...>');
    process.exit(1);
  }

  runSimpleDiagnostic(files).catch(console.error);
}
