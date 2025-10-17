# LLM Gateway Testing Guide

This guide explains how to run the comprehensive test suite for the LLM Gateway, including both unit tests and integration tests with real API providers.

## Test Structure

```
test/
├── integration/           # Integration tests with real APIs
│   ├── provider-openai.test.ts
│   ├── provider-openrouter.test.ts
│   ├── provider-litellm.test.ts
│   └── provider-manager.test.ts
├── utils/                # Test utilities
│   ├── testEnv.ts        # Environment configuration
│   └── providerTestUtils.ts  # Provider testing helpers
├── *.test.ts             # Unit tests
└── setup.ts              # Test setup configuration
```

## Environment Configuration

### Required Environment Variables

Create a `.env` file in the `llm-gateway` directory with your API keys:

```bash
# OpenAI (required for OpenAI tests)
OPENAI_API_KEY=sk-...

# OpenRouter (required for OpenRouter tests)
OPENROUTER_API_KEY=sk-or-...

# LiteLLM (required for LiteLLM tests)
LITELLM_BASE_URL=http://localhost:4000
LITELLM_API_KEY=sk-...

# Optional: Skip all integration tests
SKIP_INTEGRATION_TESTS=true

# Optional: Custom base URLs
OPENAI_BASE_URL=https://api.openai.com
OPENROUTER_BASE_URL=https://openrouter.ai
```

### LiteLLM Setup

For LiteLLM integration tests, you need a running LiteLLM proxy:

```bash
# Install LiteLLM
pip install litellm

# Create config.yaml
cat > config.yaml << EOF
model_list:
  - model_name: gpt-3.5-turbo
    litellm_params:
      model: openai/gpt-3.5-turbo
      api_key: ${OPENAI_API_KEY}
EOF

# Start LiteLLM proxy
litellm --config config.yaml --port 4000
```

## Running Tests

### All Tests

```bash
# Run all tests (unit + integration)
pnpm test

# Run with coverage
pnpm test --coverage
```

### Unit Tests Only

```bash
# Run only unit tests (no real API calls)
SKIP_INTEGRATION_TESTS=true pnpm test

# Or run specific unit test files
pnpm test basic.test.ts
pnpm test integration.test.ts
pnpm test pricing.test.ts
```

### Integration Tests Only

```bash
# Run all integration tests
pnpm test test/integration/

# Run specific provider tests
pnpm test test/integration/provider-openai.test.ts
pnpm test test/integration/provider-openrouter.test.ts
pnpm test test/integration/provider-litellm.test.ts
```

### Provider-Specific Tests

```bash
# Test only OpenAI (requires OPENAI_API_KEY)
pnpm test provider-openai

# Test only OpenRouter (requires OPENROUTER_API_KEY)
pnpm test provider-openrouter

# Test only LiteLLM (requires LITELLM_BASE_URL and LITELLM_API_KEY)
pnpm test provider-litellm
```

## Test Categories

### 1. Unit Tests

Test individual modules without external dependencies:

- **Basic Tests** (`basic.test.ts`): Jest configuration validation
- **Pricing Tests** (`pricing.test.ts`): Cost calculation logic
- **Registry Tests** (`registry-simple.test.ts`): Provider management
- **Integration Tests** (`integration.test.ts`): Core functionality without real APIs

### 2. Integration Tests

Test real API interactions with actual provider endpoints:

#### OpenAI Provider Tests (`provider-openai.test.ts`)

Tests OpenAI API integration including:
- Chat Completions API (non-streaming and streaming)
- OpenAI Response API (new feature)
- Models API
- Usage extraction and cost calculation
- Request preparation and error handling
- Rate limiting behavior

#### OpenRouter Provider Tests (`provider-openrouter.test.ts`)

Tests OpenRouter API integration including:
- Multiple model providers (OpenAI, Anthropic, Meta)
- Native USD cost extraction
- Streaming and non-streaming requests
- OpenRouter-specific features (routing preferences)
- Credit and rate limiting handling

#### LiteLLM Provider Tests (`provider-litellm.test.ts`)

Tests LiteLLM proxy integration including:
- Proxy configuration testing
- Multiple backend models
- Cost extraction from headers
- Health checks and error handling
- Custom LiteLLM parameters

#### Provider Manager Tests (`provider-manager.test.ts`)

Tests the provider management system:
- Environment-based provider registration
- Provider configuration validation
- Integration with RouteHandler and AuthManager
- Test instance creation and management

## Test Environment Management

### Automatic Test Skipping

Tests automatically skip when required API keys are missing:

```typescript
// Tests will be skipped if OPENAI_API_KEY is not set
TestEnv.describeProvider('openai', () => {
  it('should handle chat completions', async () => {
    // This test only runs if OpenAI is configured
  });
});
```

### Environment Status

