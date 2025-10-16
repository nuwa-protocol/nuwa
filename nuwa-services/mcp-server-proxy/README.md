# MCP Server Proxy

MCP Server Proxy is a streamlined MCP service that provides upstream forwarding and payment capabilities. It uses FastMcpStarter to provide a single `/mcp` endpoint with JSON-RPC over HTTP/SSE.

This implementation follows the V2 design (see [PROPOSAL_V2_SINGLE_UPSTREAM_PAYMENT.md](./docs/PROPOSAL_V2_SINGLE_UPSTREAM_PAYMENT.md)) which simplifies the architecture to focus on per-call payment and tool execution.

## 🚀 Quick Start (NPM Package)

The easiest way to get started is using the published npm package:

```bash
# Install globally
npm install -g @nuwa-ai/mcp-server-proxy

# Create a simple config file
echo "port: 8088
endpoint: /mcp
serviceId: my-service" > config.yaml

# Set your service key
export SERVICE_KEY=your_service_key_here

# Start the server
mcp-server-proxy --config config.yaml
```

Or use without installation:

```bash
# Run directly with npx
npx @nuwa-ai/mcp-server-proxy --port 8088 --service-id my-service
```

## Features

- **Single MCP Endpoint**: Provides `/mcp` endpoint with JSON-RPC over streamable HTTP
- **Upstream Forwarding**: Automatically forwards all upstream tools to clients
- **Per-call Payment**: Integrated with Nuwa Payment Kit for tool-level billing
- **Pure Proxy**: Clean architecture focused on forwarding and payment, no built-in test tools

## Quick Start

### 1. Installation

You have two options to use MCP Server Proxy:

#### Option A: Use Published NPM Package (Recommended)

Install the published package globally or locally:

```bash
# Install globally (recommended for easy CLI usage)
npm install -g @nuwa-ai/mcp-server-proxy

# Or install locally in your project
npm install @nuwa-ai/mcp-server-proxy
```

Then you can run it directly:

```bash
# Run with global installation
mcp-server-proxy --help

# Run with local installation
npx @nuwa-ai/mcp-server-proxy --help
```

#### Option B: Build from Source

If you want to modify the source code or contribute to development:

```bash
cd nuwa-services/mcp-server-proxy
pnpm install
```

### 2. Configuration

Create a `config.yaml` file for your proxy configuration. You can start with the provided example:

```bash
# Copy the example configuration
curl -o config.yaml https://raw.githubusercontent.com/rooch-network/nuwa/main/nuwa-services/mcp-server-proxy/config.yaml.example

# Or if you have the source code:
cp config.yaml.example config.yaml
```

Then edit `config.yaml` to match your needs. Here are some examples:

#### Example 1: Basic Configuration (No Upstream)

```yaml
# Server settings
port: 8088
endpoint: "/mcp"

# Payment configuration
serviceId: "my-mcp-service"
network: "test"
rpcUrl: "https://test-seed.rooch.network:443"
defaultPricePicoUSD: "100000000"  # 0.0001 USD - Default price for all tools
```

#### Example 2: With HTTP Upstream

```yaml
# Server settings
port: 8088
endpoint: "/mcp"

# Upstream MCP server
upstream:
  type: "httpStream"
  url: "https://api.example.com/mcp?key=${API_KEY}"

# Payment configuration
serviceId: "my-mcp-service"
network: "test"
rpcUrl: "${ROOCH_RPC_URL}"
defaultPricePicoUSD: "100000000"  # 0.0001 USD - Default price for all tools

# Tool pricing configuration (optional)
register:
  tools:
    - name: "example.tool"
      pricePicoUSD: "200000000"  # 0.0002 USD - Explicit price, overrides default
    - name: "free.tool"
      pricePicoUSD: "0"  # Free tool
```

#### Example 3: With Stdio Upstream

```yaml
# Server settings  
port: 8088
endpoint: "/mcp"

# Stdio upstream MCP server
upstream:
  type: "stdio"
  command: ["npx", "@example/mcp-server"]
  env:
    API_KEY: "${API_KEY}"
  # stderr: "inherit"  # Default: child process errors are visible (recommended for debugging)
  # stderr: "ignore"   # Suppress child process error output
  # stderr: "pipe"     # Capture stderr (advanced usage)

# Payment configuration
serviceId: "my-mcp-service"
network: "test"
defaultPricePicoUSD: "100000000"
```

**Note**: 
- Stdio upstream automatically inherits all environment variables from the parent process, then merges any custom environment variables specified in the `env` section. This ensures that child processes have access to system variables like `PATH`, `HOME`, etc., as well as any custom variables you specify.
- The `stderr` option controls how child process error output is handled:
  - `inherit` (default): Error messages from the child process are displayed in the proxy's console, making debugging easier
  - `ignore`: Suppresses error output from the child process
  - `pipe`: Captures stderr for advanced processing (not commonly needed)

**Important**: In stdio mode, the child process uses:
- **stdin/stdout**: For MCP JSON-RPC protocol communication (handled automatically by the SDK)
- **stderr**: For debug output, error messages, and logging (visible in proxy console with `stderr: inherit`)

