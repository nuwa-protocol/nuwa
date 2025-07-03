# MCP Server Proxy

MCP Server Proxy is a proxy server designed to sit in front of various Model Capability Protocol (MCP) services. It provides a unified authentication layer (DIDAuthV1), protocol translation (e.g., stdio to HTTP), and a foundation for usage metering.

This allows modern Nuwa clients to securely interact with legacy MCP services that might only support API keys or have no authentication at all.

For a detailed design document, see [DESIGN.md](./DESIGN.md).

## Features

- **DIDAuthV1 Authentication**: Secures upstream services with Nuwa's standard DID-based authentication.
- **Upstream Authentication**: Injects API keys, bearer tokens, or basic auth credentials for upstream services.
- **Protocol Translation**: Exposes `stdio`-based MCP services over `httpStream`/SSE.
- **Hostname-based Routing**: Routes requests to different upstream services based on the request hostname (with prefix matching).
- **Dual Protocol Support**: Understands both modern REST-like MCP calls and legacy JSON-RPC calls.

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
# HTTP Server Settings
server:
  host: "0.0.0.0"
  port: 8088

# Default upstream when no route matches
defaultUpstream: "my-service"

# Upstream MCP servers
upstreams:
  my-service:
    type: "http"
    url: "https://api.example.com/mcp?key=${API_KEY}"

# Routing rules (prefix-based)
routes:
  - hostname: "myservice."
    upstream: "my-service"

# DIDAuth settings
didAuth:
  required: true
```

Set any required environment variables for your upstreams:
```bash
export API_KEY=your_secret_key
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