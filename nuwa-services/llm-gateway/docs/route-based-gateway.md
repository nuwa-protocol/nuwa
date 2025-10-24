# Route-based Multi-provider Gateway

## Overview

The LLM Gateway uses a Provider-first routing pattern, supporting multiple LLM
providers with gateway-side pricing calculation. This provides better
performance, scalability, and architectural clarity.

## New Route Structure

### Provider-first Routes

Use the new Provider-first pattern for explicit provider selection:

```bash
# OpenAI requests
POST /openai/api/v1/chat/completions
POST /openai/api/v1/embeddings
GET /openai/api/v1/models

# OpenRouter requests
POST /openrouter/api/v1/chat/completions
POST /openrouter/api/v1/models
GET /openrouter/api/v1/models

# LiteLLM requests
POST /litellm/api/v1/chat/completions
POST /litellm/api/v1/models
GET /litellm/api/v1/models
```

### Legacy Route (Backward Compatible)

The original routes redirect to OpenRouter for backward compatibility:

```bash
# Legacy routes (redirect to OpenRouter)
POST /api/v1/chat/completions
POST /api/v1/completions
GET /api/v1/models
```

## Benefits of Provider-first Routing

### Performance Improvements

- **First-layer routing**: Requests are routed to the correct provider at the
  first routing layer
- **Reduced latency**: No need to parse route parameters or headers
- **Better caching**: Simpler routing rules are more cache-friendly

### Architectural Benefits

- **Microservice ready**: Each provider can be deployed as an independent
  service
- **Independent versioning**: Each provider can have its own API version
- **Load balancer friendly**: Easy to route different providers to different
  backend services

### Developer Experience

- **Clear endpoints**: Provider is explicit in the URL
- **No headers needed**: No need for `X-LLM-Provider` headers
- **RESTful design**: Provider as a top-level resource

## Provider Features

| Provider   | API Key Source       | Native USD Cost | Gateway Pricing |
| ---------- | -------------------- | --------------- | --------------- |
| OpenAI     | Environment Variable | ❌              | ✅              |
| OpenRouter | Environment Variable | ✅              | Fallback        |
| LiteLLM    | Environment Variable | ✅              | Fallback        |

## API Key Management

### Global Environment Variable Strategy

All providers now use global environment variable API keys for simplified
operations:

1. **OpenAI**: Uses `OPENAI_API_KEY` environment variable (shared across all
   users)
2. **OpenRouter**: Uses `OPENROUTER_API_KEY` environment variable (shared across
   all users)
3. **LiteLLM**: Uses `LITELLM_API_KEY` environment variable (shared across all
   users)

### Benefits of Global API Key Management

- **Operational Simplicity**: Single API key configuration per provider
- **Centralized Billing**: All usage goes through operator's accounts
- **Reduced Complexity**: No per-user key management or database dependencies
- **Consistent Configuration**: Standard environment variable approach
- **Cost Control**: Centralized budgeting and rate limiting

### Pricing Calculation

The gateway calculates USD costs for requests using:

- **OpenAI**: Built-in pricing table with current OpenAI rates, calculated from
  token usage
- **OpenRouter**: Native cost from response (preferred) or gateway calculation
  (fallback)
- **LiteLLM**: Native cost from headers (preferred) or gateway calculation
  (fallback)

Configuration options:

- Token usage from response (`prompt_tokens`, `completion_tokens`)
- Environment variable overrides via `PRICING_OVERRIDES`

### Streaming Support

For streaming requests, the gateway:

1. Injects `stream_options.include_usage=true`
2. Parses usage from final SSE chunks
3. Calculates cost based on token consumption

## Configuration

### Environment Variables

