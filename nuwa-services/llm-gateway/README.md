# @nuwa-ai/llm-gateway

LLM Gateway is a multi-provider LLM API gateway with DID authentication and payment integration. It supports OpenAI, OpenRouter, and LiteLLM providers with intelligent usage tracking and cost calculation.

## Core Features

- **Multi-Provider Support**: OpenAI, OpenRouter, and LiteLLM integration
- **DID Authentication**: Decentralized identity authentication with PaymentKit integration
- **Payment Integration**: Built-in payment channels and usage-based billing
- **Intelligent Usage Tracking**: Automatic token consumption and cost calculation
- **Provider-First Routing**: Clean `/provider/api/path` routing pattern
- **Gateway Pricing**: Built-in pricing calculation with provider fallback
- **Streaming Support**: Full streaming support with usage tracking
- **CLI Tool**: Command-line interface for easy deployment and configuration

## Installation

### Global Installation (Recommended)

```bash
npm install -g @nuwa-ai/llm-gateway
llm-gateway --help
```

### Local Installation

```bash
npm install @nuwa-ai/llm-gateway
npx llm-gateway --help
```

## Quick Start

### 1. Basic Usage

```bash
# Start with default configuration
llm-gateway

# Start with custom port
llm-gateway --port 3000

# Start with configuration file
llm-gateway --config config.json

# Start with debug logging
llm-gateway --debug
```

### 2. Environment Configuration

Create a `.env` file or set environment variables:

```bash
# Copy example configuration
cp node_modules/@nuwa-ai/llm-gateway/examples/env.example .env

# Edit configuration
nano .env
```

### 3. Configuration File

Create a `config.json` file:

```json
{
  "port": 8080,
  "host": "0.0.0.0",
  "serviceId": "llm-gateway",
  "network": "test",
  "debug": true
}
```

### 4. Testing Your Gateway

Once your gateway is running, test it using the **Nuwa Login Demo**:

1. 🚀 Start your gateway: `llm-gateway --debug`
2. 🌐 Open [https://nuwa-login-demo.pages.dev/](https://nuwa-login-demo.pages.dev/)
3. 🔗 Configure the demo to connect to `http://localhost:8080`
4. 🔐 Connect your wallet and authenticate with DID
5. 💬 Test chat completions with different providers
6. 📊 Monitor usage and costs in real-time

The demo handles all the complex authentication and payment setup automatically!

## Troubleshooting

### Gateway Exits Immediately

If `llm-gateway` starts and exits immediately without errors, this is usually due to missing required environment variables. Follow these steps:

#### Step 1: Generate SERVICE_KEY
```bash
# Generate a new SERVICE_KEY (32 random bytes as hex)
SERVICE_KEY=0x$(openssl rand -hex 32)
echo "Generated SERVICE_KEY: $SERVICE_KEY"

# Set the SERVICE_KEY
export SERVICE_KEY=$SERVICE_KEY
```

#### Step 2: Set Provider API Keys
```bash
# Set at least one provider API key
export OPENAI_API_KEY=sk-proj-...
# OR
export OPENROUTER_API_KEY=sk-or-v1-...
# OR  
export LITELLM_API_KEY=sk-...
```

#### Step 3: Configure Database (Optional)
```bash
# For usage tracking (optional)
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### Step 4: Test Configuration
```bash
# Test with minimal configuration
llm-gateway --debug --port 8080

# If still failing, check for specific errors
node --trace-warnings $(which llm-gateway) --debug
```

#### Quick Setup with .env File
```bash
# Generate SERVICE_KEY and create .env file
SERVICE_KEY=0x$(openssl rand -hex 32)
cat > .env << EOF
SERVICE_KEY=$SERVICE_KEY
OPENAI_API_KEY=sk-proj-...your_openai_key...
PORT=8080
DEBUG=true
EOF

# Start the gateway
llm-gateway --debug
```

### Common Error Messages

- **"SERVICE_KEY is required"**: Generate and set a SERVICE_KEY using `openssl rand -hex 32`
- **"At least one provider API key is required"**: Set OPENAI_API_KEY, OPENROUTER_API_KEY, or LITELLM_API_KEY
- **"Port already in use"**: Change the port with `--port <number>`
- **"Configuration validation failed"**: Check your config file syntax

### Getting Help

- Use `llm-gateway --help` for command-line options
- Generate SERVICE_KEY with `openssl rand -hex 32 | sed 's/^/0x/'`
- Enable debug mode with `--debug` for detailed logs
- Test with [Nuwa Login Demo](https://nuwa-login-demo.pages.dev/) once running

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

## API Endpoints

### Provider-First Routes (Recommended)

```bash
# OpenAI requests
POST /openai/v1/chat/completions
POST /openai/v1/embeddings
GET /openai/v1/models

# OpenRouter requests  
POST /openrouter/api/v1/chat/completions
GET /openrouter/api/v1/models

# LiteLLM requests
POST /litellm/chat/completions
GET /litellm/models
```

### Legacy Routes (Backward Compatible)

```bash
# Legacy routes (redirect to OpenRouter by default)
POST /api/v1/chat/completions
GET /api/v1/models
GET /api/v1/usage
```

### Health and Service Discovery

```bash
GET /                                    # Health check
GET /.well-known/nuwa-payment/info      # Payment service discovery
```

## Testing and Examples

### Using Nuwa Login Demo (Recommended)

Since the LLM Gateway requires DID authentication and payment integration, direct curl requests won't work without proper authentication setup. For testing and development, we recommend using the **Nuwa Login Demo**:

🔗 **[https://nuwa-login-demo.pages.dev/](https://nuwa-login-demo.pages.dev/)**

This demo provides:
- ✅ **DID Authentication**: Automatic wallet connection and DID signing
- ✅ **Payment Integration**: Built-in payment channel management
- ✅ **Interactive Testing**: Easy-to-use interface for testing different providers
- ✅ **Real-time Results**: See responses and usage tracking in action

### API Endpoint Examples

Once your gateway is running, the demo can connect to these endpoints:

#### OpenAI Provider
```
POST http://localhost:8080/openai/v1/chat/completions
```

#### OpenRouter Provider
```
POST http://localhost:8080/openrouter/api/v1/chat/completions
```

#### LiteLLM Provider
```
POST http://localhost:8080/litellm/chat/completions
```

### Manual Testing (Advanced)

If you need to test with curl, you'll need to:

1. **Set up DID Authentication**: Generate proper DIDAuthV1 headers
2. **Configure Payment Channels**: Set up payment channels with sufficient balance
3. **Use Payment Kit Client**: Implement proper payment channel management

Example request structure (requires proper authentication):
```bash
curl -X POST http://localhost:8080/openai/v1/chat/completions \
  -H "Authorization: DIDAuthV1 <signature_data>" \
  -H "X-Payment-Channel-Data: <payment_channel_data>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello! How are you?"}
    ]
  }'
