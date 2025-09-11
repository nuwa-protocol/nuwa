# MCP Server Proxy (Single Upstream)

MCP Server Proxy is a streamlined MCP service that combines built-in tools with optional upstream forwarding and payment capabilities. It uses FastMcpStarter to provide a single `/mcp` endpoint with JSON-RPC over HTTP/SSE.

This implementation follows the V2 design (see [PROPOSAL_V2_SINGLE_UPSTREAM_PAYMENT.md](./docs/PROPOSAL_V2_SINGLE_UPSTREAM_PAYMENT.md)) which simplifies the architecture to focus on per-call payment and tool execution.

## Features

- **Single MCP Endpoint**: Provides `/mcp` endpoint with JSON-RPC over streamable HTTP
- **Built-in Tools**: Includes configurable free and paid tools
- **Optional Upstream Forwarding**: Can forward tool calls to a single upstream MCP service
- **Per-call Payment**: Integrated with Nuwa Payment Kit for tool-level billing
- **FastMcpStarter Integration**: Uses the standard Nuwa MCP server framework

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

# Custom tools
register:
  tools:
    - name: "echo.free"
      description: "Echo text back"
      pricePicoUSD: "0"
      parameters:
        type: "object"
        properties:
          text:
            type: "string"
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