Check which providers are available for testing:

```bash
# The test suite will log environment status
pnpm test

# Output example:
# 🧪 Test Environment Status:
#    Skip Integration Tests: false
#    Enabled Providers: openai, openrouter
#    Disabled Providers: litellm (LITELLM_BASE_URL not configured)
```

### Manual Test Control

Force skip all integration tests:

```bash
SKIP_INTEGRATION_TESTS=true pnpm test
```

## Test Utilities

### TestEnv (`test/utils/testEnv.ts`)

Manages test environment configuration:

```typescript
import { TestEnv } from './utils/testEnv.js';

// Check if provider is enabled
if (TestEnv.isProviderEnabled('openai')) {
  // Run OpenAI tests
}

// Get provider configuration
const config = TestEnv.getProviderConfigs();
const apiKey = TestEnv.getProviderApiKey('openai');

// Create conditional test suites
TestEnv.describeProvider('openai', () => {
  // Tests only run if OpenAI is configured
});
```

### ProviderTestUtils (`test/utils/providerTestUtils.ts`)

Provides utilities for testing providers:

```typescript
import { ProviderTestUtils } from './utils/providerTestUtils.js';

// Test provider with real API
const result = await ProviderTestUtils.testProviderChatCompletion(
  provider,
  apiKey,
  { model: 'gpt-3.5-turbo', messages: [...] }
);

// Validate test results
const validation = ProviderTestUtils.validateTestResponse(result, {
  expectSuccess: true,
  expectUsage: true,
  minTokens: 10
});

// Create mock requests/responses
const mockReq = ProviderTestUtils.createMockRequest({...});
const mockRes = ProviderTestUtils.createMockResponse();
```

## Test Configuration

### Jest Configuration

Tests use Jest with TypeScript support. Key configuration:

```json
{
  "preset": "ts-jest",
  "testEnvironment": "node",
  "setupFilesAfterEnv": ["<rootDir>/test/setup.ts"],
  "testMatch": ["**/*.test.ts"],
  "collectCoverageFrom": [
    "src/**/*.ts",
    "!src/**/*.d.ts"
  ]
}
```

### Test Setup (`test/setup.ts`)

Global test configuration:

```typescript
// Set test timeout for integration tests
jest.setTimeout(60000);

// Configure environment variables
process.env.NODE_ENV = 'test';

// Mock external dependencies if needed
```

## Best Practices

### 1. Test Organization

- **Unit tests**: Fast, isolated, no external dependencies
- **Integration tests**: Real API calls, environment-dependent
- **Conditional tests**: Skip gracefully when dependencies unavailable

### 2. API Key Management

- **Never commit API keys**: Use `.env` files (gitignored)
- **Use test accounts**: Separate keys for testing when possible
- **Monitor usage**: Integration tests consume API credits

### 3. Test Reliability

- **Handle rate limits**: Add delays between requests
- **Expect failures**: Some models/features may be unavailable
- **Validate responses**: Check structure and content
- **Clean up**: Reset state between tests

### 4. Performance

- **Parallel execution**: Tests run in parallel by default
- **Timeout handling**: Set appropriate timeouts for API calls
- **Resource cleanup**: Close connections and clear state

## Troubleshooting

### Common Issues

#### Tests Skip Unexpectedly

```bash
# Check environment status
pnpm test -- --verbose

# Verify API keys are set
echo $OPENAI_API_KEY
```

#### LiteLLM Tests Fail

```bash
# Check if LiteLLM proxy is running
curl http://localhost:4000/health

# Verify configuration
cat config.yaml
```

#### Rate Limiting Errors

```bash
# Run tests with delays
pnpm test -- --runInBand  # Sequential execution

# Or reduce test scope
pnpm test provider-openai.test.ts
```

#### Timeout Errors

```bash
# Increase timeout
JEST_TIMEOUT=120000 pnpm test

# Or run specific tests
pnpm test -- --testNamePattern="should handle chat completions"
```

### Debug Mode

Enable verbose logging:

```bash
DEBUG=true pnpm test
```

### Test Coverage

Generate coverage reports:

```bash
pnpm test --coverage
open coverage/lcov-report/index.html
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: pnpm install
      
      # Unit tests (always run)
      - run: SKIP_INTEGRATION_TESTS=true pnpm test
      
      # Integration tests (only with secrets)
      - run: pnpm test
        if: ${{ secrets.OPENAI_API_KEY }}
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

## Contributing

When adding new tests:

1. **Follow naming conventions**: `*.test.ts` for unit tests, `integration/*.test.ts` for integration tests
2. **Use test utilities**: Leverage existing helpers in `test/utils/`
3. **Handle environment**: Use `TestEnv` for conditional execution
4. **Document requirements**: Update this README for new dependencies
5. **Test both success and failure cases**: Include error handling tests