Never write non-MCP content to stdout in your MCP server, as this will break protocol communication. Use `console.error()` for debug output instead of `console.log()`.

Set any required environment variables:
```bash
export API_KEY=your_secret_key
export ROOCH_RPC_URL=https://test-seed.rooch.network:443
```

### 3. Running the Server

#### Using NPM Package

If you installed via npm, you can run the server directly:

```bash
# Show help and available options
mcp-server-proxy --help

# Start with default configuration (looks for config.yaml in current directory)
mcp-server-proxy

# Start with custom port and debug
mcp-server-proxy --port 3000 --debug

# Start with custom config file
mcp-server-proxy --config ./custom-config.yaml

# Start with payment configuration
mcp-server-proxy --service-id my-service --network test --default-price-pico-usd 100000000

# Use with npx (no global installation needed)
npx @nuwa-ai/mcp-server-proxy --config ./my-config.yaml
```

#### From Source Code

If you're building from source:

- **Development mode** (with hot-reloading):
  ```bash
  pnpm dev
  ```

- **Production mode**:
  ```bash
  # 1. Build the project
  pnpm build

  # 2. Start the server
  pnpm start
  ```

- **With command line arguments**:
  ```bash
  # Show help and available options
  pnpm run help
  
  # Start with custom port and debug
  node dist/index.js --port 3000 --debug
  
  # Start with custom config file
  node dist/index.js --config ./custom-config.yaml
  
  # Start with payment configuration
  node dist/index.js --service-id my-service --network test --default-price-pico-usd 100000000
  ```

## Configuration

The server supports multiple configuration methods with the following priority (high to low):

1. **Command line arguments** (highest priority)
2. **Environment variables**
3. **Configuration file**
4. **Default values** (lowest priority)

### Command Line Options

```bash
Options:
  -p, --port <number>                 Server port (default: 8088)
  -e, --endpoint <string>             MCP endpoint path (default: /mcp)
  -c, --config <path>                 Config file path (default: config.yaml)
      --service-id <string>           Payment service ID
  -n, --network <string>              Network (local|dev|test|main)
      --rpc-url <url>                 Rooch RPC URL
      --default-asset-id <string>     Default asset ID
      --default-price-pico-usd <num>  Default price in picoUSD
  -d, --debug                         Enable debug logging
  -h, --help                          Show help message
```

### Environment Variables

```bash
PORT=8088
ENDPOINT=/mcp
CONFIG_PATH=./config.yaml  # Can be local file path or remote URL
SERVICE_ID=my-service
SERVICE_KEY=your-service-key
ROOCH_NETWORK=test
DEFAULT_PRICE_PICO_USD=100000000
DEBUG=true
```

### 4. Remote Configuration Support

MCP Server Proxy now supports loading configuration from remote URLs, making Docker deployments much more convenient.

#### Remote Configuration Examples

```bash
# Load config from remote URL
export CONFIG_PATH=https://your-config-server.com/configs/amap-proxy.yaml
mcp-server-proxy

# Or use command line argument
mcp-server-proxy --config https://your-config-server.com/configs/context7-proxy.yaml

# Docker with remote config
docker run -d -p 8088:8088 \
  -e SERVICE_KEY="your_service_key" \
  -e CONFIG_PATH="https://your-config-server.com/configs/my-proxy.yaml" \
  --name mcp-server-proxy \
  ghcr.io/nuwa-protocol/mcp-server-proxy:latest
```

#### Remote Configuration Benefits

- **Centralized Management**: Store all proxy configurations in one place
- **Easy Updates**: Update configurations without rebuilding Docker images
- **Environment-specific Configs**: Use different URLs for dev/test/prod environments
- **Version Control**: Track configuration changes through your config server
- **Dynamic Configuration**: Update proxy behavior without container restarts

#### Supported URL Schemes

- `https://` - HTTPS URLs (recommended for production)
- `http://` - HTTP URLs (for development/internal networks)

#### Configuration Server Requirements

Your configuration server should:
- Serve YAML files with proper `Content-Type: text/yaml` or `text/plain` headers
- Support HTTPS for production deployments
- Have appropriate CORS headers if accessed from browsers
- Implement proper authentication/authorization if needed

### 5. Local Development Examples

#### Using Pre-configured Instances

You can directly use the pre-configured instances for local development:

**Using NPM Package:**

```bash
# Run Amap proxy locally
export AMAP_API_KEY=your_amap_api_key_here
export SERVICE_KEY=your_service_key_here  # Required for ServiceDID and payment channels
export PORT=8088

# Use the pre-configured amap instance
mcp-server-proxy --config https://raw.githubusercontent.com/nuwa-protocol/nuwa/main/nuwa-services/mcp-server-proxy/deployments/instances/amap-proxy/config.yaml
```

```bash
# Run Context7 proxy locally  
export SERVICE_KEY=your_service_key_here  # Required for ServiceDID and payment channels
export PORT=8089

# Use the pre-configured context7 instance
mcp-server-proxy --config https://raw.githubusercontent.com/nuwa-protocol/nuwa/main/nuwa-services/mcp-server-proxy/deployments/instances/context7-proxy/config.yaml
```

