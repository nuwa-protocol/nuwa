# MCP Server Example (TypeScript)

A minimal FastMCP server protected by **NIP-10 DIDAuthV1**.  
The server exposes a single `echo` tool and listens on **httpStream** port `8080`.

## Quick Start

```bash
cd nuwa-kit/typescript/examples/mcp-server
pnpm install          # installs fastmcp + links workspace packages
pnpm dev              # start the server with tsx (hot-reload)
```

Now connect with any MCP client that supports httpStream.  
Example using AI-SDK (see sibling *mcp-client* example):

```
client.callTool({ name: "echo", arguments: { text: "Hello" } })
```

The server validates the `Authorization: DIDAuthV1 …` header on every request. 