# Identity Kit Test Helpers

This module provides utilities to simplify Rooch DID integration testing by abstracting away the complexity of on-chain DID creation and key management.

## Quick Start

```ts
import { TestEnv, createSelfDid } from '@nuwa-ai/identity-kit/testHelpers';

describe('My Integration Test', () => {
  beforeEach(async () => {
    // Skip tests if no Rooch node is available
    if (TestEnv.skipIfNoNode()) return;
    
    // Bootstrap test environment
    const env = await TestEnv.bootstrap({
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      network: 'test',
      debug: true
    });
    
    // Create DIDs with real on-chain transactions
    const payer = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019'
    });
    
    const payee = await createSelfDid(env, {
      keyType: 'Ed25519VerificationKey2020'
    });
    
    // Use the DIDs in your tests
    console.log('Payer DID:', payer.did);
    console.log('Payee DID:', payee.did);
  });
});
```

## Core Concepts

### TestEnv

The `TestEnv` class manages the test environment setup, including:
- Rooch client initialization
- VDR registry setup
- Network connectivity checking
- CI/CD environment detection

### createSelfDid()

Creates a DID by calling the on-chain `create_did_object_for_self` function. This ensures that:
- The DID actually exists on the blockchain
- The private key corresponds to the DID's account address
- The DID document has proper verification methods and relationships

### CADOP Methods

#### createCadopCustodian()
Creates a custodian DID with CADOP service.

#### createDidViaCadop()
Creates a user DID via CADOP protocol using an existing custodian.

## Payment Kit Integration

TestEnv now includes a pre-configured `IdentityEnv` that can be used directly with Payment Kit:

```ts
import { TestEnv, createSelfDid } from '@nuwa-ai/identity-kit/testHelpers';
import { createHttpClient } from '@nuwa-ai/payment-kit';

describe('Payment Integration Test', () => {
  test('should work with simplified API', async () => {
    if (TestEnv.skipIfNoNode()) return;
    
    // Bootstrap test environment
    const env = await TestEnv.bootstrap({
      rpcUrl: 'http://localhost:6767',
      network: 'local'
    });
    
    // Create a test DID (now includes its own IdentityEnv)
    const payer = await createSelfDid(env);
    
    // Create HTTP client with automatic service discovery
    const client = await createHttpClient({
      baseUrl: 'https://api.example.com',
      env: payer.identityEnv,  // Use the DID's dedicated IdentityEnv
      maxAmount: BigInt('1000000000')
    });
    
    // Make paid API calls
    const result = await client.get('/v1/echo?q=hello');
  });
});
```

### Multi-Identity Testing

Each DID created with `createSelfDid` gets its own `IdentityEnv`, making it perfect for testing scenarios with multiple parties:

```ts
describe('Multi-Party Payment Test', () => {
  test('should work with separate identities', async () => {
    if (TestEnv.skipIfNoNode()) return;
    
    const env = await TestEnv.bootstrap({
      rpcUrl: 'http://localhost:6767',
      network: 'local'
    });
    
    // Create separate identities for payer and payee
    const payer = await createSelfDid(env);
    const payee = await createSelfDid(env);
    
    // Each has their own IdentityEnv - no conflicts!
    const payerClient = await createHttpClient({
      baseUrl: 'https://api.example.com',
      env: payer.identityEnv,  // Payer's IdentityEnv
      maxAmount: BigInt('1000000000')
    });
    
    // You could also create a payee service using payee.identityEnv
    // without any interference between the two
    
    const result = await payerClient.get('/v1/echo?q=hello');
  });
});
```

## Environment Variables

- `ROOCH_NODE_URL`: RPC endpoint for Rooch node (defaults to `http://localhost:6767`)
- `CI`: Set to 'true' to enable CI mode (auto-skip tests if no node available)
- `GITHUB_ACTIONS`: Detected automatically for GitHub Actions

## Error Handling

The test helpers will automatically:
- Skip tests in CI environments when no Rooch node is available
- Provide clear error messages for setup failures
- Wait for transaction confirmations
- Handle funding and account setup

