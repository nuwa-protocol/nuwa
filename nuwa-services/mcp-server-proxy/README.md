# MCP Server Proxy (Single Upstream)

MCP Server Proxy is a streamlined MCP service that provides upstream forwarding and payment capabilities. It uses FastMcpStarter to provide a single `/mcp` endpoint with JSON-RPC over HTTP/SSE.

This implementation follows the V2 design (see [PROPOSAL_V2_SINGLE_UPSTREAM_PAYMENT.md](./docs/PROPOSAL_V2_SINGLE_UPSTREAM_PAYMENT.md)) which simplifies the architecture to focus on per-call payment and tool execution.

## Features

- **Single MCP Endpoint**: Provides `/mcp` endpoint with JSON-RPC over streamable HTTP
- **Upstream Forwarding**: Automatically forwards all upstream tools to clients
- **Custom Tools**: Optional custom tool registration via configuration
- **Per-call Payment**: Integrated with Nuwa Payment Kit for tool-level billing
- **FastMcpStarter Integration**: Uses the standard Nuwa MCP server framework
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
upstreamUrl: "https://api.example.com/mcp?key=${API_KEY}"

# Optional payment configuration
serviceId: "my-mcp-service"
network: "test"
rpcUrl: "${ROOCH_RPC_URL}"
defaultPricePicoUSD: "1000000000000"  # 0.001 USD - Default price for all tools

# Custom tools (optional)
register:
  tools:
    - name: "example.tool"
      description: "Example custom tool"
      pricePicoUSD: "2000000000000"  # Explicit price, overrides default
      parameters:
        type: "object"
        properties:
          input:
            type: "string"
    - name: "free.tool"
      description: "Free tool"
      pricePicoUSD: "0"  # Free tool
      parameters:
        type: "object"
    - name: "default.price.tool"
      description: "Uses default price"
      # No pricePicoUSD specified - uses defaultPricePicoUSD
      parameters:
        type: "object"
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
  
  # Start with upstream URL
  node dist/index.js --upstream-url https://api.example.com/mcp
  
  # Start with payment configuration
  node dist/index.js --service-id my-service --network test --default-price-pico-usd 1000000000000
  
  # Use custom config file
  node dist/index.js --config ./my-config.yaml
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
  -u, --upstream-url <url>            Upstream MCP server URL
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
UPSTREAM_URL=https://api.example.com/mcp
SERVICE_ID=my-service
SERVICE_KEY=your-service-key
ROOCH_NETWORK=test
ROOCH_RPC_URL=https://test-seed.rooch.network:443
DEFAULT_ASSET_ID=0x3::gas_coin::RGas
DEFAULT_PRICE_PICO_USD=1000000000000
DEBUG=true
```

### 4. Testing

```bash
pnpm test
```

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