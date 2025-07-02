# MCP Cap Store Service

A secure IPFS file upload service based on FastMCP, integrating NIP-10 DIDAuthV1 authentication and go ipfs storage functionality. This service provides secure and reliable file upload and IPFS resource query functions.

## Quick Start

- Create a .env file:
```bash
# IPFS node configuration
IPFS_HOST=localhost
IPFS_PORT=5001
```

- Running the Server

```bash
cd nuwa-services/typescript/mcp-cap-store
pnpm install          # installs fastmcp + links workspace packages
pnpm dev              # start the server with tsx (hot-reload)
```

The server validates the `Authorization: DIDAuthV1 …` header on every request. 