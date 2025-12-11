# @nuwa-ai/llm-gateway

LLM Gateway is a multi-provider LLM API gateway with DID authentication and
payment integration. It supports OpenAI, OpenRouter, LiteLLM, and Anthropic
Claude providers with intelligent usage tracking and cost calculation.

## ✨ Core Features

- **🔗 Multi-Provider Support**: OpenAI, OpenRouter, LiteLLM, and Anthropic
  Claude integration
- **🔐 DID Authentication**: Decentralized identity authentication with
  PaymentKit integration
- **💳 Payment Integration**: Built-in payment channels and usage-based billing
- **📊 Intelligent Usage Tracking**: Automatic token consumption and cost
  calculation
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
# OR
export ANTHROPIC_API_KEY=sk-ant-...
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
2. 🌐 Open
   [https://nuwa-login-demo.pages.dev/](https://nuwa-login-demo.pages.dev/)
3. 🔗 Configure the demo to connect to `http://localhost:8080`
4. 🔐 Connect your wallet and authenticate with DID
5. 💬 Test chat completions with different providers
6. 📊 Monitor usage and costs in real-time

The demo handles all the complex authentication and payment setup automatically!

## 🔧 Configuration

### Environment Variables

| Variable             | Description                                                  | Required |
| -------------------- | ------------------------------------------------------------ | -------- |
| `SERVICE_KEY`        | Service private key for DID signing                          | ✅       |
| `OPENAI_API_KEY`     | OpenAI API key                                               | ⚠️       |
| `OPENROUTER_API_KEY` | OpenRouter API key                                           | ⚠️       |
| `LITELLM_API_KEY`    | LiteLLM API key                                              | ⚠️       |
| `ANTHROPIC_API_KEY`  | Anthropic Claude API key                                     | ⚠️       |
| `PORT`               | Server port (default: 8080)                                  | ❌       |
| `HOST`               | Server host (default: 0.0.0.0)                               | ❌       |
| `ROOCH_NETWORK`      | Rooch network (default: test)                                | ❌       |
| `ROOCH_NODE_URL`     | Rooch RPC URL                                                | ❌       |
| `DEFAULT_ASSET_ID`   | Default asset ID                                             | ❌       |
| `ADMIN_DID`          | Admin DID (comma-separated)                                  | ❌       |
| `DEBUG`              | Enable debug logging                                         | ❌       |
| `PRICING_OVERRIDES`  | Custom model pricing (JSON format)                           | ❌       |
| `PRICING_MULTIPLIER` | Global multiplier for final USD cost (0~2, e.g., 1.1 = +10%) | ❌       |

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
# Optional: globally increase/decrease final cost
# 1.10 = +10%, 0.90 = -10%
# PRICING_MULTIPLIER=1.10
```

### Custom Model Pricing

The `PRICING_OVERRIDES` environment variable allows you to customize pricing for
existing models or add pricing for new models that aren't in the default
configuration.

#### Format

```bash
PRICING_OVERRIDES='{"model-name": {"promptPerMTokUsd": price, "completionPerMTokUsd": price}}'
```

#### Examples

**Override existing model pricing:**

```bash
# Override GPT-4 pricing
PRICING_OVERRIDES='{"gpt-4": {"promptPerMTokUsd": 25.0, "completionPerMTokUsd": 50.0}}'
```

**Add pricing for new models:**

```bash
# Add pricing for custom models
PRICING_OVERRIDES='{"custom-model": {"promptPerMTokUsd": 10.0, "completionPerMTokUsd": 20.0}}'
```

**Multiple model overrides:**

```bash
# Override multiple models at once
PRICING_OVERRIDES='{
  "gpt-4": {"promptPerMTokUsd": 25.0, "completionPerMTokUsd": 50.0},
  "custom-model": {"promptPerMTokUsd": 10.0, "completionPerMTokUsd": 20.0},
  "another-model": {"promptPerMTokUsd": 5.0, "completionPerMTokUsd": 15.0}
}'
```

#### How It Works

1. **Loading Order**: Default pricing configuration is loaded first, then
   overrides are applied
2. **Merge Strategy**: Overrides are merged with existing pricing using spread
   operator (`{...default, ...overrides}`)
3. **New Models**: Models not in the default configuration can be added via
   overrides
4. **Cost Calculation**: Both existing and new models work with the cost
   calculation system
5. **Real-time Effect**: Changes take effect when the service starts (no restart
   needed during runtime)

#### Verification

You can verify your pricing overrides are working by checking the startup logs:

```bash
llm-gateway --debug
# Look for: "📊 Applied X pricing overrides"
```

#### Use Cases

- **Custom Models**: Add pricing for proprietary or fine-tuned models
- **Cost Optimization**: Adjust pricing based on your actual costs or agreements
- **Testing**: Use different pricing for development/testing environments
- **Provider Differences**: Set different prices for the same model across
  providers

## 🌐 API Endpoints

### Provider-First Routes (Recommended)

```bash
# OpenAI requests
POST /openai/v1/chat/completions
POST /openai/v1/responses