## Advanced Usage

### Custom Key Types

```ts
const didResult = await createSelfDid(env, {
  keyType: 'EcdsaSecp256k1VerificationKey2019',
  keyFragment: 'my-custom-key',
  skipFunding: false
});
```

### CADOP Testing

#### 分步创建（推荐方式）

```ts
import { 
  TestEnv, 
  createCadopCustodian, 
  createDidViaCadop 
} from '@nuwa-ai/identity-kit/testHelpers';

const env = await TestEnv.bootstrap();

// 1. 先创建托管方（带 CADOP 服务）
const custodian = await createCadopCustodian(env, {
  custodianKeyType: 'EcdsaSecp256k1VerificationKey2019',
  skipFunding: false
});

console.log('Custodian created with CADOP service:', custodian.did);

// 2. 使用同一个托管方为多个用户创建 DID
const user1 = await createDidViaCadop(env, custodian, {
  userKeyType: 'Ed25519VerificationKey2020'
});

const user2 = await createDidViaCadop(env, custodian, {
  userKeyType: 'EcdsaSecp256k1VerificationKey2019'
});

console.log('User 1 DID:', user1.did);
console.log('User 2 DID:', user2.did);
```

#### 在测试用例中的使用

```ts
import { 
  TestEnv, 
  createCadopCustodian, 
  createDidViaCadop 
} from '@nuwa-ai/identity-kit/testHelpers';

describe('Payment Channel Tests', () => {
  let env: TestEnv;
  let custodian: CreateSelfDidResult;

  beforeEach(async () => {
    if (TestEnv.skipIfNoNode()) return;
    
    env = await TestEnv.bootstrap();
    
    // 为整个测试套件创建一个托管方
    custodian = await createCadopCustodian(env);
  });

  it('should create payment channels for different users', async () => {
    if (TestEnv.skipIfNoNode()) return;

    // 为每个测试用例创建不同的用户
    const payer = await createDidViaCadop(env, custodian, {
      userKeyType: 'EcdsaSecp256k1VerificationKey2019'
    });

    const payee = await createDidViaCadop(env, custodian, {
      userKeyType: 'Ed25519VerificationKey2020'
    });

    // 测试支付通道逻辑...
    expect(payer.did).toBeDefined();
    expect(payee.did).toBeDefined();
    expect(payer.did).not.toBe(payee.did);
  });
});
```

#### 为什么使用分步创建？

1. **性能优化**：可以重用同一个托管方为多个用户创建 DID，避免重复创建托管方的开销
2. **测试灵活性**：可以先创建托管方，然后在不同的测试用例中创建不同的用户
3. **更好的关注点分离**：托管方创建和用户 DID 创建是两个不同的操作
4. **资源管理**：在测试套件中可以更好地管理和清理资源

### Manual Environment Checking

```ts
import { TestEnv } from '@nuwa-ai/identity-kit/testHelpers';

// Synchronous check
if (TestEnv.skipIfNoNode()) {
  console.log('Skipping tests - no Rooch node available');
  return;
}

// Async check with connectivity test
const env = await TestEnv.bootstrap();
console.log('Connected to:', env.rpcUrl);
```

## Best Practices

1. **Always check environment**: Use `TestEnv.skipIfNoNode()` at the start of test suites
2. **Reuse DIDs**: Create DIDs in `beforeEach` and reuse across tests
3. **Use proper cleanup**: The test helpers handle cleanup automatically
4. **Handle CI/CD**: Tests will automatically skip in CI when no node is available
5. **Use meaningful names**: Set custom key fragments for clarity

## Migration from Manual Setup

Before (manual setup):
```ts
const keyPair = Secp256k1Keypair.generate();
const address = keyPair.getRoochAddress().toBech32Address();
const did = `did:rooch:${address}`; // ❌ DID doesn't exist on-chain!
```

After (using test helpers):
```ts
const { did, keyManager, signer } = await createSelfDid(env);
// ✅ DID is created on-chain and ready to use
``` 