```env
# OpenAI configuration
OPENAI_API_KEY=sk-proj-...                   # Required for OpenAI provider
OPENAI_BASE_URL=https://api.openai.com/v1   # Optional - has default

# OpenRouter configuration
OPENROUTER_API_KEY=sk-or-v1-...             # Required for OpenRouter provider
OPENROUTER_BASE_URL=https://openrouter.ai   # Optional - has default

# LiteLLM configuration
LITELLM_API_KEY=sk-...                      # Required for LiteLLM provider
LITELLM_BASE_URL=http://litellm-service:4000 # Required for LiteLLM provider

# Pricing overrides (optional - JSON format)
PRICING_OVERRIDES={"gpt-4":{"promptPerMTokUsd":25.0,"completionPerMTokUsd":55.0}}

# Pricing version tracking (optional)
OPENAI_PRICING_VERSION=2024-01

# Debug mode (optional)
DEBUG=true
```

### Provider Registration Logic

Providers are registered based on environment configuration:

- **OpenAI**: Only registered if `OPENAI_API_KEY` is configured
- **OpenRouter**: Only registered if `OPENROUTER_API_KEY` is configured
- **LiteLLM**: Only registered if both `LITELLM_BASE_URL` and `LITELLM_API_KEY`
  are configured

### Removed Environment Variables

The following environment variables are **no longer needed**:

- ❌ `OPENROUTER_PROVISIONING_KEY` - Replaced by `OPENROUTER_API_KEY`
- ❌ `LITELLM_MASTER_KEY` - Not needed (users import their own keys)

### Pricing Overrides

Override default pricing via environment variables:

```json
{
  "gpt-4": {
    "promptPerMTokUsd": 25.0,
    "completionPerMTokUsd": 55.0
  },
  "custom-model": {
    "promptPerMTokUsd": 10.0,
    "completionPerMTokUsd": 20.0
  }
}
```

## Usage Examples

### OpenAI Chat Completion

```bash
curl -X POST http://localhost:8080/api/v1/openai/chat/completions \
  -H "Authorization: DIDAuthV1 ..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### OpenRouter with Legacy Route

```bash
curl -X POST http://localhost:8080/api/v1/chat/completions \
  -H "Authorization: DIDAuthV1 ..." \
  -H "X-LLM-Provider: openrouter" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## Access Logging

Enhanced access logs include:

```json
{
  "type": "access_log",
  "provider": "openai",
  "model": "gpt-4",
  "usage_source": "gateway-pricing",
  "pricing_version": "2024-01",
  "total_cost_usd": 0.0006,
  "input_tokens": 10,
  "output_tokens": 5,
  "is_legacy_route": false,
  "upstream_name": "openai",
  "upstream_status_code": 200,
  "upstream_duration_ms": 1250
}
```

## Migration Guide

### For Clients

1. **Immediate**: No changes required - legacy routes still work
2. **Recommended**: Update to new provider-specific routes:
   - `/api/v1/chat/completions` → `/api/v1/{provider}/chat/completions`
   - Remove `X-LLM-Provider` headers
3. **Future**: Legacy routes will be removed in a future version

### For Operators

1. **Obtain API Keys**:
   - Get API keys from each provider (OpenAI, OpenRouter, LiteLLM)
   - Configure environment variables for each provider you want to use

2. **Update Environment Configuration**:

   ```env
   # Required for each provider
   OPENAI_API_KEY=sk-proj-your-openai-key
   OPENROUTER_API_KEY=sk-or-v1-your-openrouter-key
   LITELLM_API_KEY=sk-your-litellm-key
   ```

3. **Monitor Usage**:
   - All usage will be billed to your provider accounts
   - Set up monitoring and alerting for API usage
   - Consider implementing rate limiting if needed

### For Users

- **No API key management required** - All providers use operator's keys
- All requests are processed using the gateway's configured keys
- Usage is tracked and billed through the gateway's payment system

## Default Pricing (USD per 1M tokens)

| Model         | Prompt | Completion |
| ------------- | ------ | ---------- |
| gpt-4         | $30.00 | $60.00     |
| gpt-4-turbo   | $10.00 | $30.00     |
| gpt-4o        | $5.00  | $15.00     |
| gpt-4o-mini   | $0.15  | $0.60      |
| gpt-3.5-turbo | $0.50  | $1.50      |

_Pricing is based on OpenAI's published rates and may be overridden via
configuration._