# OpenRouter requests
POST /openrouter/api/v1/chat/completions

# LiteLLM requests
POST /litellm/chat/completions
```

### Health and Service Discovery

```bash
GET /                                    # Health check
GET /.well-known/nuwa-payment/info      # Payment service discovery
```

## 🧪 Testing and Examples

### Using Nuwa Login Demo (Recommended)

Since the LLM Gateway requires DID authentication and payment integration,
direct curl requests won't work without proper authentication setup. For testing
and development, we recommend using the **Nuwa Login Demo**:

🔗 **[https://nuwa-login-demo.pages.dev/](https://nuwa-login-demo.pages.dev/)**

This demo provides:

- ✅ **DID Authentication**: Automatic wallet connection and DID signing
- ✅ **Payment Integration**: Built-in payment channel management
- ✅ **Interactive Testing**: Easy-to-use interface for testing different
  providers
- ✅ **Real-time Results**: See responses and usage tracking in action

### Manual Testing (Advanced)

If you need to test with curl, you'll need to:

1. **Set up DID Authentication**: Generate proper DIDAuthV1 headers
2. **Configure Payment Channels**: Set up payment channels with sufficient
   balance
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

**Claude API Example:**

```bash
curl -X POST http://localhost:8080/claude/v1/messages \
  -H "Authorization: DIDAuthV1 <signature_data>" \
  -H "X-Payment-Channel-Data: <payment_channel_data>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello! How are you?"}
    ]
  }'
```

> **Note**: Manual authentication setup is complex. We strongly recommend using
> the [Nuwa Login Demo](https://nuwa-login-demo.pages.dev/) for testing and
> development.

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

## 🐳 Docker Deployment

### Using Pre-built Images (Recommended)

Pull and run the official Docker image from GitHub Container Registry:

```bash
# Pull the latest image
docker pull ghcr.io/nuwa-protocol/llm-gateway:latest

# Run with environment variables
docker run -d -p 8080:8080 \
  -e SERVICE_KEY="your_service_key" \
  -e OPENAI_API_KEY="your_openai_api_key" \
  --name llm-gateway \
  ghcr.io/nuwa-protocol/llm-gateway:latest

# Run with configuration file
docker run -d -p 8080:8080 \
  -v $(pwd)/config.json:/app/config/config.json \
  -e SERVICE_KEY="your_service_key" \
  -e OPENAI_API_KEY="your_openai_api_key" \
  --name llm-gateway \
  ghcr.io/nuwa-protocol/llm-gateway:latest
```

### Available Tags

- `latest` - Latest stable version from main branch
- `v0.6.x` - Specific version tags
- `main` - Latest development version

### Docker Environment Variables

All CLI environment variables are supported in Docker. Key variables:

| Variable             | Description                         | Required |
| -------------------- | ----------------------------------- | -------- |
| `SERVICE_KEY`        | Service private key for DID signing | ✅       |
| `OPENAI_API_KEY`     | OpenAI API key                      | ⚠️       |
| `OPENROUTER_API_KEY` | OpenRouter API key                  | ⚠️       |
| `LITELLM_API_KEY`    | LiteLLM API key                     | ⚠️       |
| `PORT`               | Server port (default: 8080)         | ❌       |
| `HOST`               | Server host (default: 0.0.0.0)      | ❌       |
| `DEBUG`              | Enable debug logging                | ❌       |

⚠️ At least one provider API key is required

### Docker Compose

Use the provided `docker-compose.yml` file in the repository for easy
deployment:

```bash
# Clone the repository and navigate to the service directory
git clone https://github.com/nuwa-protocol/nuwa.git
cd nuwa/nuwa-services/llm-gateway

# Set up your environment variables
export SERVICE_KEY="your_service_key"
export OPENAI_API_KEY="your_openai_api_key"

# Start the services
docker-compose up -d
```

The `docker-compose.yml` file includes:

- ✅ **Complete configuration** with all environment variables
- ✅ **Health checks** for service monitoring
- ✅ **Optional LiteLLM service** for additional provider support
- ✅ **Production deployment examples** with resource limits

For detailed configuration options, see the
[`docker-compose.yml`](./docker-compose.yml) file in the repository.

### Building from Source

If you need to build the image locally:

```bash
# Clone the repository
git clone https://github.com/nuwa-protocol/nuwa.git
cd nuwa

