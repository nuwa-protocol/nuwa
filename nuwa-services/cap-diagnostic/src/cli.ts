#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { DiagnosticEngine } from './core/diagnostic-engine.js';
import { CapSchema } from './types/cap.js';
import type { DiagnosticConfig, DiagnosticResult } from './types/diagnostic.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('cap-diagnostic')
  .description('CAP diagnostic tool for server-side testing')
  .version('1.0.0');

program
  .command('diagnose')
  .description('Diagnose CAP configuration files')
  .argument('<files...>', 'CAP files to diagnose (JSON format)')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-o, --output <path>', 'Output file for diagnostic results')
  .option('-v, --verbose', 'Verbose output')
  .option('--format <format>', 'Output format (json|table)', 'table')
  .action(async (files: string[], options) => {
    try {
      // Load configuration
      const config = await loadConfig(options.config);

      // Set log level
      if (options.verbose) {
        logger.winston.level = 'debug';
      }

      logger.info('Starting CAP diagnosis', {
        files: files.length,
        config: options.config,
        output: options.output,
      });

      // Initialize diagnostic engine
      const engine = new DiagnosticEngine(config);

      // Process each file
      const results: DiagnosticResult[] = [];

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
          displayResult(result, options.format);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to diagnose CAP', { file, error: errorMessage });

          const errorResult: DiagnosticResult = {
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
          displayResult(errorResult, options.format);
        }
      }

      // Save results to file if requested
      if (options.output) {
        const outputData = {
          timestamp: Date.now(),
          config: options.config,
          results,
          summary: generateOverallSummary(results),
        };

        writeFileSync(options.output, JSON.stringify(outputData, null, 2));
        logger.info('Results saved to file', { output: options.output });
      }

      // Display overall summary
      displayOverallSummary(results);

      // Exit with appropriate code
      const hasFailures = results.some(r => !r.success);
      process.exit(hasFailures ? 1 : 0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Diagnosis failed', { error: errorMessage });
      console.error(`Error: ${errorMessage}`);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate CAP configuration files')
  .argument('<files...>', 'CAP files to validate')
  .option('-v, --verbose', 'Verbose output')
  .action(async (files: string[], options) => {
    try {
      if (options.verbose) {
        logger.winston.level = 'debug';
      }

      logger.info('Validating CAP files', { files: files.length });

      let allValid = true;

      for (const file of files) {
        try {
          const cap = await loadCapFile(file);
          const validation = CapSchema.safeParse(cap);

          if (validation.success) {
            console.log(`✅ ${file}: Valid`);
          } else {
            console.log(`❌ ${file}: Invalid`);
            console.log('  Errors:', validation.error.errors);
            allValid = false;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ ${file}: Error - ${errorMessage}`);
          allValid = false;
        }
      }

      process.exit(allValid ? 0 : 1);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Validation failed', { error: errorMessage });
      console.error(`Error: ${errorMessage}`);
      process.exit(1);
    }
  });

program
  .command('models')
  .description('List available LLM models')
  .option('-p, --provider <provider>', 'Filter by provider (openai, anthropic, google, etc.)', '')
  .option('-f, --format <format>', 'Output format (table|json|list)', 'table')
  .option('-v, --verbose', 'Show detailed model information')
  .action(async options => {
    try {
      if (options.verbose) {
        logger.winston.level = 'debug';
      }

      logger.info('Listing available models', {
        provider: options.provider,
        format: options.format,
      });

      const models = await getAvailableModels();
      const filteredModels = options.provider
        ? models.filter(model => model.id.toLowerCase().includes(options.provider.toLowerCase()))
        : models;

      if (options.format === 'json') {
        console.log(JSON.stringify(filteredModels, null, 2));
      } else if (options.format === 'list') {
        filteredModels.forEach(model => {
          console.log(model.id);
        });
      } else {
        // Table format
        displayModelsTable(filteredModels, options.verbose);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to list models', { error: errorMessage });
      console.error(`Error: ${errorMessage}`);
      process.exit(1);
    }
  });

// Helper functions

async function loadConfig(configPath?: string): Promise<DiagnosticConfig> {
  const defaultConfig: DiagnosticConfig = {
    llm: {
      provider: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.LLM_GATEWAY_BASE_URL || 'https://openrouter.ai/api/v1',
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

  if (!configPath) {
    return defaultConfig;
  }

  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
    return { ...defaultConfig, ...configData };
  } catch (error) {
    throw new Error(`Failed to parse configuration file: ${error}`);
  }
}

async function loadCapFile(filePath: string) {
  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const ext = extname(resolvedPath).toLowerCase();
  if (ext !== '.json') {
    throw new Error(`Unsupported file format: ${ext}. Only JSON files are supported.`);
  }

  try {
    const fileContent = readFileSync(resolvedPath, 'utf-8');
    const capData = JSON.parse(fileContent);

    // Validate against schema
    const validation = CapSchema.safeParse(capData);
    if (!validation.success) {
      throw new Error(
        `Invalid CAP format: ${validation.error.errors.map(e => e.message).join(', ')}`
      );
    }

    return validation.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON format: ${error.message}`);
    }
    throw error;
  }
}

function displayResult(result: DiagnosticResult, format: string) {
  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Table format
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

function displayOverallSummary(results: DiagnosticResult[]) {
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

function generateOverallSummary(results: DiagnosticResult[]) {
  const total = results.length;
  const passed = results.filter(r => r.success).length;
  const failed = total - passed;

  return {
    total,
    passed,
    failed,
    successRate: (passed / total) * 100,
    averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / total,
  };
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextLength?: number;
  pricing?: {
    input: string;
    output: string;
  };
}

async function getAvailableModels(): Promise<ModelInfo[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    logger.warn('No OpenRouter API key found. Using fallback model list.');
    return getFallbackModels();
  }

  try {
    logger.info('Fetching models from OpenRouter API');

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response format from OpenRouter API');
    }

    // Transform OpenRouter API response to our ModelInfo format
    const models: ModelInfo[] = data.data.map((model: any) => ({
      id: model.id,
      name: model.name || model.id.split('/').pop() || model.id,
      provider: model.id.split('/')[0] || 'Unknown',
      description:
        model.description || model.context_length
          ? `Context: ${model.context_length} tokens`
          : undefined,
      contextLength: model.context_length,
      pricing: model.pricing
        ? {
            input: model.pricing.prompt ? `$${model.pricing.prompt}/1M tokens` : 'N/A',
            output: model.pricing.completion ? `$${model.pricing.completion}/1M tokens` : 'N/A',
          }
        : undefined,
    }));

    logger.info(`Successfully fetched ${models.length} models from OpenRouter`);
    return models;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to fetch models from OpenRouter API', { error: errorMessage });
    logger.info('Falling back to static model list');
    return getFallbackModels();
  }
}

function getFallbackModels(): ModelInfo[] {
  // Fallback list when API is not available
  return [
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      provider: 'OpenAI',
      description: 'Most advanced GPT-4 model with vision capabilities',
      contextLength: 128000,
      pricing: { input: '$5.00/1M tokens', output: '$15.00/1M tokens' },
    },
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'OpenAI',
      description: 'Faster, cheaper GPT-4o model',
      contextLength: 128000,
      pricing: { input: '$0.15/1M tokens', output: '$0.60/1M tokens' },
    },
    {
      id: 'openai/gpt-4-turbo',
      name: 'GPT-4 Turbo',
      provider: 'OpenAI',
      description: 'Previous generation GPT-4 with large context',
      contextLength: 128000,
      pricing: { input: '$10.00/1M tokens', output: '$30.00/1M tokens' },
    },
    {
      id: 'openai/gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      provider: 'OpenAI',
      description: 'Fast and cost-effective model',
      contextLength: 16385,
      pricing: { input: '$0.50/1M tokens', output: '$1.50/1M tokens' },
    },
    {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'Anthropic',
      description: 'Most capable Claude model with excellent reasoning',
      contextLength: 200000,
      pricing: { input: '$3.00/1M tokens', output: '$15.00/1M tokens' },
    },
    {
      id: 'anthropic/claude-3-haiku',
      name: 'Claude 3 Haiku',
      provider: 'Anthropic',
      description: 'Fast and lightweight Claude model',
      contextLength: 200000,
      pricing: { input: '$0.25/1M tokens', output: '$1.25/1M tokens' },
    },
    {
      id: 'google/gemini-pro-1.5',
      name: 'Gemini Pro 1.5',
      provider: 'Google',
      description: "Google's advanced multimodal model",
      contextLength: 2000000,
      pricing: { input: '$1.25/1M tokens', output: '$5.00/1M tokens' },
    },
    {
      id: 'meta-llama/llama-3.1-8b-instruct',
      name: 'Llama 3.1 8B Instruct',
      provider: 'Meta',
      description: 'Open-source model with good performance',
      contextLength: 131072,
      pricing: { input: '$0.20/1M tokens', output: '$0.20/1M tokens' },
    },
    {
      id: 'meta-llama/llama-3.1-70b-instruct',
      name: 'Llama 3.1 70B Instruct',
      provider: 'Meta',
      description: 'Large open-source model with excellent capabilities',
      contextLength: 131072,
      pricing: { input: '$0.90/1M tokens', output: '$0.90/1M tokens' },
    },
    {
      id: 'mistralai/mistral-7b-instruct',
      name: 'Mistral 7B Instruct',
      provider: 'Mistral AI',
      description: 'Efficient European model with good performance',
      contextLength: 32768,
      pricing: { input: '$0.20/1M tokens', output: '$0.20/1M tokens' },
    },
  ];
}

function displayModelsTable(models: ModelInfo[], verbose: boolean) {
  console.log('\n=== Available LLM Models ===\n');

  if (verbose) {
    // Detailed table format
    console.log(
      'ID'.padEnd(35) +
        'Name'.padEnd(25) +
        'Provider'.padEnd(12) +
        'Context'.padEnd(10) +
        'Input Price'.padEnd(15) +
        'Output Price'
    );
    console.log('-'.repeat(120));

    models.forEach(model => {
      const id = model.id.padEnd(35);
      const name = model.name.padEnd(25);
      const provider = model.provider.padEnd(12);
      const context = (
        model.contextLength ? `${(model.contextLength / 1000).toFixed(0)}K` : 'N/A'
      ).padEnd(10);
      const inputPrice = (model.pricing?.input || 'N/A').padEnd(15);
      const outputPrice = model.pricing?.output || 'N/A';

      console.log(`${id}${name}${provider}${context}${inputPrice}${outputPrice}`);
    });

    console.log('\n=== Model Descriptions ===\n');
    models.forEach(model => {
      console.log(`${model.id}:`);
      console.log(`  ${model.description || 'No description available'}`);
      console.log('');
    });
  } else {
    // Simple table format
    console.log('ID'.padEnd(40) + 'Name'.padEnd(25) + 'Provider');
    console.log('-'.repeat(75));

    models.forEach(model => {
      const id = model.id.padEnd(40);
      const name = model.name.padEnd(25);
      const provider = model.provider;

      console.log(`${id}${name}${provider}`);
    });
  }

  console.log(`\nTotal models: ${models.length}`);
  console.log('\nUse --verbose for detailed information including pricing and context lengths.');
  console.log('Use --provider <name> to filter by provider (e.g., --provider openai).');
}

// Parse command line arguments
program.parse();