**From Source Code:**

```bash
# Run Amap proxy locally
export AMAP_API_KEY=your_amap_api_key_here
export SERVICE_KEY=your_service_key_here  # Required for ServiceDID and payment channels
export PORT=8088

# Use the pre-configured amap instance
node dist/index.js --config ./deployments/instances/amap-proxy/config.yaml
```

```bash
# Run Context7 proxy locally  
export SERVICE_KEY=your_service_key_here  # Required for ServiceDID and payment channels
export PORT=8089

# Use the pre-configured context7 instance
node dist/index.js --config ./deployments/instances/context7-proxy/config.yaml
```

#### Quick Development Scripts

We provide ready-to-use scripts for local development:

```bash
# Run Amap proxy (requires AMAP_API_KEY and SERVICE_KEY)
export AMAP_API_KEY=your_amap_api_key_here
export SERVICE_KEY=your_service_key_here
./examples/run-amap-local.sh

# Run Context7 proxy (requires SERVICE_KEY)
export SERVICE_KEY=your_service_key_here
./examples/run-context7-local.sh
```

#### Testing the Proxies

##### E2E Testing

Run the comprehensive E2E tests:

```bash
# Run E2E tests (requires Rooch node and PAYMENT_E2E=1)
PAYMENT_E2E=1 pnpm test:e2e:local
```

### 5. Testing

```bash
# Run unit tests and basic integration tests
pnpm test

# Run E2E tests with payment functionality (requires Rooch node)
pnpm test:e2e:local

# Run E2E tests with custom node URL
ROOCH_NODE_URL=https://test-seed.rooch.network:443 pnpm test:e2e
```

**Note**: E2E tests require:
- A running Rooch node (local or remote)
- The `PAYMENT_E2E=1` environment variable
- Sufficient test tokens for payment channel operations

## Deployment

For production deployment, we provide a comprehensive multi-instance deployment system:

### Quick Deployment

```bash
# List available instances
./deployments/scripts/manage.sh list

# Create a new instance
./deployments/scripts/manage.sh create my-proxy httpStream

# Deploy to Railway
./deployments/scripts/manage.sh deploy my-proxy

# Check status
./deployments/scripts/manage.sh status my-proxy
```

### Pre-configured Instances

- **amap-proxy**: Amap Maps MCP proxy
- **context7-proxy**: Context7 documentation library proxy

See [deployments/QUICKSTART.md](./deployments/QUICKSTART.md) for detailed deployment instructions.

## Docker

### Using Pre-built Images (Recommended)

Pull and run the official Docker image from GitHub Container Registry:

```bash
# Pull the latest image
docker pull ghcr.io/nuwa-protocol/mcp-server-proxy:latest

# Run with environment variables
docker run -d -p 8088:8088 \
  -e SERVICE_KEY="your_service_key" \
  -e UPSTREAM_API_KEY="your_upstream_api_key" \
  --name mcp-server-proxy \
  ghcr.io/nuwa-protocol/mcp-server-proxy:latest

# Run with mounted configuration file
docker run -d -p 8088:8088 \
  -v $(pwd)/config.yaml:/app/config/config.yaml \
  -e CONFIG_PATH="/app/config/config.yaml" \
  --name mcp-server-proxy \
  ghcr.io/nuwa-protocol/mcp-server-proxy:latest
```

### Available Tags

- `latest` - Latest stable version from main branch
- `v0.6.x` - Specific version tags
- `main` - Latest development version

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SERVICE_KEY` | Service private key for DID signing | ✅ |
| `CONFIG_PATH` | Path to configuration file | ❌ |
| `PORT` | Server port (default: 8088) | ❌ |
| `ENDPOINT` | MCP endpoint path (default: /mcp) | ❌ |
| `DEBUG` | Enable debug logging | ❌ |
| `UPSTREAM_API_KEY` | API key for upstream services | ⚠️ |

### Docker Compose

Use the provided `docker-compose.yml` file in the repository for easy deployment:

```bash
# Clone the repository and navigate to the service directory
git clone https://github.com/nuwa-protocol/nuwa.git
cd nuwa/nuwa-services/mcp-server-proxy

# Set up your environment variables
export SERVICE_KEY="your_service_key"
export UPSTREAM_API_KEY="your_upstream_api_key"  # If needed for your upstream service

# Start the services
docker-compose up -d
```

The `docker-compose.yml` file includes:
- ✅ **Complete configuration** with all environment variables
- ✅ **Health checks** for service monitoring
- ✅ **Multiple proxy instances examples** (Amap, Context7)
- ✅ **Flexible upstream configuration** for different services

For detailed configuration options, see the [`docker-compose.yml`](./docker-compose.yml) file in the repository.

### Building from Source

If you need to build the image locally:

```bash
# Clone the repository
git clone https://github.com/nuwa-protocol/nuwa.git
cd nuwa/nuwa-services/mcp-server-proxy

# Build the image
docker build -t mcp-server-proxy .

# Run the container
docker run -d -p 8088:8088 \
  -e SERVICE_KEY="your_service_key" \
  --name mcp-server-proxy \
  mcp-server-proxy
``` 