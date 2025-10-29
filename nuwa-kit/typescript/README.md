# Nuwa Protocol SDK for TypeScript

This package provides the official TypeScript/JavaScript SDK for the Nuwa Protocol. It allows developers to easily build applications and AI agents that interact with Nuwa.

## Features

*   Identity Management (NIP-1, NIP-2, NIP-3)
*   Capability Handling (NIP-5)
*   Payment Channel Interaction (NIP-4)
*   Service Gateway Communication (NIP-6, NIP-7)
*   Core utilities and type definitions.

## Structure (Monorepo - pnpm)

This SDK is structured as a monorepo using pnpm workspaces. Key packages include:

*   `packages/identity-kit`: Identity creation, authentication, and management.
*   `packages/identity-kit-web`: Identity creation, authentication, and management for web.

## Installation

(Instructions for installing packages, e.g., using pnpm)

```bash
# Example for a specific package (once published)
pnpm add @nuwa-ai/identity-kit
```

## Development

(Instructions for setting up the development environment, building, and testing)

### Prerequisites
*   Node.js (e.g., v18+)
*   pnpm

### Setup
```bash
git clone <repository-url>
cd nuwa-kit/typescript
pnpm install
pnpm run build
```

### Running Tests
```bash
pnpm test
```