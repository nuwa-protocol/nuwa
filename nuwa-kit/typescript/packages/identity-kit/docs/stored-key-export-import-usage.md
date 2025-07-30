# StoredKey Export/Import Usage Guide

This guide demonstrates how to use the new StoredKey export/import functionality in `@nuwa-ai/identity-kit` to serialize keys for storage in environment variables, configuration files, or other storage mechanisms.

## Overview

The StoredKey export/import feature allows you to:
- Export any `StoredKey` to a single base58btc-encoded string
- Import keys from serialized strings into new `KeyManager` instances  
- Easily pass private keys through environment variables or CI/CD secrets
- Maintain full key functionality after export/import cycles

## Quick Start

### 1. Basic Export/Import

```typescript
import { KeyManager } from '@nuwa-ai/identity-kit';

// Create a KeyManager with a new key
const { keyManager, keyId } = await KeyManager.createWithDidKey();

// Export the key to a string
const exportedKey = await keyManager.exportKeyToString(keyId);
console.log('Exported key:', exportedKey);

// Create a new KeyManager from the exported string
const newKeyManager = await KeyManager.fromSerializedKey(exportedKey);

// Verify the key works
const testData = new Uint8Array([1, 2, 3, 4, 5]);
const signature = await newKeyManager.signWithKeyId(testData, keyId);
console.log('Successfully signed with imported key!');
```

### 2. Environment Variable Usage

```typescript
// Export for environment variable
const { keyManager, keyId } = await KeyManager.createWithDidKey();
const envString = await keyManager.exportKeyToString(keyId);

// Save to .env file
console.log(`STORED_KEY="${envString}"`);

// Load from environment variable
function loadKeyManagerFromEnv(): Promise<KeyManager> {
  const serialized = process.env.STORED_KEY;
  if (!serialized) {
    throw new Error('STORED_KEY environment variable not set');
  }
  return KeyManager.fromSerializedKey(serialized);
}

// Use in your application
const appKeyManager = await loadKeyManagerFromEnv();
```

### 3. Direct Codec Usage

```typescript
import { StoredKeyCodec } from '@nuwa-ai/identity-kit';

// Get a StoredKey from KeyManager
const storedKey = await keyManager.getStoredKey(keyId);

// Direct encoding/decoding
const encoded = StoredKeyCodec.encode(storedKey!);
const decoded = StoredKeyCodec.decode(encoded);

console.log('Original:', storedKey);
console.log('Decoded:', decoded);
```

## API Reference

### KeyManager Methods

#### `exportKeyToString(keyId: string): Promise<string>`

Exports a stored key to a base58btc-encoded string.

**Parameters:**
- `keyId`: The ID of the key to export

**Returns:** A base58btc-encoded string representation of the StoredKey

**Throws:** Error if the key is not found

#### `importKeyFromString(serialized: string): Promise<StoredKey>`

Imports a StoredKey from a serialized string into the current KeyManager.

**Parameters:**
- `serialized`: Base58btc-encoded string representation of a StoredKey

**Returns:** The imported StoredKey

#### `KeyManager.fromSerializedKey(serialized: string, store?: KeyStore): Promise<KeyManager>`

Static factory method to create a new KeyManager from a serialized key.

**Parameters:**
- `serialized`: Base58btc-encoded string representation of a StoredKey
- `store`: Optional KeyStore instance (defaults to MemoryKeyStore)

**Returns:** A new KeyManager instance with the imported key

### StoredKeyCodec Methods

#### `StoredKeyCodec.encode(key: StoredKey): string`

Encodes a StoredKey to a base58btc string.

**Parameters:**
- `key`: The StoredKey to encode

**Returns:** Base58btc-encoded string with 'z' prefix

#### `StoredKeyCodec.decode(serialized: string): StoredKey`

Decodes a base58btc string to a StoredKey.

**Parameters:**
- `serialized`: Base58btc-encoded string

**Returns:** The decoded StoredKey

## Use Cases

### CI/CD Pipelines

Store private keys as secrets in your CI/CD system:

```bash
# Set in GitHub Actions, GitLab CI, etc.
STORED_KEY="z3HpaPDy2WN8TPNiyYwfcN5QW47DAQxij2JEpYGi7j4Li1Uqes..."
```

```typescript
// In your application
const keyManager = await KeyManager.fromSerializedKey(process.env.STORED_KEY!);
```

### Development Environment

Store test keys in `.env` files for local development:

```env
# .env
STORED_KEY="z3HpaPDy2WN8TPNiyYwfcN5QW47DAQxij2JEpYGi7j4Li1Uqes..."
```

### Configuration Files

Store keys in configuration files (ensure proper security):

```json
{
  "identity": {
    "key": "z3HpaPDy2WN8TPNiyYwfcN5QW47DAQxij2JEpYGi7j4Li1Uqes..."
  }
}
```

### Key Backup and Migration

Export keys for backup or migration between systems:

```typescript
// Backup
const backup = await keyManager.exportKeyToString(keyId);
await fs.writeFile('key-backup.txt', backup);

// Restore
const restored = await fs.readFile('key-backup.txt', 'utf8');
const restoredKeyManager = await KeyManager.fromSerializedKey(restored);
```

## Security Considerations

⚠️ **Important Security Notes:**

1. **Private Key Exposure**: Exported strings contain private keys in plaintext (base64-encoded). Only use this for:
   - Development and testing environments
   - Internal CI/CD systems with proper secret management
   - Trusted backup systems

2. **Production Considerations**: For production systems, consider:
   - Hardware Security Modules (HSMs)
   - Key Management Services (KMS)
   - KeyStore implementations that don't expose private keys

3. **Storage Security**: When storing exported keys:
   - Use secure secret management systems
   - Encrypt at rest when possible
   - Limit access permissions
   - Rotate keys regularly

## Error Handling

```typescript
try {
  const keyManager = await KeyManager.fromSerializedKey(serializedKey);
} catch (error) {
  if (error.message.includes('validation failed')) {
    console.error('Invalid key format or corrupted data');
  } else if (error.message.includes('not found')) {
    console.error('Key not found in storage');
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

## Examples

For complete working examples, see:
- `examples/stored-key-export-import.ts` - Comprehensive usage demonstration
- Test files in `test/keys/` for additional usage patterns

## Format Details

Exported keys use the following format:
- **Encoding**: Base58btc with 'z' prefix (multibase format)
- **Content**: JSON representation of the StoredKey object
- **Size**: Approximately 300-400 characters for typical keys

Example exported key:
```
z3HpaPDy2WN8TPNiyYwfcN5QW47DAQxij2JEpYGi7j4Li1Uqes...
```

This encodes a JSON object like:
```json
{
  "keyId": "did:key:z6MkjaCy4DaU3krCimuG11B6VipLDgx3HYKtfxhbAggSEuEA#account-key",
  "keyType": "Ed25519",
  "publicKeyMultibase": "z6MkjaCy4DaU3krCimuG11B6VipLDgx3HYKtfxhbAggSEuEA",
  "privateKeyMultibase": "z3u2HNqP6b5gqBCT7vdPkxX4rY8QRJl1KcSMZ9p7b6vRsA8W"
}
``` 