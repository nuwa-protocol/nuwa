# Identity Kit Examples

This directory contains example TypeScript files demonstrating how to use the Nuwa Identity Kit.

## Prerequisites

- Node.js (v18 or higher)
- pnpm package manager

## Setup

1. **Navigate to the project root:**

   ```bash
   cd nuwa-kit/typescript
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Build the identity-kit package:**
   ```bash
   cd packages/identity-kit
   pnpm run build
   ```

## Running Examples

### Method 1: Using tsx (Recommended)

The easiest way to run TypeScript examples directly:

```bash
npx tsx examples/stored-key-export-import.ts
```

### Method 2: Using ts-node

If you prefer ts-node:

```bash
npx ts-node examples/stored-key-export-import.ts
```

### Method 3: Compile and Run

Compile the TypeScript file first, then run the JavaScript:

```bash
# Compile the example
npx tsc examples/stored-key-export-import.ts --outDir dist/examples --module es2020 --target es2020

# Run the compiled JavaScript
node dist/examples/stored-key-export-import.js
```

## Available Examples

### stored-key-export-import.ts

Demonstrates how to use the StoredKey export and import functionality to serialize keys for storage in environment variables or configuration files.

**Features:**

- Create KeyManager with DID key generation
- Export keys to string format
- Import keys from exported strings
- Environment variable integration
- Signature verification
- Multiple key type support

**Expected Output:**

```
=== StoredKey Export/Import Example ===

1. Creating KeyManager with a new DID key...
   DID: did:key:z6Mkpzup9totGJWHpuvkVEsW2Vh8oayRJVwgH24kVuf6sZ7T
   Key ID: did:key:z6Mkpzup9totGJWHpuvkVEsW2Vh8oayRJVwgH24kVuf6sZ7T#account-key

2. Exporting key to string...
   Exported key (first 50 chars): z3HpaPDy2WN8TPNiyYwfcN5QW47DAQxipWnSHShWoKbZHkSSFg...
   Full length: 384 characters
   Starts with 'z' (base58btc): true

...

=== Example completed successfully! ===
```

## Troubleshooting

### Common Issues

1. **"Unknown file extension '.ts'" error:**
   - Use `tsx` or `ts-node` instead of running with `node` directly
   - Make sure you've built the package first with `pnpm run build`

2. **Module resolution errors:**
   - Ensure you're running from the `packages/identity-kit` directory
   - Verify that dependencies are installed with `pnpm install`

3. **Import errors:**
   - Check that the package has been built (`pnpm run build`)
   - Verify the import paths in the example files

### Getting Help

If you encounter issues:

1. Check that all dependencies are installed
2. Ensure the package is built (`pnpm run build`)
3. Verify you're in the correct directory (`packages/identity-kit`)
4. Try using `tsx` instead of `ts-node` if you encounter compatibility issues

## Adding New Examples

When adding new examples:

1. Create your TypeScript file in the `examples/` directory
2. Use ES modules syntax (`import`/`export`)
3. Include a main function that demonstrates the functionality
4. Add proper error handling
5. Update this README with information about your new example

Example structure:

```typescript
/**
 * Example: Your Example Name
 *
 * Brief description of what this example demonstrates
 */

import { KeyManager } from '../src/keys';

async function main() {
  console.log('=== Your Example ===\n');

  // Your example code here

  console.log('=== Example completed successfully! ===');
}

// Run the example if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}
```
