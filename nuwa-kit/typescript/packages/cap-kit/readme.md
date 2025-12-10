# @nuwa-ai/cap-kit

[![npm version](https://badge.fury.io/js/@nuwa-ai%2Fcap-kit.svg)](https://badge.fury.io/js/@nuwa-ai%2Fcap-kit)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A TypeScript library for managing Agent Capability Packages (ACPs) on the Nuwa Protocol. This library provides seamless integration between Web3 identity authentication, IPFS storage, and blockchain contracts for decentralized AI agent capability management.

## Features

- 🔐 **DID-based Authentication**: Secure identity management using Decentralized Identifiers
- 🌐 **IPFS Storage**: Decentralized file storage for capability packages
- ⛓️ **Blockchain Integration**: On-chain registration using Rooch blockchain
- 🤖 **MCP Protocol**: Model Context Protocol integration for AI agent communication
- 🔍 **Query & Discovery**: Efficient capability package search and retrieval
- 📦 **TypeScript Support**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install @nuwa-ai/cap-kit
```

or

```bash
yarn add @nuwa-ai/cap-kit
```

## Quick Start

```typescript
import { CapKit } from '@nuwa-ai/cap-kit';
import { createSelfDid, TestEnv } from '@nuwa-ai/identity-kit';

// Initialize the environment
const env = await TestEnv.bootstrap({
  rpcUrl: 'https://test-seed.rooch.network',
  network: 'test',
  debug: false,
});

// Create a DID signer
const { signer } = await createSelfDid(env, {
  customScopes: ['0xcontract::*::*'],
});

// Initialize CapKit
const capKit = new CapKit({
  roochUrl: 'https://test-seed.rooch.network',
  mcpUrl: 'https://nuwa-production-a276.up.railway.app',
  contractAddress: '0xdc2a3eba923548660bb642b9df42936941a03e2d8bab223ae6dda6318716e742',
  signer,
});

// Register a new capability
const cid = await capKit.registerCap('my_awesome_cap', 'Description of my capability', {
  version: '1.0.0',
  capabilities: ['text-generation', 'summarization'],
});

console.log(`Capability registered with CID: ${cid}`);
```

## API Reference

### Constructor

```typescript
new CapKit(options: {
  mcpUrl: string;
  roochUrl: string;
  contractAddress: string;
  signer: SignerInterface;
})
```

- `mcpUrl`: URL of the MCP server for IPFS operations
- `roochUrl`: URL of the Rooch blockchain RPC endpoint
- `contractAddress`: Address of the ACP registry smart contract
- `signer`: DID-based signer for authentication

### Methods

#### `registerCap(name, description, options)`

Registers a new Agent Capability Package.

```typescript
async registerCap(
  name: string,
  description: string,
  options: any
): Promise<string>
```

**Parameters:**

- `name`: Unique capability name (6-20 characters, alphanumeric and underscore only)
- `description`: Human-readable description of the capability
- `options`: Additional metadata and configuration

**Returns:** IPFS CID of the registered capability package

**Example:**

```typescript
const cid = await capKit.registerCap(
  'web_scraper',
  'Advanced web scraping capability with rate limiting',
  {
    version: '2.1.0',
    capabilities: ['web-scraping', 'data-extraction'],
    requirements: {
      memory: '512MB',
      permissions: ['network-access'],
    },
  }
);
```

#### `queryCapWithCID(cid)`

Retrieves capability metadata by IPFS CID.

```typescript
async queryCapWithCID(cid: string): Promise<any>
```

**Parameters:**

- `cid`: IPFS Content Identifier

**Returns:** Capability metadata object

**Example:**

```typescript
const capability = await capKit.queryCapWithCID('QmcG8y4tGQacqSMJdWUQuJvf4921psvoasfQrasMRRTC3q');
console.log(capability.name, capability.description);
```

#### `queryWithName(name?, page?, size?)`

Searches capabilities by name with pagination support.

```typescript
async queryWithName(
  name?: string,
  page?: number,
  size?: number
): Promise<any>
```

**Parameters:**

- `name`: Optional name filter for search
- `page`: Page number for pagination (default: 1)
- `size`: Number of results per page (default: 10)

**Returns:** Paginated list of capability packages

**Example:**

```typescript
// Search all capabilities
const allCaps = await capKit.queryWithName();

// Search by name with pagination
const results = await capKit.queryWithName('web', 1, 20);
console.log(`Found ${results.total} capabilities`);
```

#### `downloadCap(cid, format?)`

Downloads the content of a capability package.

```typescript
async downloadCap(
  cid: string,
  format?: 'base64' | 'utf8'
): Promise<any>
```

**Parameters:**

- `cid`: IPFS Content Identifier
- `format`: Data format for download (default: 'utf8')

**Returns:** Downloaded capability package content

**Example:**

```typescript
const content = await capKit.downloadCap('QmcG8y4tGQacqSMJdWUQuJvf4921psvoasfQrasMRRTC3q', 'utf8');

// Parse YAML content
import * as yaml from 'js-yaml';
const capability = yaml.load(content.data.fileData);
```

## Configuration

### Environment Setup

For development and testing, you can use different network configurations:

```typescript
// Local development
const capKit = new CapKit({
  roochUrl: 'http://localhost:6767',
  mcpUrl: 'http://localhost:3000/mcp',
  contractAddress: '0xlocal_contract_address',
  signer,
});

// Testnet
const capKit = new CapKit({
  roochUrl: 'https://test-seed.rooch.network',
  mcpUrl: 'https://nuwa-production-a276.up.railway.app',
  contractAddress: '0xdc2a3eba923548660bb642b9df42936941a03e2d8bab223ae6dda6318716e742',
  signer,
});
```

### Capability Package Format

Capability packages are stored as YAML files with the following structure:

```yaml
id: 'did:nuwa:user123:my_capability'
name: 'my_capability'
description: 'Description of the capability'
version: '1.0.0'
capabilities:
  - 'text-generation'
  - 'data-analysis'
requirements:
  memory: '256MB'
  permissions:
    - 'network-access'
    - 'file-system-read'
metadata:
  author: 'User Name'
  license: 'MIT'
  tags: ['ai', 'nlp', 'utility']
```

## Error Handling

The library includes comprehensive error handling for common scenarios:

```typescript
try {
  const cid = await capKit.registerCap('test_cap', 'Test capability', {});
} catch (error) {
  if (error.message.includes('Name must be between 6 and 20 characters')) {
    console.error('Invalid capability name format');
  } else if (error.message.includes('Upload failed')) {
    console.error('IPFS upload error:', error.message);
  } else {
    console.error('Registration failed:', error.message);
  }
}
```

## Development

### Running Tests

```bash
npm run test
```

### Building

```bash
npm run build
```

### Linting

```bash
npm run lint
```

## Dependencies

- **@nuwa-ai/identity-kit**: DID-based identity management
- **@roochnetwork/rooch-sdk**: Rooch blockchain integration
- **@modelcontextprotocol/sdk**: Model Context Protocol client
- **js-yaml**: YAML parsing and serialization
- **ai**: AI SDK for MCP client creation

## Contributing

We welcome contributions! Please see our [Contributing Guide](https://github.com/nuwa-protocol/nuwa/blob/main/CONTRIBUTING.md) for details.

## License

This project is licensed under the Apache-2.0 License - see the [LICENSE](https://github.com/nuwa-protocol/nuwa/blob/main/LICENSE) file for details.

## Support

- [GitHub Issues](https://github.com/nuwa-protocol/nuwa/issues)
- [Documentation](https://github.com/nuwa-protocol/nuwa/tree/main/nuwa-kit/typescript/packages/cap-kit)
- [Nuwa Protocol](https://nuwa.ai)
