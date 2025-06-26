# MCP Client Example (TypeScript)

A minimal script that connects to the *MCP Server Example* via **httpStream** using Vercel AI-SDK's `createMCPClient` helper.

The script demonstrates:

* Building a `DIDAuthV1` header for every JSON-RPC request (NIP-10)
* Using `StreamableHTTPClientTransport` (bidirectional HTTP streaming)
* Listing remote tools and calling the `echo` tool

## Quick Start

1.  Ensure the example server is running (see sibling directory).
2.  Install dependencies and run:

```bash
cd nuwa-kit/typescript/examples/mcp-client
pnpm install
pnpm dev           # -> Echo result: { text: "Hello from MCP client" }
``` 