```

> **Note**: Manual authentication setup is complex. We strongly recommend using the [Nuwa Login Demo](https://nuwa-login-demo.pages.dev/) for testing and development.

### Streaming Requests

Streaming requests are fully supported through the Nuwa Login Demo. The demo automatically handles:
- ✅ **Real-time Streaming**: Server-sent events with proper payment tracking
- ✅ **Usage Monitoring**: Live token and cost updates during streaming
- ✅ **Error Handling**: Graceful handling of connection issues

## Configuration

### Command Line Options

```bash
llm-gateway --help
```

```
Options:
  -p, --port <port>                    Server port (default: 8080)
  -h, --host <host>                    Server host (default: 0.0.0.0)
  -c, --config <path>                  Configuration file path
  --service-id <id>                    Service identifier for payment system
  --service-key <key>                  Service private key for DID signing
  --network <network>                  Rooch network (local|dev|test|main, default: test)
  --rpc-url <url>                      Rooch RPC URL
  --default-asset-id <id>              Default asset ID for payments
  --default-price-pico-usd <price>     Default price in picoUSD
  --debug                              Enable debug logging
  --help                               Show help message
  --version                            Show version information
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SERVICE_KEY` | Service private key for DID signing | ✅ |
| `SUPABASE_URL` | Supabase project URL | ⚠️ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | ⚠️ |
| `OPENAI_API_KEY` | OpenAI API key | ⚠️ |
| `OPENROUTER_API_KEY` | OpenRouter API key | ⚠️ |
| `LITELLM_API_KEY` | LiteLLM API key | ⚠️ |
| `PORT` | Server port (default: 8080) | ❌ |
| `HOST` | Server host (default: 0.0.0.0) | ❌ |
| `ROOCH_NETWORK` | Rooch network (default: test) | ❌ |
| `ROOCH_NODE_URL` | Rooch RPC URL | ❌ |
| `DEFAULT_ASSET_ID` | Default asset ID | ❌ |
| `ADMIN_DID` | Admin DID (comma-separated) | ❌ |
| `DEBUG` | Enable debug logging | ❌ |

⚠️ At least one provider API key is required

### Configuration File Example

See [`examples/config.json`](./examples/config.json) for a complete example.

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
# Clone the repository
git clone https://github.com/nuwa-protocol/nuwa
cd nuwa/nuwa-services/llm-gateway

# Install dependencies
pnpm install

# Build the project
pnpm run build

# Run in development mode
pnpm run dev

# Test CLI locally
pnpm run cli --help
```

### Building from Source

```bash
# Build for production
pnpm run build

# Test the built CLI
node dist/bin/llm-gateway.js --help

# Start production server
pnpm start
```

### Publishing to NPM

```bash
# Build and publish
pnpm run build
npm publish
```

## Technology Stack

- **Framework**: Express.js
- **Authentication**: DID (Decentralized Identity) + PaymentKit
- **Payment**: Rooch blockchain integration
- **Database**: Supabase (PostgreSQL) - Optional
- **Language**: TypeScript
- **Providers**: OpenAI, OpenRouter, LiteLLM

## License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) guide.

---

Built with ❤️ by the Nuwa AI team
