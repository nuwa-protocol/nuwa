# MCP Server Proxy

MCP Server Proxy is a streamlined MCP service that provides upstream forwarding and payment capabilities. It uses FastMcpStarter to provide a single `/mcp` endpoint with JSON-RPC over HTTP/SSE.

This implementation follows the V2 design (see [PROPOSAL_V2_SINGLE_UPSTREAM_PAYMENT.md](./docs/PROPOSAL_V2_SINGLE_UPSTREAM_PAYMENT.md)) which simplifies the architecture to focus on per-call payment and tool execution.

## Features

- **Single MCP Endpoint**: Provides `/mcp` endpoint with JSON-RPC over streamable HTTP
- **Upstream Forwarding**: Automatically forwards all upstream tools to clients
- **Per-call Payment**: Integrated with Nuwa Payment Kit for tool-level billing
- **Pure Proxy**: Clean architecture focused on forwarding and payment, no built-in test tools

## Quick Start

### 1. Installation

```bash
cd nuwa-services/mcp-server-proxy
pnpm install
```

### 2. Configuration

Create a `config.yaml` file by copying the example:

```bash
cp config.yaml.example config.yaml
```

Now, edit `config.yaml` to match your needs. Here is a minimal example:

```yaml
# Server settings
port: 8088
endpoint: "/mcp"

# Optional upstream MCP server
upstream:
  type: "httpStream"
  url: "https://api.example.com/mcp?key=${API_KEY}"

# Alternative: stdio upstream
# upstream:
#   type: "stdio"
#   command: ["npx", "@example/mcp-server"]
#   env:
#     API_KEY: "${API_KEY}"

# Optional payment configuration
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
    - name: "default.price.tool"
      # No pricePicoUSD specified - uses defaultPricePicoUSD
```

Set any required environment variables:
```bash
export API_KEY=your_secret_key
export ROOCH_RPC_URL=https://test-seed.rooch.network:443
```

### 3. Running the Server

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
CONFIG_PATH=./config.yaml
SERVICE_ID=my-service
SERVICE_KEY=your-service-key
ROOCH_NETWORK=test
DEFAULT_PRICE_PICO_USD=100000000
DEBUG=true
```

### 4. Local Development Examples

#### Using Pre-configured Instances

You can directly use the pre-configured instances for local development:

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

You can also build and run the proxy using Docker:

```bash
# 1. Build the image
docker build -t mcp-server-proxy .

# 2. Run the container, mounting your config file and passing environment variables
docker run -p 8088:8088 \
  -v $(pwd)/config.yaml:/app/config.yaml \
  -e API_KEY="your_secret_key" \
  mcp-server-proxy
``` 