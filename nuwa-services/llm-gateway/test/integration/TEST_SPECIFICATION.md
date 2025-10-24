# LLM Gateway Provider Integration Test Specification

This document outlines the comprehensive test cases that should be implemented
for each LLM provider integration. Use this as a checklist when adding support
for a new provider.

## Philosophy: Integration Tests

**Purpose**: Verify successful interaction with real provider APIs

**Focus on**:

- ✅ Successful API calls with real providers
- ✅ Correct data extraction (usage, cost, metadata)
- ✅ Request/response format compatibility
- ✅ Provider-specific features work as expected
- ✅ Natural variations (different models, model unavailability)

**Avoid**:

- ❌ Testing error handling logic
- ❌ Artificially creating failure scenarios
- ❌ Testing with invalid credentials or parameters
- ❌ Simulating network errors or rate limits

**Note**: Error handling should be tested separately (e.g., in unit tests with
mocked responses) to avoid consuming API quota and triggering provider security
alerts.

## Test Environment Requirements

### Environment Variables

- Provider API Key: `{PROVIDER}_API_KEY`
- Provider Base URL (if applicable): `{PROVIDER}_BASE_URL`

### Test Configuration

- Each test should have appropriate timeouts (typically 15-60 seconds)
- Tests should gracefully handle missing API keys (skip rather than fail)
- Tests should use minimal token limits to reduce costs

## Core Test Categories

**Note**: All tests focus on successful scenarios with real provider APIs.

### Overview

| Category                      | Focus                                           | Critical    |
| ----------------------------- | ----------------------------------------------- | ----------- |
| 1. Chat Completions API       | Basic functionality (streaming & non-streaming) | ✅ Required |
| 2. Usage Extraction           | Token usage statistics                          | ✅ Required |
| 3. Cost Calculation           | Cost tracking and calculation                   | ✅ Required |
| 4. Request Preparation        | Request formatting and parameters               | ✅ Required |
| 5. Provider-Specific Features | Custom headers, parameters, metadata            | ✅ Required |
| 6. Advanced Features          | Function calling, vision, caching, etc.         | 🔄 Optional |

### 1. Chat Completions API

Tests for basic chat completion functionality, both streaming and non-streaming
modes.

#### 1.1 Non-Streaming Chat Completion

**Purpose**: Verify basic non-streaming chat completion works correctly

**Test Requirements**:

- Request should complete successfully
- Response should contain text content
- Response should include usage information (prompt tokens, completion tokens,
  total tokens)
- Response should include cost information
- Duration should be reasonable (< 30 seconds typically)
- Token counts should be consistent (totalTokens = promptTokens +
  completionTokens)

**Validation Criteria**:

```typescript
{
  expectSuccess: true,
  expectUsage: true,
  expectCost: true,
  minTokens: 10,
  maxTokens: 200,
  expectedModel: '<model-name>'
}
```

#### 1.2 Streaming Chat Completion

**Purpose**: Verify streaming mode works and accumulates content correctly

**Test Requirements**:

- Stream should complete successfully
- Content should be accumulated correctly
- Response should be non-empty string
- Duration should be reasonable (< 30 seconds typically)
- Usage information should be provided (if supported by provider)
- Cost information should be provided (if supported by provider)

**Notes**:

- Some providers may not return usage/cost in streaming mode
- Test with shorter max_tokens (e.g., 30) to speed up tests

#### 1.3 Different Model Support

**Purpose**: Verify support for multiple models offered by the provider

**Test Requirements**:

- Use `provider.getTestModels()` to get provider-recommended test models
- Test all models returned by `getTestModels()` (typically 3-4 models)
- Handle cases where models might not be available gracefully
- Verify each successful response includes correct model identifier
- Add delays between requests to avoid rate limiting (1-2 seconds)
- Accept both success and known unavailability errors (model not configured,
  insufficient credits)
- Log which models are unavailable for informational purposes

**Implementation Example**:

