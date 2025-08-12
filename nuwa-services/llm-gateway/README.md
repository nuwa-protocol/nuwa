# LLM Gateway

LLM Gateway is a backend API service built with **Express + Supabase** that serves as a universal proxy gateway for OpenRouter, providing DID authentication and intelligent request forwarding services.

## Core Features

- Universal OpenRouter API proxy and path forwarding
- DID decentralized identity authentication
- **Automatic User Initialization**: New users are automatically created with records and API keys on first access
- Secure API key encryption management
- **Intelligent Usage Tracking**: Automatically records token consumption and costs for requests
- Request logging and usage statistics
- Support for both streaming and non-streaming responses

## 🆕 Usage Tracking Feature

LLM Gateway integrates OpenRouter's Usage Accounting functionality to automatically track and record:

### Automatic Data Collection

- **Token Counting**: Automatically records prompt tokens and completion tokens
- **Cost Statistics**: Precisely records the cost of each request (in USD)
- **Model Information**: Records the specific model names used
- **Request Status**: Tracks request success/failure status

### Supported Endpoints

- `/chat/completions` - Chat conversation interface
- `/completions` - Text completion interface

### Streaming and Non-Streaming Support

- **Non-streaming requests**: Directly extracts usage information from response body
- **Streaming requests**: Intelligently parses usage data from SSE streams (typically in the last chunk)

### Data Persistence

All usage data is automatically saved to the `request_logs` table:

```sql
-- Usage tracking related fields
input_tokens INTEGER,        -- Number of prompt tokens
output_tokens INTEGER,       -- Number of completion tokens
total_cost DECIMAL(10,6),    -- Total cost (USD)
```

### Transparent Operation

- Users require no additional configuration; the system automatically enables usage tracking
- Completely transparent to existing API calls, does not affect original functionality
- Automatically handles OpenRouter's credits to USD conversion (1 credit = $0.000001)

## Project Structure

