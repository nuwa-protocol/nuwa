# @nuwa-ai/llm-gateway

LLM Gateway is a multi-provider LLM API gateway with DID authentication and payment integration. It supports OpenAI, OpenRouter, and LiteLLM providers with intelligent usage tracking and cost calculation.

## ✨ Core Features

- **🔗 Multi-Provider Support**: OpenAI, OpenRouter, and LiteLLM integration
- **🔐 DID Authentication**: Decentralized identity authentication with PaymentKit integration  
- **💳 Payment Integration**: Built-in payment channels and usage-based billing
- **📊 Intelligent Usage Tracking**: Automatic token consumption and cost calculation
- **🚀 Provider-First Routing**: Clean `/provider/api/path` routing pattern
- **💰 Gateway Pricing**: Built-in pricing calculation with provider fallback
- **⚡ Streaming Support**: Full streaming support with usage tracking
- **🛠️ CLI Tool**: Command-line interface for easy deployment and configuration

## 📦 Installation

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

## 🚀 Quick Start

### 1. Generate SERVICE_KEY

```bash
# Generate a new SERVICE_KEY from https://test-id.nuwa.dev
# Copy the generated key and set it
export SERVICE_KEY=0x...your_generated_key...
```

### 2. Set Provider API Keys

```bash
# Set at least one provider API key
export OPENAI_API_KEY=sk-proj-...
# OR
export OPENROUTER_API_KEY=sk-or-v1-...
# OR  
export LITELLM_API_KEY=sk-...
```

### 3. Start the Gateway

```bash
# Start with default configuration
llm-gateway --debug

# Start with custom port
llm-gateway --port 3000 --debug

# Start with configuration file
llm-gateway --config config.json --debug
```

### 4. Test Your Gateway

Use the **Nuwa Login Demo** for easy testing:

1. 🚀 Start your gateway: `llm-gateway --debug`
2. 🌐 Open [https://nuwa-login-demo.pages.dev/](https://nuwa-login-demo.pages.dev/)
3. 🔗 Configure the demo to connect to `http://localhost:8080`
4. 🔐 Connect your wallet and authenticate with DID
5. 💬 Test chat completions with different providers
6. 📊 Monitor usage and costs in real-time

The demo handles all the complex authentication and payment setup automatically!

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SERVICE_KEY` | Service private key for DID signing | ✅ |
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

### Configuration File

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

### Environment File

Create a `.env` file:

```bash
SERVICE_KEY=0x...your_generated_key...
OPENAI_API_KEY=sk-proj-...your_openai_key...
PORT=8080
DEBUG=true
```

## 🌐 API Endpoints

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

### Health and Service Discovery

```bash
GET /                                    # Health check
GET /.well-known/nuwa-payment/info      # Payment service discovery
```

## 🧪 Testing and Examples

### Using Nuwa Login Demo (Recommended)

Since the LLM Gateway requires DID authentication and payment integration, direct curl requests won't work without proper authentication setup. For testing and development, we recommend using the **Nuwa Login Demo**:

🔗 **[https://nuwa-login-demo.pages.dev/](https://nuwa-login-demo.pages.dev/)**

This demo provides:
- ✅ **DID Authentication**: Automatic wallet connection and DID signing
- ✅ **Payment Integration**: Built-in payment channel management
- ✅ **Interactive Testing**: Easy-to-use interface for testing different providers
- ✅ **Real-time Results**: See responses and usage tracking in action

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

## 🛠️ CLI Options

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

## 🔍 Troubleshooting

### Gateway Exits Immediately

If `llm-gateway` starts and exits immediately without errors, this is usually due to missing required environment variables:

1. **Missing SERVICE_KEY**: Generate from https://test-id.nuwa.dev and set `export SERVICE_KEY=0x...`
2. **Missing Provider API Keys**: Set at least one: `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `LITELLM_API_KEY`
3. **Port Already in Use**: Change the port with `--port <number>`

### Common Error Messages

- **"SERVICE_KEY is required"**: Generate and set a SERVICE_KEY
- **"At least one provider API key is required"**: Set at least one provider API key
- **"Port already in use"**: Change the port with `--port <number>`
- **"Configuration validation failed"**: Check your config file syntax

### Getting Help

- Use `llm-gateway --help` for command-line options
- Enable debug mode with `--debug` for detailed logs
- Test with [Nuwa Login Demo](https://nuwa-login-demo.pages.dev/) once running

## 📊 Usage Tracking Features

### Automatic Data Collection

- **Token Counting**: Automatically records prompt tokens and completion tokens
- **Cost Statistics**: Precisely records the cost of each request (in USD)
- **Model Information**: Records the specific model names used
- **Request Status**: Tracks request success/failure status

### Streaming and Non-Streaming Support

- **Non-streaming requests**: Directly extracts usage information from response body
- **Streaming requests**: Intelligently parses usage data from SSE streams (typically in the last chunk)

### Transparent Operation

- Users require no additional configuration; the system automatically enables usage tracking
- Completely transparent to existing API calls, does not affect original functionality
- Automatically handles OpenRouter's credits to USD conversion (1 credit = $0.000001)

## 🏗️ Development

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

### Project Structure

```
llm-gateway/
├── src/
│   ├── types/           # Type definitions
│   ├── services/        # Business logic services
│   ├── middleware/      # Authentication middleware
│   ├── routes/          # API routes
│   ├── utils/           # Utility functions
│   ├── config/          # Configuration management
│   ├── bin/             # CLI entry point
│   └── server.ts        # Application entry point
├── examples/            # Configuration examples
├── package.json
├── tsconfig.json
└── README.md
```

## 🎯 Feature Comparison

| Feature          | Traditional Approach      | LLM Gateway               |
| ---------------- | ------------------------- | ------------------------- |
| Usage Tracking   | Manual configuration      | ✅ Automatic enablement   |
| Streaming        | Complex parsing logic     | ✅ Intelligent handling   |
| Cost Calculation | Manual credits conversion | ✅ Auto USD conversion    |
| Authentication   | Custom implementation     | ✅ DID-based auth         |
| Payment          | External billing system   | ✅ Built-in payment kit   |
| Multi-Provider   | Multiple integrations     | ✅ Unified interface      |

## 📄 License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) guide.

---

Built with ❤️ by the Nuwa AI team