```typescript
it('should support different models', async () => {
  const models = provider.getTestModels();

  for (const model of models) {
    // Add delay between requests to avoid rate limiting
    if (models.indexOf(model) > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const result = await testUtils.testChatCompletion({ model });

    // Accept both success and known unavailability conditions
    if (result.success) {
      expect(result.cost?.model).toBe(model);
      console.log(`✅ Model ${model} is available and working`);
    } else {
      console.log(`ℹ️ Model ${model} is not available: ${result.error}`);
      expect([400, 401, 403, 404, 429]).toContain(result.statusCode || 0);
    }
  }
});
```

**Notes**:

- Not all models may be accessible (API tier, credits, configuration)
- This is an observational test - unavailable models are acceptable
- Using `getTestModels()` ensures testing with provider-recommended models

#### 1.4 Special API Endpoints

**Purpose**: Test provider-specific API endpoints (e.g., OpenAI Response API)

**Test Requirements**:

- Verify endpoint-specific parameters work correctly
- Test with and without optional features (e.g., tools)
- Verify response format matches endpoint specification

### 2. Usage Extraction

Tests for proper extraction of token usage statistics from provider responses.

#### 2.1 Non-Streaming Usage Extraction

**Purpose**: Verify usage statistics are correctly extracted from non-streaming
responses

**Test Requirements**:

- `usage.promptTokens` should be greater than 0
- `usage.completionTokens` should be greater than 0
- `usage.totalTokens` should equal promptTokens + completionTokens
- Usage should be present in successful responses

#### 2.2 Streaming Usage Extraction

**Purpose**: Verify usage statistics are extracted from streaming responses when
available

**Test Requirements**:

- Check if provider supports usage in streaming mode
- If supported, validate same criteria as non-streaming
- If not supported, document this limitation

### 3. Cost Calculation

Tests for accurate cost calculation based on token usage and pricing.

#### 3.1 Provider Native Cost

**Purpose**: Verify cost provided directly by the provider (if available)

**Test Requirements**:

- `cost.costUsd` should be greater than 0
- `cost.source` should be 'provider'
- `cost.model` should match requested model
- Cost should be reasonable based on token usage

#### 3.2 Gateway Pricing Fallback

**Purpose**: Verify gateway can calculate cost when provider doesn't provide it

**Test Requirements**:

- `cost.costUsd` should be greater than 0
- `cost.source` should be 'gateway-pricing'
- Cost should match expected calculation based on pricing database
- Test for at least one common model

#### 3.3 Cost Accuracy

**Purpose**: Verify cost calculation accuracy for different models

**Test Requirements**:

- Use `pricingRegistry.getProviderPricing(provider, model)` to get pricing from
  configuration
- Calculate expected cost based on configuration pricing, not hardcoded values
- Verify actual cost is close to expected (within reasonable tolerance, e.g.,
  30%)
- Test with different models having different pricing tiers

**Implementation Example**:

```typescript
it('should calculate cost accuracy for different pricing tiers', async () => {
  const testModel = 'gpt-3.5-turbo';
  const result = await testUtils.testChatCompletion({ model: testModel });

  expect(result.success).toBe(true);
  expect(result.cost).toBeDefined();
  expect(result.usage).toBeDefined();

  if (result.cost && result.usage) {
    // Get pricing from configuration
    const pricing = pricingRegistry.getProviderPricing('openai', testModel);
    expect(pricing).toBeDefined();

    if (pricing) {
      // Calculate expected cost based on configuration pricing
      const expectedCost =
        (result.usage.promptTokens * pricing.promptPerMTokUsd +
          result.usage.completionTokens * pricing.completionPerMTokUsd) /
        1000000; // Convert from per-million-tokens to per-token

      // Allow reasonable tolerance for rounding differences
      const tolerance = 0.3; // 30% tolerance
      expect(result.cost.costUsd).toBeCloseTo(expectedCost, tolerance);
    }
  }
});
```

### 4. Request Preparation

Tests for proper formatting and preparation of requests before sending to
provider.

#### 4.1 Non-Streaming Request Preparation

**Purpose**: Verify request data is correctly prepared for non-streaming
requests

**Test Requirements**:

- Model name is preserved correctly
- Messages/input are formatted correctly
- Provider-specific parameters are added (e.g., stream_options, usage.include)
- No unnecessary parameters are added
- Test both with and without optional parameters

#### 4.2 Streaming Request Preparation

**Purpose**: Verify request data is correctly prepared for streaming requests

