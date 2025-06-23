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

Create the following two tables in Supabase:

```sql
-- User API Keys table
CREATE TABLE user_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  did TEXT NOT NULL UNIQUE,
  openrouter_key_hash TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  key_name TEXT NOT NULL,
  credit_limit DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_user_api_keys_did ON user_api_keys(did);
CREATE INDEX idx_user_api_keys_hash ON user_api_keys(openrouter_key_hash);

-- Request logs table (includes Usage Tracking fields)
CREATE TABLE request_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  did TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,                    -- Number of input tokens
  output_tokens INTEGER,                   -- Number of output tokens
  total_cost DECIMAL(10,6),               -- Total cost (USD)
  request_time TIMESTAMP WITH TIME ZONE NOT NULL,
  response_time TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_request_logs_did ON request_logs(did);
CREATE INDEX idx_request_logs_request_time ON request_logs(request_time);
CREATE INDEX idx_request_logs_status ON request_logs(status);
CREATE INDEX idx_request_logs_model ON request_logs(model);
CREATE INDEX idx_request_logs_cost ON request_logs(total_cost);
```

## Main API Endpoints

- `GET /` or `/api/v1/health`: Health check
- `<METHOD> /api/v1/openrouter/*`: Universal OpenRouter proxy (requires DID authentication)
- `GET /api/v1/usage`: Get user usage statistics (requires DID authentication)

### OpenRouter Proxy Logic Overview

- All requests to `/api/v1/openrouter/*` paths are handled uniformly by `handleOpenRouterProxy`:
  - Validates DID identity and signature
  - Looks up and decrypts user API key from database based on DID
  - **Automatically enables Usage Tracking**: Adds `usage: { include: true }` parameter for supported endpoints
  - Forwards requests to corresponding OpenRouter API paths
  - Supports both streaming and non-streaming responses, automatically forwards response headers and status codes
  - **Intelligently extracts Usage information**: Parses tokens and cost data from responses
  - **Automatically logs**: Saves usage information to database
  - Automatically rolls back logs and returns error information on failure

## Examples

### Basic Chat Completion Request (Usage Tracking automatically enabled)

```bash
curl -X POST http://localhost:8080/api/v1/openrouter/chat/completions \
  -H "x-did: did:example:123" \
  -H "x-did-signature: ..." \
  -H "x-did-timestamp: ..." \
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
curl -X POST http://localhost:8080/api/v1/openrouter/chat/completions \
  -H "x-did: did:example:123" \
  -H "x-did-signature: ..." \
  -H "x-did-timestamp: ..." \
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

- `OPENROUTER_PROVISIONING_KEY`: Management key for automatically creating user API keys in OpenRouter
- `API_KEY_ENCRYPTION_KEY`: Key for encrypting stored user API keys; must be changed in production, use command `openssl rand -base64 32` to generate a random key
- `HOST`: Server host address (defaults to 0.0.0.0 for all interfaces)

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
