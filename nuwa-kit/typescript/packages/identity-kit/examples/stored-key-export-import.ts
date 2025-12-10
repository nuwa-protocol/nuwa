/**
 * Example: StoredKey Export/Import Usage
 *
 * This example demonstrates how to use the StoredKey export and import functionality
 * to serialize keys for storage in environment variables or configuration files.
 */

import { KeyManager, StoredKeyCodec } from '../src/keys';
import { KeyType } from '../src/types/crypto';

async function main() {
  console.log('=== StoredKey Export/Import Example ===\n');

  // 1. Create a KeyManager and generate a key
  console.log('1. Creating KeyManager with a new DID key...');
  const { keyManager, keyId, did } = await KeyManager.createWithDidKey();
  console.log(`   DID: ${did}`);
  console.log(`   Key ID: ${keyId}\n`);

  // 2. Export the key to a string
  console.log('2. Exporting key to string...');
  const exportedKeyString = await keyManager.exportKeyToString(keyId);
  console.log(`   Exported key (first 50 chars): ${exportedKeyString.substring(0, 50)}...`);
  console.log(`   Full length: ${exportedKeyString.length} characters`);
  console.log(`   Starts with 'z' (base58btc): ${exportedKeyString.startsWith('z')}\n`);

  // 3. Simulate storing in environment variable
  console.log('3. Environment variable usage:');
  console.log(`   export STORED_KEY="${exportedKeyString}"`);
  console.log('   # Now you can use this in .env files or CI/CD secrets\n');

  // 4. Import the key in a new KeyManager instance
  console.log('4. Creating new KeyManager from exported string...');
  const newKeyManager = await KeyManager.fromSerializedKey(exportedKeyString);
  console.log(`   New KeyManager DID: ${await newKeyManager.getDid()}`);
  console.log('   ✓ Successfully created KeyManager from exported key\n');

  // 5. Verify functionality by signing with both KeyManagers
  console.log('5. Verifying functionality with signing test...');
  const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  const originalSignature = await keyManager.signWithKeyId(testData, keyId);
  const importedSignature = await newKeyManager.signWithKeyId(testData, keyId);

  const signaturesMatch = originalSignature.every(
    (byte, index) => byte === importedSignature[index]
  );
  console.log(`   Original signature: ${Array.from(originalSignature).slice(0, 8).join(', ')}...`);
  console.log(`   Imported signature: ${Array.from(importedSignature).slice(0, 8).join(', ')}...`);
  console.log(`   ✓ Signatures match: ${signaturesMatch}\n`);

  // 6. Direct codec usage example
  console.log('6. Direct StoredKeyCodec usage...');
  const storedKey = await keyManager.getStoredKey(keyId);
  if (storedKey) {
    const directEncoded = StoredKeyCodec.encode(storedKey);
    const directDecoded = await StoredKeyCodec.decode(directEncoded);

    console.log(
      `   Direct encode/decode successful: ${JSON.stringify(directDecoded.keyId) === JSON.stringify(storedKey.keyId)}`
    );
    console.log(`   Key type preserved: ${directDecoded.keyType === storedKey.keyType}`);
  }

  // 7. Multiple key types example
  console.log('\n7. Multiple key types example...');
  const secp256k1Key = await keyManager.generateKey('secp256k1-key', KeyType.SECP256K1);
  const secp256k1Exported = await keyManager.exportKeyToString(secp256k1Key.keyId);

  console.log(`   SECP256K1 key exported: ${secp256k1Exported.substring(0, 30)}...`);
  console.log(`   Different from Ed25519: ${secp256k1Exported !== exportedKeyString}`);

  // 8. Environment variable loading simulation
  console.log('\n8. Simulating application startup with environment variable...');

  // Simulate process.env.STORED_KEY
  const mockEnvStoredKey = exportedKeyString;

  async function loadKeyManagerFromEnv(): Promise<KeyManager> {
    const serialized = mockEnvStoredKey; // In real app: process.env.STORED_KEY
    if (!serialized) {
      throw new Error('STORED_KEY environment variable not set');
    }
    return KeyManager.fromSerializedKey(serialized);
  }

  const envKeyManager = await loadKeyManagerFromEnv();
  console.log('   ✓ Successfully loaded KeyManager from simulated environment variable');
  console.log(`   ✓ Can access key: ${(await envKeyManager.getStoredKey(keyId)) !== null}`);

  console.log('\n=== Example completed successfully! ===');
}

/**
 * Utility function for application startup
 * Use this pattern in your applications to load keys from environment variables
 */
export async function loadKeyManagerFromEnvironment(): Promise<KeyManager> {
  const serialized = process.env.STORED_KEY;
  if (!serialized) {
    throw new Error('STORED_KEY environment variable not set');
  }
  return KeyManager.fromSerializedKey(serialized);
}

/**
 * Utility function to export a key for storage
 * Use this to generate the value for your STORED_KEY environment variable
 */
export async function exportKeyForEnvironment(
  keyManager: KeyManager,
  keyId: string
): Promise<string> {
  return keyManager.exportKeyToString(keyId);
}

// Run the example if this file is executed directly
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.argv[1] === __filename) {
  main().catch(console.error);
}