**Test Requirements**:

- `stream` parameter is set to true
- Provider-specific streaming parameters are added
- Usage tracking parameters are injected if needed
- All other requirements same as non-streaming

#### 4.3 Provider-Specific Parameters

**Purpose**: Verify provider-specific parameters are handled correctly

**Test Requirements**:

- Custom headers are added (e.g., anthropic-version, HTTP-Referer)
- Custom request fields are included (e.g., metadata, routing preferences)
- Provider-specific formats are respected

### 5. Provider-Specific Features

Tests for unique features offered by specific providers.

#### 5.1 Custom Headers

**Purpose**: Verify provider-specific headers are sent correctly

**Test Requirements**:

- Headers required by provider are included
- Headers are formatted correctly
- Missing headers don't cause failures (if optional)

Examples:

- Claude: `anthropic-version`
- OpenRouter: `HTTP-Referer`, `X-Title`
- LiteLLM: Custom proxy headers

#### 5.2 Special Parameters

**Purpose**: Verify provider-specific parameters work correctly

**Test Requirements**:

- Provider accepts its specific parameters
- Parameters have the expected effect

Examples:

- Claude: `max_tokens` (required)
- OpenRouter: `transforms`, `route`, `models`
- LiteLLM: `metadata`, `tags`
- OpenAI: `response_format`, `tools`

**Notes**:

- Focus on successful usage of provider-specific parameters

#### 5.3 Provider Metadata

**Purpose**: Verify extraction of provider-specific metadata

**Test Requirements**:

- Provider-specific response fields are captured
- Metadata is accessible for debugging/monitoring
- Metadata doesn't interfere with standard fields

Examples:

- OpenRouter: generation details, model routing info
- LiteLLM: proxy metrics, model info
- Claude: stop_reason, stop_sequence

### 6. Advanced Features

Tests for advanced LLM capabilities when supported.

#### 6.1 Function/Tool Calling

**Purpose**: Verify function calling capabilities

**Test Requirements**:

- Tools can be defined in request
- Model can decide to call tools
- Tool call format is correct
- Tool results can be sent back

**Notes**:

- Only test if provider supports function calling
- Test at least one simple function
- Verify tool call structure matches provider format

#### 6.2 Vision/Image Input

**Purpose**: Verify image input capabilities

**Test Requirements**:

- Images can be included in messages
- Model can process and respond to images
- Multiple images can be handled
- Both URL and base64 formats work

**Notes**:

- Only test if provider supports vision
- Use small test images to reduce costs
- Test both formats if provider supports both

#### 6.3 Response Formats

**Purpose**: Verify structured output capabilities

**Test Requirements**:

- JSON mode can be enabled
- Output matches specified format

**Notes**:

- Only test if provider supports structured output
- Test at least one simple JSON schema

#### 6.4 Context Caching

**Purpose**: Verify prompt caching capabilities

**Test Requirements**:

- Cache can be enabled
- Subsequent requests use cache
- Cache metadata is available
- Cache costs are tracked separately

**Notes**:

- Only test if provider supports caching
- Verify cost reduction on cache hits

## Test Utility Structure

### Provider Test Utils Class

Each provider should have a corresponding test utility class that extends
`BaseProviderTestUtils`:

```typescript
export class {Provider}TestUtils extends BaseProviderTestUtils<{Provider}> {
  // Provider-specific test helper methods

  async testChatCompletion(options?: Record<string, any>): Promise<BaseTestResult> {
    return this.testNonStreaming('/chat/completions', options);
  }

  async testStreamingChatCompletion(options?: Record<string, any>): Promise<BaseTestResult> {
    return this.testStreaming('/chat/completions', options);
  }

  // Add provider-specific helper methods as needed
}
```

**Note**: Use `provider.getTestModels()` instead of static model lists to get
provider-recommended test models.

### Test File Structure