# Build the image (must build from workspace root!)
docker build -f nuwa-services/llm-gateway/Dockerfile -t llm-gateway .

# Or use the convenience script
cd nuwa-services/llm-gateway
./build-docker.sh

# Test the image
./test-docker.sh

# Run the container
docker run -d -p 8080:8080 \
  -e SERVICE_KEY="your_service_key" \
  -e OPENAI_API_KEY="your_openai_api_key" \
  --name llm-gateway \
  llm-gateway
```

**Important Notes:**

- ⚠️ **Build from workspace root**: The Docker image must be built from the repository root (`nuwa/`), not from the service directory
- ✅ **Workspace dependencies**: The build includes `@nuwa-ai/identity-kit` and `@nuwa-ai/payment-kit` from the monorepo
- 🔧 **Scripts provided**: Use `build-docker.sh` and `test-docker.sh` for convenience

For details on the Docker build process and troubleshooting, see [DOCKER_FIX.md](./DOCKER_FIX.md).

### Production Deployment

For production environments, consider:

1. **Resource Limits**: Set appropriate CPU and memory limits
2. **Secrets Management**: Use Docker secrets or external secret management
3. **Logging**: Configure log aggregation (e.g., ELK stack)
4. **Monitoring**: Add health checks and monitoring
5. **Load Balancing**: Use multiple replicas behind a load balancer

See the production deployment examples in the
[`docker-compose.yml`](./docker-compose.yml) file for detailed configuration.

## 🔍 Troubleshooting

### Gateway Exits Immediately

If `llm-gateway` starts and exits immediately without errors, this is usually
due to missing required environment variables:

1. **Missing SERVICE_KEY**: Generate from https://test-id.nuwa.dev and set
   `export SERVICE_KEY=0x...`
2. **Missing Provider API Keys**: Set at least one: `OPENAI_API_KEY`,
   `OPENROUTER_API_KEY`, `LITELLM_API_KEY`, or `ANTHROPIC_API_KEY`
3. **Port Already in Use**: Change the port with `--port <number>`

### Common Error Messages

- **"SERVICE_KEY is required"**: Generate and set a SERVICE_KEY
- **"At least one provider API key is required"**: Set at least one provider API
  key
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

- **Non-streaming requests**: Directly extracts usage information from response
  body
- **Streaming requests**: Intelligently parses usage data from SSE streams
  (typically in the last chunk)

### Transparent Operation

- Users require no additional configuration; the system automatically enables
  usage tracking
- Completely transparent to existing API calls, does not affect original
  functionality
- Automatically handles OpenRouter's credits to USD conversion (1 credit =
  $0.000001)

## 🏗️ Architecture

### Modular Design

LLM Gateway features a **modular, provider-first architecture** that ensures
scalability, maintainability, and performance:

- **🔌 Provider Abstraction**: Each LLM provider (OpenAI, OpenRouter, LiteLLM)
  has dedicated usage extractors and stream processors
- **⚡ High Performance**: Microsecond-level response times (0.0017ms for usage
  extraction, 0.0024ms for cost calculation)
- **🧩 Pluggable Components**: Easy to add new providers by implementing
  standard interfaces
- **🔒 Error Isolation**: Provider-specific errors don't affect other providers
- **📈 Scalable**: Designed to handle high-concurrency scenarios efficiently

### Key Components

1. **UsageExtractor**: Handles provider-specific usage data extraction
2. **StreamProcessor**: Manages real-time streaming response processing
3. **CostCalculator**: Unified cost calculation with provider fallback
4. **Provider Interface**: Standardized interface for all LLM providers

### Performance Characteristics

- **Usage Extraction**: 0.0017ms average
- **Cost Calculation**: 0.0024ms average
- **Memory Efficiency**: Only 0.24MB increase per 100 operations
- **Concurrent Processing**: 0.0082ms average for 50 concurrent operations

For detailed architecture information, see:

- 📖 [Architecture Documentation](docs/ARCHITECTURE.md)
- 🚀 [Migration Guide](docs/MIGRATION_GUIDE.md)

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

| Feature          | Traditional Approach      | LLM Gateway             |
| ---------------- | ------------------------- | ----------------------- |
| Usage Tracking   | Manual configuration      | ✅ Automatic enablement |
| Streaming        | Complex parsing logic     | ✅ Intelligent handling |
| Cost Calculation | Manual credits conversion | ✅ Auto USD conversion  |
| Authentication   | Custom implementation     | ✅ DID-based auth       |
| Payment          | External billing system   | ✅ Built-in payment kit |
| Multi-Provider   | Multiple integrations     | ✅ Unified interface    |

## 📄 License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md)
guide.

---

Built with ❤️ by the Nuwa AI team