```
llm-gateway/
├── src/
│   ├── types/           # Type definitions
│   ├── database/        # Supabase database operations
│   ├── services/        # Business logic services
│   ├── middleware/      # Authentication middleware
│   ├── routes/          # API routes
│   ├── utils/           # Utility functions
│   └── index.ts         # Application entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Quick Start

1. Install dependencies: `npm install`
2. Configure `.env` environment variables (see example below)
3. Run development environment: `npm run dev`

## Database Initialization

Up-to-date SQL schema is located at [`database/schema.sql`](./database/schema.sql).  
Run the script in Supabase / PostgreSQL and you're good to go.

Key changes vs. earlier versions:

| Column | Notes |
|--------|-------|
| `provider` | identifies backend (`openrouter`, `litellm`, …); part of unique key `(did, provider)` |
| `provider_key_id` | replaces legacy `openrouter_key_hash` |
| unique index | `UNIQUE (did, provider)` prevents duplicates |

If you are upgrading, remove `idx_user_api_keys_did` and old `openrouter_key_hash`-based indices—the new schema adds composite indices.

## Main API Endpoints

- `GET /` or `/api/v1/health`: Health check
- `<METHOD> /api/v1/openrouter/*`: Universal OpenRouter proxy (requires DID authentication)
- `GET /api/v1/usage`: Get user usage statistics (requires DID authentication)

### Proxy Logic Overview

- All client requests use unified path prefix `/api/v1/*`.
- Target backend is chosen by HTTP header `X-LLM-Provider: openrouter | litellm` (case-insensitive).  
  If the header is missing the value from `LLM_BACKEND` env (`openrouter`/`litellm`/`both`) is used.
- Usage-tracking parameters are automatically added **only for OpenRouter** requests.

## Examples

### Basic Chat Completion Request (Usage Tracking automatically enabled)

```bash
curl -X POST http://localhost:8080/api/v1/chat/completions \
  -H "x-did: did:example:123" \
  -H "x-did-signature: ..." \
  -H "x-did-timestamp: ..." \
  -H "X-LLM-Provider: openrouter" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Hello! How are you?"}
    ]
  }'
```

### Streaming Request (also supports Usage Tracking)

```bash
curl -X POST http://localhost:8080/api/v1/chat/completions \
  -H "x-did: did:example:123" \
  -H "x-did-signature: ..." \
  -H "x-did-timestamp: ..." \
  -H "X-LLM-Provider: openrouter" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Write a short story about AI"}
    ],
    "stream": true
  }'
```

### View Usage Statistics

```bash
curl -X GET http://localhost:8080/api/v1/usage \
  -H "x-did: did:example:123" \
  -H "x-did-signature: ..." \
  -H "x-did-timestamp: ..."
```

## 🔍 Usage Tracking Log Example

The system outputs detailed usage tracking information to the console:

```
✅ Usage tracking enabled for request
📊 Extracted usage info: {
  input_tokens: 12,
  output_tokens: 85,
  total_cost: 0.000142
}
```

Example database record:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "did": "did:example:123",
  "model": "openai/gpt-3.5-turbo",
  "input_tokens": 12,
  "output_tokens": 85,
  "total_cost": 0.000142,
  "status": "completed",
  "request_time": "2024-01-20T10:30:00Z",
  "response_time": "2024-01-20T10:30:02Z"
}
```

## TODO

- DID signature verification
- Usage reporting and analytics features
- Cost alerts and limitation mechanisms

## Environment Variables

Create a `.env` file and configure the following environment variables:

```env
# Service Configuration
PORT=8080
NODE_ENV=development
HOST=0.0.0.0

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenRouter Configuration
OPENROUTER_API_URL=https://openrouter.ai/
OPENROUTER_PROVISIONING_KEY=your_openrouter_provisioning_key

# API Key Encryption
API_KEY_ENCRYPTION_KEY=your_encryption_key_change_in_production

# Optional Configuration
HTTP_REFERER=https://llm-gateway.local
X_TITLE=LLM Gateway
```

### Key Configuration Explanations

| Variable | Description |
|----------|-------------|
| `OPENROUTER_PROVISIONING_KEY` | Master key to create sub-keys in OpenRouter |
| `LITELLM_MASTER_KEY` | Master key for LiteLLM proxy (only if you enable it) |
| `LLM_BACKEND` | `openrouter` \| `litellm` \| `both` (default `both`) |
| `API_KEY_ENCRYPTION_KEY` | AES key used to encrypt user api keys in DB (generate via `openssl rand -base64 32`) |
| `HOST` | server bind address (default `0.0.0.0`) |

## Automatic User Initialization

When new users first access the system through DID authentication, the Gateway automatically:

1. **Checks if user exists**: Queries the database for existing user records
2. **Creates OpenRouter API Key**: If user doesn't exist, automatically creates a new API key in OpenRouter
3. **Saves user record**: Saves user information and encrypted API key to database
4. **Error handling**: Automatically cleans up created resources if errors occur during the process

This process is completely transparent to users, requiring no manual registration or configuration.

## 🎯 Feature Comparison

| Feature          | Traditional Approach      | LLM Gateway               |
| ---------------- | ------------------------- | ------------------------- |
| Usage Tracking   | Manual configuration      | ✅ Automatic enablement   |
| Streaming        | Complex parsing logic     | ✅ Intelligent handling   |
| Cost Calculation | Manual credits conversion | ✅ Auto USD conversion    |
| Data Persistence | Additional development    | ✅ Auto database saving   |
| Error Handling   | Easy to miss edge cases   | ✅ Comprehensive handling |

## Development

### Build and Run

```bash
# Development
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Technology Stack

- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: DID (Decentralized Identity)
- **Language**: TypeScript
- **HTTP Client**: Axios

---

Built with ❤️ using Express.js and Supabase