```typescript
/**
 * {Provider} Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 * Focus: Successful scenarios only
 */

import { {Provider} } from '../../src/providers/{provider}.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { {Provider}TestUtils } from '../utils/{provider}TestUtils.js';
import { BaseTestValidation } from '../utils/baseTestUtils.js';

beforeAll(() => {
  TestEnv.logStatus();
});

createProviderTestSuite('{provider}', () => {
  let provider: {Provider};
  let apiKey: string;
  let testUtils: {Provider}TestUtils;

  beforeAll(() => {
    provider = new {Provider}();
    apiKey = TestEnv.getProviderApiKey('{provider}')!;
    testUtils = new {Provider}TestUtils(provider, apiKey);
  });

  describe('Chat Completions API', () => {
    // Non-streaming and streaming tests
  });

  describe('Usage Extraction', () => {
    // Token usage extraction tests
  });

  describe('Cost Calculation', () => {
    // Cost calculation tests
  });

  describe('Request Preparation', () => {
    // Request formatting tests
  });

  describe('Provider-Specific Features', () => {
    // Custom headers, parameters, metadata
  });

  // Optional: only if provider supports advanced features
  describe('Advanced Features', () => {
    // Function calling, vision, etc.
  });
});
```

## Testing Best Practices

### 1. Cost Management

- Use minimal `max_tokens` values (10-50 for most tests)
- Use cheaper models when possible (e.g., GPT-3.5 instead of GPT-4)
- Skip expensive tests if they're not critical
- Consider using test credits/free tier when available

### 2. Test Independence

- Each test should be independent and self-contained
- Don't rely on state from previous tests
- Clean up resources if needed
- Use fresh instances when testing different configurations

### 3. Test Stability

- Add appropriate timeouts (15-60 seconds typically)
- Accept both success and known unavailability conditions (model not configured,
  insufficient credits)
- Stagger requests between different models (500-1000ms delays)
- Log informational messages for observational behaviors

### 4. Debugging Support

- Log test results on validation failures
- Include detailed error messages
- Log when special conditions occur (unavailable models, configuration issues,
  etc.)
- Use `TestEnv.logStatus()` to show environment configuration

### 5. CI/CD Considerations

- Tests should skip gracefully if API keys not available
- Use environment variable naming convention: `{PROVIDER}_API_KEY`
- Document required environment variables
- Consider using test-specific API keys with appropriate rate limits

## Provider-Specific Notes

### OpenAI

- Supports both Chat Completions and Response API
- Response API requires specific models (gpt-4o-2024-08-06)
- `stream_options.include_usage` needed for usage in streaming
- Does not allow `stream_options` in non-streaming requests

### Claude (Anthropic)

- Requires `anthropic-version` header
- `max_tokens` is required parameter
- Messages API uses different format than OpenAI
- Excellent support for usage tracking in both modes

### OpenRouter

- Requires `HTTP-Referer` header
- Uses `usage.include` instead of `stream_options`
- Provides native USD cost in response
- Supports many different underlying models with prefix notation

### LiteLLM

- Acts as proxy to other providers
- Provides cost via `x-litellm-response-cost` header
- Supports additional metadata fields
- Configuration depends on proxy setup
- Requires running proxy server for tests

## Checklist for New Provider

When adding a new provider integration, ensure you have:

### Integration Tests

- [ ] Created provider test utility class extending `BaseProviderTestUtils`
- [ ] Implemented Chat Completions API tests (streaming and non-streaming)
- [ ] Tested multiple models (at least 2-3)
- [ ] Verified usage extraction works correctly (prompt tokens, completion
      tokens, total tokens)
- [ ] Verified cost calculation works correctly (from provider or gateway
      pricing)
- [ ] Tested request preparation (streaming and non-streaming)
- [ ] Tested provider-specific features (headers, parameters, metadata)
- [ ] Added advanced feature tests if supported (function calling, vision, etc.)
- [ ] Added provider to test environment configuration
- [ ] Ensured tests skip gracefully without API key
- [ ] All tests pass with valid API key

### Documentation

- [ ] Updated provider-specific notes section in this document
- [ ] Documented any unique provider behaviors or requirements
- [ ] Added example models for testing
- [ ] Documented required environment variables
- [ ] Added pricing information if known

### Code Quality

- [ ] All tests follow consistent naming conventions
- [ ] Test code is DRY (no unnecessary duplication)
- [ ] Added appropriate comments for complex test logic
- [ ] Verified no linter errors
- [ ] Tests use minimal tokens to reduce costs
