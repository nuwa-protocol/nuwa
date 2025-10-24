# Provider Integration Guide

A comprehensive guide for integrating new LLM providers into the Nuwa LLM
Gateway.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Implementation Steps](#implementation-steps)
4. [Testing Implementation](#testing-implementation)
5. [Documentation Updates](#documentation-updates)
6. [Best Practices and Considerations](#best-practices-and-considerations)
7. [Troubleshooting](#troubleshooting)
8. [Example Checklist](#example-checklist)
9. [Architecture Deep Dive](#architecture-deep-dive)
10. [Advanced Topics](#advanced-topics)

## Overview

### Architecture Introduction

The Nuwa LLM Gateway uses a modular, provider-first architecture that enables
seamless integration of multiple LLM providers. The system is built around
several key abstractions:

- **Provider Abstraction**: Each LLM provider implements a standardized
  interface
- **Usage Extraction**: Automated token counting and cost calculation
- **Stream Processing**: Real-time processing of streaming responses
- **Pricing Registry**: Centralized pricing configuration and calculation
- **Testing Framework**: Provider-specific testing utilities

### Core Concepts

#### Provider (`LLMProvider`)

The main interface that all providers must implement. It defines methods for:

- Request forwarding (`forwardRequest`)
- Response parsing (`parseResponse`)
- Request preparation (`prepareRequestData`)
- Usage extraction (`createUsageExtractor`)
- Stream processing (`createStreamProcessor`)

#### UsageExtractor

Handles provider-specific usage data extraction from responses:

- Non-streaming responses: `extractFromResponseBody()`
- Streaming responses: `extractFromStreamChunk()`
- Provider cost extraction: `extractProviderCost()`

#### StreamProcessor

Manages real-time processing of streaming responses:

- Chunk processing: `processChunk()`
- Final cost calculation: `getFinalCost()`
- Usage aggregation: `getFinalUsage()`

#### PricingRegistry

Centralized pricing configuration system:

- Provider-specific pricing: `getProviderPricing()`
- Cost calculation: `calculateCost()`
- Pricing overrides and multipliers

### Integration Workflow

```
1. Implement Provider Class
   ↓
2. Create Usage Extractor (if needed)
   ↓
3. Create Stream Processor (if needed)
   ↓
4. Add Path Constants
   ↓
5. Configure Pricing
   ↓
6. Register Provider
   ↓
7. Create Test Utilities
   ↓
8. Write Integration Tests
   ↓
9. Update Documentation
```

## Prerequisites

### Environment Setup

- Node.js 18+ with TypeScript support
- pnpm package manager
- Git for version control

### Required Development Tools

- TypeScript compiler
- ESLint for code quality
- Jest for testing
- Your preferred IDE with TypeScript support

### Recommended Background Knowledge

- **TypeScript**: Advanced features like generics, interfaces, and decorators
- **Express.js**: Middleware patterns and request/response handling
- **Server-Sent Events (SSE)**: Streaming response formats and parsing
- **HTTP APIs**: RESTful API design and error handling
- **Testing**: Unit testing and integration testing patterns

## Implementation Steps

### Step 1: Define Provider Class

Create your provider class by extending `BaseLLMProvider` and implementing
`TestableLLMProvider`.

**File**: `src/providers/myprovider.ts`

```typescript
import { AxiosResponse } from 'axios';
import { BaseLLMProvider } from './BaseLLMProvider.js';
import { TestableLLMProvider } from './LLMProvider.js';
import { UsageExtractor } from '../billing/usage/interfaces/UsageExtractor.js';
import { StreamProcessor } from '../billing/usage/interfaces/StreamProcessor.js';
import { MyProviderUsageExtractor } from '../billing/usage/providers/MyProviderUsageExtractor.js';
import { MyProviderStreamProcessor } from '../billing/usage/providers/MyProviderStreamProcessor.js';
import { MYPROVIDER_PATHS } from './constants.js';

export class MyProvider extends BaseLLMProvider implements TestableLLMProvider {
  private baseURL: string;

  // Define supported paths for this provider
  readonly SUPPORTED_PATHS = [
    MYPROVIDER_PATHS.CHAT_COMPLETIONS,
    // Add other supported endpoints
  ] as const;

  constructor() {
    super();
    this.baseURL =
      process.env.MYPROVIDER_BASE_URL || 'https://api.myprovider.com';
  }

  /**
   * Prepare request data for this provider
   * Add provider-specific modifications like usage tracking options
   */
  prepareRequestData(data: any, isStream: boolean): any {
    const prepared = { ...data };

    // Add provider-specific parameters
    if (isStream) {
      prepared.stream = true;
      // Add streaming-specific options
    }

    // Remove unsupported parameters
    delete prepared.unsupported_param;

    return prepared;
  }

  /**
   * Forward request to the provider
   */
  async forwardRequest(
    apiKey: string | null,
    path: string,
    method: string = 'POST',
    data?: any,
    isStream: boolean = false
  ): Promise<
    AxiosResponse | { error: string; status?: number; details?: any } | null
  > {
    if (!apiKey) {
      return {
        error: 'API key is required for MyProvider',
        status: 401,
      };
    }

    const url = `${this.baseURL}${path}`;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Nuwa-LLM-Gateway/1.0',
    };

    try {
      return await this.executeRequest(apiKey, path, method, data);
    } catch (error) {
      const errorInfo = await this.extractErrorInfo(error);
      this.logErrorInfo(errorInfo, error, 'MyProvider');

      return {
        error: errorInfo.message,
        status: errorInfo.statusCode,
        details: errorInfo.details,
      };
    }
  }

  /**
   * Parse response and extract relevant information
   */
  parseResponse(response: AxiosResponse): any {
    const data = response.data;

    // Handle provider-specific response format
    if (data && typeof data === 'object') {
      return {
        ...data,
        // Add any provider-specific transformations
      };
    }

    return data;
  }

  /**
   * Extract provider-specific USD cost from response
   */
  extractProviderUsageUsd(response: AxiosResponse): number | undefined {
    // Check response headers for cost information
    const costHeader = response.headers['x-myprovider-cost'];
    if (costHeader) {
      const cost = parseFloat(costHeader);
      return isNaN(cost) ? undefined : cost;
    }

    // Check response body for cost information
    const responseData = response.data;
    if (responseData?.billing?.cost_usd) {
      return parseFloat(responseData.billing.cost_usd);
    }

    return undefined;
  }

  /**
   * Create usage extractor for this provider
   */
  createUsageExtractor(): UsageExtractor {
    return new MyProviderUsageExtractor();
  }

  /**
   * Create stream processor for this provider
   */
  createStreamProcessor(model: string, initialCost?: number): StreamProcessor {
    return new MyProviderStreamProcessor(model, initialCost);
  }

  // TestableLLMProvider implementation
  getTestModels(): string[] {
    return [
      'myprovider-gpt-4',
      'myprovider-gpt-3.5-turbo',
      'myprovider-claude-3',
    ];
  }

  getDefaultTestOptions(): Record<string, any> {
    return {
      model: 'myprovider-gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello! How are you?' }],
      max_tokens: 100,
      temperature: 0.7,
    };
  }

  createTestRequest(endpoint: string, options: Record<string, any> = {}): any {
    const defaults = this.getDefaultTestOptions();

    switch (endpoint) {
      case MYPROVIDER_PATHS.CHAT_COMPLETIONS:
        return {
          ...defaults,
          ...options,
        };

      default:
        throw new Error(`Unsupported test endpoint: ${endpoint}`);
    }
  }
}

// Export singleton instance
export default new MyProvider();
```

### Step 2: Implement Usage Extraction

Create a custom usage extractor if your provider has a unique response format.

**File**: `src/billing/usage/providers/MyProviderUsageExtractor.ts`

```typescript
import { AxiosResponse } from 'axios';
import { BaseUsageExtractor } from '../base/BaseUsageExtractor.js';
import { UsageInfo } from '../../pricing.js';

export class MyProviderUsageExtractor extends BaseUsageExtractor {
  constructor() {
    super('myprovider');
  }

  /**
   * Extract usage from non-streaming response body
   */
  extractFromResponseBody(responseBody: any): UsageInfo | null {
    if (!responseBody || typeof responseBody !== 'object') {
      return null;
    }

    // Handle MyProvider's specific response format
    const usage = responseBody.usage || responseBody.token_usage;
    if (!usage) {
      return null;
    }

    return {
      promptTokens: usage.input_tokens || usage.prompt_tokens || 0,
      completionTokens: usage.output_tokens || usage.completion_tokens || 0,
      totalTokens:
        usage.total_tokens ||
        (usage.input_tokens || 0) + (usage.output_tokens || 0),
    };
  }

  /**
   * Extract usage from streaming SSE chunk
   */
  extractFromStreamChunk(
    chunkText: string
  ): { usage: UsageInfo; cost?: number } | null {
    try {
      // Parse SSE format: "data: {...}"
      const lines = chunkText.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();

          if (dataStr === '[DONE]') {
            continue;
          }

          const data = JSON.parse(dataStr);

          // Check for usage information in the chunk
          if (data.usage) {
            const usage: UsageInfo = {
              promptTokens: data.usage.input_tokens || 0,
              completionTokens: data.usage.output_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            };

            // Extract cost if available
            const cost = data.billing?.cost_usd
              ? parseFloat(data.billing.cost_usd)
              : undefined;

            return { usage, cost };
          }
        }
      }
    } catch (error) {
      console.warn(
        '[MyProviderUsageExtractor] Failed to parse stream chunk:',
        error
      );
    }

    return null;
  }

  /**
   * Extract provider cost from response headers
   */
  extractProviderCost(response: AxiosResponse): number | undefined {
    const costHeader = response.headers['x-myprovider-cost'];
    if (costHeader) {
      const cost = parseFloat(costHeader);
      return isNaN(cost) ? undefined : cost;
    }

    return undefined;
  }
}
```

### Step 3: Implement Stream Processing

Create a custom stream processor for provider-specific streaming formats.

**File**: `src/billing/usage/providers/MyProviderStreamProcessor.ts`

```typescript
import { BaseStreamProcessor } from '../base/BaseStreamProcessor.js';
import { MyProviderUsageExtractor } from './MyProviderUsageExtractor.js';

export class MyProviderStreamProcessor extends BaseStreamProcessor {
  constructor(model: string, initialProviderCost?: number) {
    super(model, new MyProviderUsageExtractor(), initialProviderCost);
  }

  /**
   * Process provider-specific streaming chunks
   */
  protected processProviderSpecificChunk(chunkText: string): void {
    // Handle MyProvider's specific streaming format
    try {
      const lines = chunkText.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();

          if (dataStr === '[DONE]') {
            // Finalize processing when stream ends
            this.calculateFinalCost();
            return;
          }

          const data = JSON.parse(dataStr);

          // Handle provider-specific events
          if (data.type === 'myprovider_usage') {
            // Process usage information
            const extractedUsage =
              this.usageExtractor.extractFromStreamChunk(line);
            if (extractedUsage) {
              this.accumulatedUsage = extractedUsage.usage;
              if (extractedUsage.cost !== undefined) {
                this.extractedCost = extractedUsage.cost;
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(
        '[MyProviderStreamProcessor] Failed to process chunk:',
        error
      );
    }
  }

  /**
   * Try to extract complete response body from streaming chunks
   */
  protected tryExtractResponseBody(chunkText: string): void {
    // Accumulate response data for final processing
    try {
      const lines = chunkText.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();

          if (dataStr !== '[DONE]') {
            const data = JSON.parse(dataStr);

            // Accumulate response body
            if (!this.accumulatedResponseBody) {
              this.accumulatedResponseBody = {};
            }

            // Merge data into accumulated response
            Object.assign(this.accumulatedResponseBody, data);
          }
        }
      }
    } catch (error) {
      console.warn(
        '[MyProviderStreamProcessor] Failed to extract response body:',
        error
      );
    }
  }
}
```

### Step 4: Add Path Constants

Add your provider's API paths to the constants file.

**File**: `src/providers/constants.ts`

```typescript
// Add to existing constants
export const MYPROVIDER_PATHS = {
  CHAT_COMPLETIONS: '/api/v1/chat/completions',
  MODELS: '/api/v1/models',
  // Add other endpoints as needed
} as const;

// Add to type helpers
export type MyProviderPath =
  (typeof MYPROVIDER_PATHS)[keyof typeof MYPROVIDER_PATHS];

// Update ALL_SUPPORTED_PATHS
export const ALL_SUPPORTED_PATHS = [
  ...Object.values(OPENAI_PATHS),
  ...Object.values(OPENROUTER_PATHS),
  ...Object.values(LITELLM_PATHS),
  ...Object.values(CLAUDE_PATHS),
  ...Object.values(MYPROVIDER_PATHS), // Add this line
] as const;
```

### Step 5: Configure Pricing Information

Create a pricing configuration file for your provider.

**File**: `src/config/myprovider-pricing.json`

```json
{
  "version": "1.0.0",
  "models": {
    "myprovider-gpt-4": {
      "promptPerMTokUsd": 30.0,
      "completionPerMTokUsd": 60.0,
      "description": "MyProvider GPT-4 model"
    },
    "myprovider-gpt-3.5-turbo": {
      "promptPerMTokUsd": 1.5,
      "completionPerMTokUsd": 2.0,
      "description": "MyProvider GPT-3.5 Turbo model"
    },
    "myprovider-claude-3": {
      "promptPerMTokUsd": 15.0,
      "completionPerMTokUsd": 75.0,
      "description": "MyProvider Claude 3 model"
    }
  },
  "modelFamilyPatterns": [
    {
      "pattern": "myprovider-gpt-4-*",
      "baseModel": "myprovider-gpt-4",
      "description": "GPT-4 family models"
    },
    {
      "pattern": "myprovider-gpt-3.5-*",
      "baseModel": "myprovider-gpt-3.5-turbo",
      "description": "GPT-3.5 family models"
    }
  ]
}
```

### Step 6: Register Provider

Add your provider to the ProviderManager configuration.

**File**: `src/core/providerManager.ts`

```typescript
// Add import
import MyProvider from '../providers/myprovider.js';
import { MYPROVIDER_PATHS } from '../providers/constants.js';

// In initializeProviders method, add to providerConfigs array:
const providerConfigs: ProviderInitConfig[] = [
  // ... existing configs
  {
    name: 'myprovider',
    instance: MyProvider,
    requiresApiKey: true,
    supportsNativeUsdCost: true, // Set to true if provider returns USD costs
    apiKeyEnvVar: 'MYPROVIDER_API_KEY',
    baseUrl: process.env.MYPROVIDER_BASE_URL || 'https://api.myprovider.com',
    allowedPaths: Object.values(MYPROVIDER_PATHS),
    requiredEnvVars: ['MYPROVIDER_API_KEY'],
    optionalEnvVars: ['MYPROVIDER_BASE_URL'],
    defaultCheck: () => !!process.env.MYPROVIDER_API_KEY,
  },
];
```

## Testing Implementation

### Step 1: Create Test Utility Class

Create provider-specific test utilities for integration testing.

**File**: `test/utils/myproviderTestUtils.ts`

```typescript
import { BaseProviderTestUtils, BaseTestResult } from './baseTestUtils.js';
import MyProvider from '../../src/providers/myprovider.js';
import { MYPROVIDER_PATHS } from '../../src/providers/constants.js';

export interface MyProviderChatCompletionConfig {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  // MyProvider-specific parameters
  custom_param?: string;
  provider_options?: {
    timeout?: number;
    retry_count?: number;
  };
}

export class MyProviderTestUtils extends BaseProviderTestUtils<MyProvider> {
  constructor(provider: MyProvider, apiKey: string | null) {
    super(provider, apiKey);
  }

  /**
   * Test chat completion with MyProvider
   */
  async testChatCompletion(
    config: Partial<MyProviderChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const requestData = this.provider.createTestRequest(
      MYPROVIDER_PATHS.CHAT_COMPLETIONS,
      {
        model: 'myprovider-gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello! How are you?' }],
        max_tokens: 100,
        ...config,
      }
    );

    return this.testNonStreaming(
      MYPROVIDER_PATHS.CHAT_COMPLETIONS,
      requestData
    );
  }

  /**
   * Test streaming chat completion
   */
  async testStreamingChatCompletion(
    config: Partial<MyProviderChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const requestData = this.provider.createTestRequest(
      MYPROVIDER_PATHS.CHAT_COMPLETIONS,
      {
        model: 'myprovider-gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello! How are you?' }],
        max_tokens: 100,
        stream: true,
        ...config,
      }
    );

    return this.testStreaming(MYPROVIDER_PATHS.CHAT_COMPLETIONS, requestData);
  }

  /**
   * Test with provider-specific features
   */
  async testWithProviderFeatures(
    config: Partial<MyProviderChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const requestData = this.provider.createTestRequest(
      MYPROVIDER_PATHS.CHAT_COMPLETIONS,
      {
        model: 'myprovider-gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Explain quantum computing in simple terms.',
          },
        ],
        max_tokens: 200,
        custom_param: 'test_value',
        provider_options: {
          timeout: 30000,
          retry_count: 3,
        },
        ...config,
      }
    );

    return this.testNonStreaming(
      MYPROVIDER_PATHS.CHAT_COMPLETIONS,
      requestData
    );
  }

  /**
   * Get common models for testing
   */
  static getCommonModels(): string[] {
    return [
      'myprovider-gpt-4',
      'myprovider-gpt-3.5-turbo',
      'myprovider-claude-3',
    ];
  }
}
```

### Step 2: Write Integration Tests

Create comprehensive integration tests for your provider.

**File**: `test/integration/provider-myprovider.test.ts`

```typescript
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { MyProviderTestUtils } from '../utils/myproviderTestUtils.js';
import MyProvider from '../../src/providers/myprovider.js';
import { BaseProviderTestUtils } from '../utils/baseTestUtils.js';

createProviderTestSuite('myprovider', () => {
  let testUtils: MyProviderTestUtils;
  let apiKey: string;

  beforeAll(() => {
    apiKey = TestEnv.getProviderApiKey('myprovider')!;
    testUtils = new MyProviderTestUtils(MyProvider, apiKey);
  });

  describe('Chat Completions', () => {
    test('should handle non-streaming chat completion', async () => {
      const result = await testUtils.testChatCompletion({
        model: 'myprovider-gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Say "Hello World"' }],
        max_tokens: 50,
      });

      const validation = testUtils.validateResponse(result, {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        expectResponse: true,
        minTokens: 1,
        maxTokens: 100,
      });

      expect(validation.valid).toBe(true);
      if (!validation.valid) {
        console.error('Validation errors:', validation.errors);
      }

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
      expect(result.cost?.costUsd).toBeGreaterThan(0);
    }, 30000);

    test('should handle streaming chat completion', async () => {
      const result = await testUtils.testStreamingChatCompletion({
        model: 'myprovider-gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Count from 1 to 5' }],
        max_tokens: 50,
      });

      const validation = testUtils.validateResponse(result, {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 5,
        maxTokens: 100,
      });

      expect(validation.valid).toBe(true);
      expect(result.success).toBe(true);
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
      expect(result.cost?.costUsd).toBeGreaterThan(0);
    }, 30000);

    test('should handle provider-specific features', async () => {
      const result = await testUtils.testWithProviderFeatures({
        model: 'myprovider-gpt-4',
        custom_param: 'integration_test',
        provider_options: {
          timeout: 30000,
        },
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 45000);
  });

  describe('Error Handling', () => {
    test('should handle invalid API key', async () => {
      const invalidTestUtils = new MyProviderTestUtils(
        MyProvider,
        'invalid-key'
      );

      const result = await invalidTestUtils.testChatCompletion();

      expect(result.success).toBe(false);
      expect(result.error).toContain('authentication');
      expect(result.statusCode).toBe(401);
    });

    test('should handle invalid model', async () => {
      const result = await testUtils.testChatCompletion({
        model: 'non-existent-model',
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
    });

    test('should handle malformed request', async () => {
      const result = await testUtils.testNonStreaming(
        '/api/v1/chat/completions',
        {
          // Missing required fields
          messages: [],
        }
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Usage and Cost Tracking', () => {
    test('should extract usage from response body', async () => {
      const result = await testUtils.testChatCompletion({
        model: 'myprovider-gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'What is 2+2?' }],
      });

      expect(result.success).toBe(true);
      expect(result.usage).toBeDefined();
      expect(result.usage!.promptTokens).toBeGreaterThan(0);
      expect(result.usage!.completionTokens).toBeGreaterThan(0);
      expect(result.usage!.totalTokens).toBeGreaterThan(0);
    });

    test('should calculate costs correctly', async () => {
      const result = await testUtils.testChatCompletion({
        model: 'myprovider-gpt-3.5-turbo',
      });

      expect(result.success).toBe(true);
      expect(result.cost).toBeDefined();
      expect(result.cost!.costUsd).toBeGreaterThan(0);
      expect(result.cost!.source).toMatch(/provider|gateway-pricing/);
    });

    test('should handle streaming usage extraction', async () => {
      const result = await testUtils.testStreamingChatCompletion({
        model: 'myprovider-gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Write a short poem about AI' }],
        max_tokens: 100,
      });

      expect(result.success).toBe(true);
      expect(result.usage).toBeDefined();
      expect(result.usage!.totalTokens).toBeGreaterThan(0);
      expect(result.cost?.costUsd).toBeGreaterThan(0);
    });
  });

  describe('Model Support', () => {
    const models = MyProviderTestUtils.getCommonModels();

    test.each(models)('should work with model %s', async model => {
      const result = await testUtils.testChatCompletion({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 20,
      });

      expect(result.success).toBe(true);
      expect(result.model).toBe(model);
    });
  });
});
```

### Step 3: Configure Test Environment

Update the test environment configuration to include your provider.

**File**: `test/utils/testEnv.ts`

```typescript
// In TestEnvConfig interface, add:
export interface TestEnvConfig {
  // ... existing properties
  myproviderApiKey?: string;
  myproviderBaseUrl?: string;
}

// In getConfig() method, add:
static getConfig(): TestEnvConfig {
  if (!TestEnv.config) {
    TestEnv.config = {
      // ... existing config
      myproviderApiKey: process.env.MYPROVIDER_API_KEY,
      myproviderBaseUrl: process.env.MYPROVIDER_BASE_URL,
    };
  }
  return TestEnv.config;
}

// In getProviderConfigs() method, add:
static getProviderConfigs(): ProviderTestConfig[] {
  const config = TestEnv.getConfig();

  return [
    // ... existing providers
    {
      name: 'myprovider',
      enabled: !!config.myproviderApiKey,
      apiKey: config.myproviderApiKey,
      baseUrl: config.myproviderBaseUrl,
      reason: !config.myproviderApiKey ? 'MYPROVIDER_API_KEY not set' : undefined
    }
  ];
}
```

## Documentation Updates

### Update README.md

Add your provider to the supported providers list:

```markdown
## ✨ Core Features

- **🔗 Multi-Provider Support**: OpenAI, OpenRouter, LiteLLM, Anthropic Claude,
  and MyProvider integration
```

### Update Environment Variables

**File**: `examples/env.example`

```bash
# MyProvider Configuration
MYPROVIDER_API_KEY=your_myprovider_api_key_here
MYPROVIDER_BASE_URL=https://api.myprovider.com  # Optional, defaults to official API
```

### Update CLI Configuration

**File**: `src/config/cli.ts`

```typescript
// In LLMGatewayConfig interface, add:
export interface LLMGatewayConfig {
  // ... existing properties
  myproviderApiKey?: string;
  myproviderBaseUrl?: string;
}

// In loadConfig() function, add:
export function loadConfig(): LLMGatewayConfig {
  // ... existing code

  const config: LLMGatewayConfig = {
    // ... existing properties
    myproviderApiKey: process.env.MYPROVIDER_API_KEY,
    myproviderBaseUrl: process.env.MYPROVIDER_BASE_URL,
  };

  return config;
}

// In showHelp() function, add documentation:
export function showHelp() {
  console.log(`
Provider Configuration:
  --myprovider-api-key <key>     MyProvider API key
  --myprovider-base-url <url>    MyProvider base URL (optional)
  `);
}
```

## Best Practices and Considerations

### Error Handling

Implement comprehensive error handling in your provider:

```typescript
protected async extractErrorInfo(error: any): Promise<ProviderErrorInfo> {
  // Handle MyProvider-specific error formats
  if (error.response?.data?.error) {
    const errorData = error.response.data.error;

    return {
      message: errorData.message || 'MyProvider API error',
      statusCode: error.response.status || 500,
      details: {
        code: errorData.code,
        type: errorData.type,
        param: errorData.param,
        requestId: error.response.headers['x-request-id'],
        rawError: error
      }
    };
  }

  // Fallback to base error handling
  return super.extractErrorInfo(error);
}
```

### Request ID Extraction

Implement request ID extraction for tracing:

```typescript
protected extractRequestIdFromHeaders(headers: any): string | undefined {
  return headers['x-myprovider-request-id'] ||
         headers['x-request-id'] ||
         headers['request-id'];
}
```

### Streaming Processing

Handle SSE parsing carefully:

```typescript
// Always validate JSON parsing
try {
  const data = JSON.parse(dataStr);
  // Process data
} catch (error) {
  console.warn('Failed to parse SSE chunk:', error);
  return null;
}

// Handle different event types
if (data.type === 'content_block_delta') {
  // Handle content updates
} else if (data.type === 'message_stop') {
  // Handle completion
} else if (data.type === 'error') {
  // Handle errors
}
```

### Cost Calculation Priority

The system follows this priority for cost calculation:

1. **Provider Cost** (if `supportsNativeUsdCost: true`)
2. **Gateway Pricing** (from pricing configuration files)
3. **Fallback** (null if no pricing available)

```typescript
// In your provider
extractProviderUsageUsd(response: AxiosResponse): number | undefined {
  // Return actual USD cost from provider
  return response.headers['x-cost-usd'] ?
    parseFloat(response.headers['x-cost-usd']) : undefined;
}
```

### Testing Strategy

- **Unit Tests**: Test individual methods and error handling
- **Integration Tests**: Test real API calls with environment configuration
- **Mock Tests**: Test without API keys for CI/CD environments

```typescript
// Use TestEnv for conditional testing
TestEnv.describeProvider('myprovider', () => {
  // Tests only run if MYPROVIDER_API_KEY is set
});
```

### Backward Compatibility

- Never remove existing methods from provider interfaces
- Use optional parameters for new features
- Maintain existing response formats
- Add deprecation warnings before removing features

## Troubleshooting

### Common Issues and Solutions

#### API Key Not Recognized

**Problem**: Provider registration fails with "API key not found"

**Solution**:

```bash
# Check environment variable
echo $MYPROVIDER_API_KEY

# Verify variable name matches configuration
# In providerManager.ts: apiKeyEnvVar: 'MYPROVIDER_API_KEY'
```

#### Streaming Response Parsing Failures

**Problem**: Usage extraction returns null for streaming responses

**Solution**:

```typescript
// Debug streaming chunks
protected processProviderSpecificChunk(chunkText: string): void {
  console.log('Raw chunk:', chunkText); // Add debugging

  // Check for different SSE formats
  const lines = chunkText.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      // Handle data lines
    } else if (line.startsWith('event: ')) {
      // Handle event lines
    }
  }
}
```

#### Usage Extraction Returns Null

**Problem**: No usage information extracted from responses

**Solutions**:

1. Check response format in `extractFromResponseBody()`
2. Verify field names match provider's API
3. Add logging to see actual response structure

```typescript
extractFromResponseBody(responseBody: any): UsageInfo | null {
  console.log('Response body:', JSON.stringify(responseBody, null, 2));

  // Check multiple possible field names
  const usage = responseBody.usage ||
                responseBody.token_usage ||
                responseBody.billing?.usage;
}
```

#### Pricing Information Not Loaded

**Problem**: Cost calculation fails with "No pricing found for model"

**Solutions**:

1. Verify pricing file exists in `src/config/`
2. Check model names match exactly
3. Add model family patterns for variations

```json
{
  "modelFamilyPatterns": [
    {
      "pattern": "myprovider-*",
      "baseModel": "myprovider-gpt-3.5-turbo"
    }
  ]
}
```

#### Test Environment Configuration Issues

**Problem**: Tests are skipped or fail to run

**Solutions**:

1. Set environment variables in test environment
2. Use `.env.test` file for test-specific configuration
3. Check `TestEnv.getProviderConfigs()` output

```bash
# Create .env.test file
MYPROVIDER_API_KEY=test_key_here

# Run tests with environment
pnpm test:integration -- --testNamePattern="myprovider"
```

## Example Checklist

Use this checklist to ensure complete provider integration:

### Implementation Files

- [ ] `src/providers/myprovider.ts` - Main provider implementation
- [ ] `src/billing/usage/providers/MyProviderUsageExtractor.ts` - Usage
      extraction (if needed)
- [ ] `src/billing/usage/providers/MyProviderStreamProcessor.ts` - Stream
      processing (if needed)
- [ ] `src/providers/constants.ts` - Path constants added
- [ ] `src/config/myprovider-pricing.json` - Pricing configuration
- [ ] `src/core/providerManager.ts` - Provider registration

### Testing Files

- [ ] `test/utils/myproviderTestUtils.ts` - Test utilities
- [ ] `test/integration/provider-myprovider.test.ts` - Integration tests
- [ ] `test/utils/testEnv.ts` - Test environment configuration

### Documentation Updates

- [ ] `README.md` - Provider support documentation
- [ ] `examples/env.example` - Environment variable examples
- [ ] `src/config/cli.ts` - CLI parameter support

### Verification Steps

- [ ] Provider registers successfully on startup
- [ ] Non-streaming requests work correctly
- [ ] Streaming requests work correctly
- [ ] Usage extraction works for both modes
- [ ] Cost calculation works correctly
- [ ] Error handling works properly
- [ ] Tests pass with real API key
- [ ] Tests are skipped without API key

### Environment Variables

- [ ] `MYPROVIDER_API_KEY` - Required for provider access
- [ ] `MYPROVIDER_BASE_URL` - Optional base URL override

### Testing Commands

```bash
# Run all tests
pnpm test

# Run integration tests only
pnpm test:integration

# Run specific provider tests
pnpm test -- --testNamePattern="myprovider"

# Run with debug output
DEBUG=* pnpm test -- --testNamePattern="myprovider"
```

## Architecture Deep Dive

### Provider Lifecycle and Initialization

The provider lifecycle follows this sequence:

1. **Registration Phase** (`ProviderManager.initializeProviders()`)
   - Environment validation
   - API key resolution
   - Provider instance creation
   - Configuration validation

2. **Request Phase** (`RouteHandler.handleProviderRequest()`)
   - Authentication validation
   - Path validation
   - Request preparation
   - Provider forwarding

3. **Response Phase**
   - Response parsing
   - Usage extraction
   - Cost calculation
   - Response formatting

### Usage Extraction Pipeline

```
Request → Provider → Response → UsageExtractor → CostCalculator → PricingResult
                                      ↓
                              StreamProcessor (for streaming)
                                      ↓
                              AccumulatedUsage → FinalCost
```

### Stream Processing Architecture

Streaming responses follow this flow:

1. **Chunk Reception**: Raw SSE chunks received from provider
2. **Chunk Processing**: Provider-specific parsing and extraction
3. **Usage Accumulation**: Token counts and cost information accumulated
4. **Final Calculation**: Complete usage and cost calculated at stream end

### Cost Calculation Flow

The system uses a hierarchical approach for cost calculation:

```
1. Provider Native Cost (if available)
   ↓ (fallback if null)
2. Gateway Pricing Registry
   ↓ (fallback if null)
3. Null (no cost available)
```

### Error Handling Chain

Errors are processed through multiple layers:

1. **Provider Level**: Provider-specific error parsing
2. **Base Level**: Common error patterns and HTTP status codes
3. **Gateway Level**: Final error formatting and logging

### Testing Framework Design

The testing framework uses a layered approach:

- **BaseProviderTestUtils**: Common testing functionality
- **Provider-Specific Utils**: Provider-tailored test methods
- **TestEnv**: Environment-based test configuration
- **Integration Tests**: Real API testing with conditional execution

## Advanced Topics

### Custom Authentication Methods

For providers requiring special authentication:

```typescript
async forwardRequest(apiKey: string | null, path: string, method: string, data?: any): Promise<AxiosResponse | ErrorResponse | null> {
  // Custom authentication logic
  const authHeaders = await this.generateCustomAuth(apiKey, data);

  const headers = {
    ...authHeaders,
    'Content-Type': 'application/json'
  };

  // Continue with request...
}

private async generateCustomAuth(apiKey: string | null, requestData: any): Promise<Record<string, string>> {
  // Implement custom authentication (OAuth, JWT, etc.)
  return {
    'Authorization': `Custom ${await this.generateToken(apiKey, requestData)}`
  };
}
```

### Rate Limiting Implementation

Handle provider-specific rate limits:

```typescript
extractProviderCost(response: AxiosResponse): number | undefined {
  // Extract rate limit information
  const remaining = response.headers['x-ratelimit-remaining'];
  const resetTime = response.headers['x-ratelimit-reset'];

  if (remaining && parseInt(remaining) < 10) {
    console.warn(`MyProvider rate limit low: ${remaining} requests remaining`);
  }

  return this.extractCostFromResponse(response);
}
```

### Caching Strategies

Implement response caching for expensive operations:

```typescript
private responseCache = new Map<string, { response: any; timestamp: number }>();

async forwardRequest(apiKey: string | null, path: string, method: string, data?: any): Promise<AxiosResponse | ErrorResponse | null> {
  // Check cache for idempotent requests
  if (method === 'GET' || this.isCacheable(data)) {
    const cacheKey = this.generateCacheKey(path, data);
    const cached = this.responseCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
      return cached.response;
    }
  }

  const response = await this.executeRequest(apiKey, path, method, data);

  // Cache successful responses
  if (response && 'status' in response && response.status === 200) {
    const cacheKey = this.generateCacheKey(path, data);
    this.responseCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });
  }

  return response;
}
```

### Multi-Model Support

Handle providers with multiple model families:

```typescript
getTestModels(): string[] {
  return [
    // Text generation models
    'myprovider-gpt-4',
    'myprovider-gpt-3.5-turbo',

    // Code generation models
    'myprovider-codex',
    'myprovider-code-davinci',

    // Specialized models
    'myprovider-embedding-v1',
    'myprovider-moderation-v1'
  ];
}

createTestRequest(endpoint: string, options: Record<string, any> = {}): any {
  const model = options.model || 'myprovider-gpt-3.5-turbo';

  // Adjust request based on model type
  if (model.includes('embedding')) {
    return this.createEmbeddingRequest(options);
  } else if (model.includes('moderation')) {
    return this.createModerationRequest(options);
  } else {
    return this.createChatRequest(options);
  }
}
```

### Provider-Specific Features

Support unique provider capabilities:

```typescript
prepareRequestData(data: any, isStream: boolean): any {
  const prepared = { ...data };

  // Add MyProvider-specific features
  if (data.enable_custom_feature) {
    prepared.custom_settings = {
      feature_level: 'advanced',
      optimization: true
    };
  }

  // Handle provider-specific tools
  if (data.tools) {
    prepared.tools = this.transformToolsForProvider(data.tools);
  }

  return prepared;
}

private transformToolsForProvider(tools: any[]): any[] {
  return tools.map(tool => {
    if (tool.type === 'function') {
      // Transform to MyProvider's function format
      return {
        type: 'myprovider_function',
        function_def: tool.function,
        settings: {
          timeout: 30000,
          retry_count: 3
        }
      };
    }
    return tool;
  });
}
```

---

This guide provides a comprehensive foundation for integrating new providers
into the Nuwa LLM Gateway. Follow the steps systematically, and refer to
existing provider implementations for additional guidance. The modular
architecture ensures that new providers can be added with minimal impact on
existing functionality while maintaining high code quality and test coverage.
