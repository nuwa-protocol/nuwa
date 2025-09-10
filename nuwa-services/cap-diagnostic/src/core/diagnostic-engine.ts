import { streamText } from 'ai';
import type { Message } from 'ai';
import type { Cap } from '../types/cap.js';
import type { 
  DiagnosticConfig, 
  DiagnosticResult, 
  TestResult, 
  DiagnosticSummary,
  CapTestContext 
} from '../types/diagnostic.js';
import { CapResolver } from './cap-resolver.js';
import { CapValidator } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

export class DiagnosticEngine {
  private config: DiagnosticConfig;

  constructor(config: DiagnosticConfig) {
    this.config = config;
  }

  /**
   * Diagnose a single CAP
   */
  async diagnoseCap(cap: Cap): Promise<DiagnosticResult> {
    const startTime = Date.now();
    const capLogger = logger.child({ capId: cap.id, capName: cap.metadata?.displayName });

    capLogger.info('Starting CAP diagnosis');

    const tests: TestResult[] = [];
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      // Test 1: CAP Validation
      const validationTest = await this.runValidationTest(cap);
      tests.push(validationTest);
      
      if (!validationTest.success) {
        criticalIssues.push(...validationTest.details?.errors || []);
      }
      if (validationTest.details?.warnings) {
        warnings.push(...validationTest.details.warnings);
      }

      // Test 2: Configuration Test
      const configTest = await this.runConfigurationTest(cap);
      tests.push(configTest);
      
      if (!configTest.success) {
        criticalIssues.push(...configTest.details?.errors || []);
      }
      if (configTest.details?.warnings) {
        warnings.push(...configTest.details.warnings);
      }

      // Test 3: LLM Integration Test
      const llmTest = await this.runLLMTest(cap);
      tests.push(llmTest);
      
      if (!llmTest.success) {
        criticalIssues.push(`LLM integration failed: ${llmTest.error}`);
      }

      // Test 4: MCP Integration Test
      const mcpTest = await this.runMCPTest(cap);
      tests.push(mcpTest);
      
      if (!mcpTest.success) {
        criticalIssues.push(`MCP integration failed: ${mcpTest.error}`);
      }

      // Test 5: End-to-End Test
      const e2eTest = await this.runEndToEndTest(cap);
      tests.push(e2eTest);
      
      if (!e2eTest.success) {
        criticalIssues.push(`End-to-end test failed: ${e2eTest.error}`);
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

    const result: DiagnosticResult = {
      capId: cap.id,
      capName: cap.metadata?.displayName || 'Unknown',
      success: criticalIssues.length === 0,
      timestamp: Date.now(),
      duration,
      tests,
      summary,
    };

    capLogger.info('CAP diagnosis completed', { 
      success: result.success, 
      duration,
      totalTests: tests.length,
      passedTests: summary.passedTests,
      failedTests: summary.failedTests
    });

    return result;
  }

  /**
   * Run CAP validation test
   */
  private async runValidationTest(cap: Cap): Promise<TestResult> {
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
        ...modelValidation.errors,  // Treat model validation errors as warnings for now
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

  /**
   * Run configuration test
   */
  private async runConfigurationTest(cap: Cap): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const resolver = new CapResolver(cap, this.config);
      const testResult = await resolver.testConfiguration();
      await resolver.cleanup();

      return {
        name: 'Configuration Test',
        success: testResult.success,
        duration: Date.now() - startTime,
        details: {
          errors: testResult.errors,
          warnings: testResult.warnings,
          ...testResult.details,
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

  /**
   * Run LLM integration test
   */
  private async runLLMTest(cap: Cap): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const resolver = new CapResolver(cap, this.config);
      const model = resolver.getResolvedModel();
      
      // Test with a simple message
      const testMessage: Message = {
        id: 'test-message',
        role: 'user',
        content: 'Hello, this is a test message. Please respond with "OK".',
      };

      const result = await streamText({
        model,
        system: 'You are a helpful assistant. Respond briefly and concisely.',
        messages: [testMessage],
        maxSteps: 1,
        maxRetries: 1,
      });

      // Collect the response
      let responseText = '';
      for await (const chunk of result.textStream) {
        responseText += chunk;
      }

      await resolver.cleanup();

      return {
        name: 'LLM Integration Test',
        success: responseText.length > 0,
        duration: Date.now() - startTime,
        details: {
          responseLength: responseText.length,
          modelId: cap.core.model.id,
        },
      };
    } catch (error) {
      return {
        name: 'LLM Integration Test',
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run MCP integration test
   */
  private async runMCPTest(cap: Cap): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const resolver = new CapResolver(cap, this.config);
      const tools = await resolver.getResolvedTools();
      await resolver.cleanup();

      const hasMCPServers = Object.keys(cap.core.mcpServers || {}).length > 0;
      const hasTools = Object.keys(tools).length > 0;

      return {
        name: 'MCP Integration Test',
        success: !hasMCPServers || hasTools, // Success if no MCP servers or if tools are available
        duration: Date.now() - startTime,
        details: {
          mcpServersCount: Object.keys(cap.core.mcpServers || {}).length,
          toolsCount: Object.keys(tools).length,
          hasMCPServers,
          hasTools,
        },
      };
    } catch (error) {
      return {
        name: 'MCP Integration Test',
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run end-to-end test
   */
  private async runEndToEndTest(cap: Cap): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const resolver = new CapResolver(cap, this.config);
      const { prompt, model, tools } = await resolver.getResolvedConfig();

      // Test with one of the configured test messages
      const testMessage = this.config.diagnostic.testMessages[0] || 'Hello, can you help me?';
      
      const testMessages: Message[] = [
        {
          id: 'test-user-message',
          role: 'user',
          content: testMessage,
        },
      ];

      const result = await streamText({
        model,
        system: prompt,
        messages: testMessages,
        maxSteps: this.config.diagnostic.maxSteps || 3,
        maxRetries: this.config.diagnostic.maxRetries || 2,
        tools: Object.keys(tools).length > 0 ? tools : undefined,
      });

      // Collect the response
      let responseText = '';
      for await (const chunk of result.textStream) {
        responseText += chunk;
      }

      await resolver.cleanup();

      return {
        name: 'End-to-End Test',
        success: responseText.length > 0,
        duration: Date.now() - startTime,
        details: {
          responseLength: responseText.length,
          testMessage,
          toolsUsed: Object.keys(tools).length,
        },
      };
    } catch (error) {
      return {
        name: 'End-to-End Test',
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate recommendations based on test results
   */
  private generateRecommendations(tests: TestResult[], cap: Cap): string[] {
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

    const llmTest = tests.find(t => t.name === 'LLM Integration Test');
    if (llmTest && !llmTest.success) {
      recommendations.push('Verify OpenRouter API key and model availability');
    }

    const mcpTest = tests.find(t => t.name === 'MCP Integration Test');
    if (mcpTest && !mcpTest.success) {
      recommendations.push('Ensure MCP servers are running and accessible');
    }

    const e2eTest = tests.find(t => t.name === 'End-to-End Test');
    if (e2eTest && !e2eTest.success) {
      recommendations.push('Review CAP prompt and test with different input messages');
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

  /**
   * Generate diagnostic summary
   */
  private generateSummary(
    tests: TestResult[],
    criticalIssues: string[],
    warnings: string[],
    recommendations: string[]
  ): DiagnosticSummary {
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
