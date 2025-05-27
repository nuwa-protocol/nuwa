# Nuwa Identity Kit

SDK for NIP-1 Agent Single DID Multi-Key Model and NIP-3 CADOP (Custodian-Assisted DID Onboarding Protocol)

## Features

- **NIP-1 Agent Single DID Multi-Key Model**: Support for managing multiple keys within a single DID
- **NIP-3 CADOP**: Custodian-Assisted DID Onboarding Protocol for seamless user onboarding
- **Multi-VDR Support**: Pluggable Verifiable Data Registry (VDR) implementations
- **Rooch Integration**: Native support for Rooch blockchain DID operations
- **Type Safety**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install nuwa-identity-kit @roochnetwork/rooch-sdk
```

## Quick Start

### Basic Setup

```typescript
import { RoochVDR } from 'nuwa-identity-kit';

// Create a RoochVDR instance with default configuration
const roochVDR = RoochVDR.createDefault('test'); // 'dev', 'test', or 'main'

// Or with custom configuration
import { RoochClient } from '@roochnetwork/rooch-sdk';

const client = new RoochClient({ url: 'https://test-seed.rooch.network/' });
const roochVDR = new RoochVDR({
  rpcUrl: 'https://test-seed.rooch.network/',
  client: client,
  didContractAddress: '0x3::did'
});
```

### Self DID Creation (NIP-1)

```typescript
import { RoochClient, Args } from '@roochnetwork/rooch-sdk';

// Create DID for yourself using your account key
const didDocument = {
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: 'did:rooch:0x123...',
  controller: ['did:rooch:0x123...'],
  verificationMethod: [{
    id: 'did:rooch:0x123...#account-key',
    type: 'EcdsaSecp256k1VerificationKey2019',
    controller: 'did:rooch:0x123...',
    publicKeyMultibase: 'z4MXj1wBzi9jUstyPMS4jQqB6KdJaiatPkAtVtGc6bQEQEEsKTic'
  }],
  authentication: ['did:rooch:0x123...#account-key'],
  assertionMethod: ['did:rooch:0x123...#account-key'],
  capabilityInvocation: ['did:rooch:0x123...#account-key'],
  capabilityDelegation: ['did:rooch:0x123...#account-key']
};

const success = await roochVDR.store(didDocument, {
  signer: yourRoochSigner
});
```

### CADOP DID Creation (NIP-3)

```typescript
// Custodian creates DID for user using did:key
const success = await roochVDR.createViaCADOP(
  'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', // User's did:key
  'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',         // Custodian service public key
  'Ed25519VerificationKey2020',                                  // Service key type
  {
    signer: custodianSigner
  }
);
```

### DID Resolution

```typescript
// Resolve a DID document
const didDocument = await roochVDR.resolve('did:rooch:0x123...');

if (didDocument) {
  console.log('DID Document:', didDocument);
  console.log('Verification Methods:', didDocument.verificationMethod);
  console.log('Services:', didDocument.service);
}

// Check if DID exists
const exists = await roochVDR.exists('did:rooch:0x123...');
console.log('DID exists:', exists);
```

### Key Management

```typescript
// Add a new verification method
await roochVDR.addVerificationMethod(
  'did:rooch:0x123...',
  {
    id: 'did:rooch:0x123...#key-2',
    type: 'Ed25519VerificationKey2020',
    controller: 'did:rooch:0x123...',
    publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
  },
  ['authentication', 'assertionMethod'], // Verification relationships
  {
    signer: yourRoochSigner
  }
);

// Remove a verification method
await roochVDR.removeVerificationMethod(
  'did:rooch:0x123...',
  'did:rooch:0x123...#key-2',
  {
    signer: yourRoochSigner
  }
);

// Update verification relationships
await roochVDR.updateRelationships(
  'did:rooch:0x123...',
  'did:rooch:0x123...#key-2',
  ['keyAgreement'],           // Add these relationships
  ['assertionMethod'],        // Remove these relationships
  {
    signer: yourRoochSigner
  }
);
```

### Service Management

```typescript
// Add a simple service
await roochVDR.addService(
  'did:rooch:0x123...',
  {
    id: 'did:rooch:0x123...#service-1',
    type: 'LinkedDomains',
    serviceEndpoint: 'https://example.com'
  },
  {
    signer: yourRoochSigner
  }
);

// Add a service with properties
await roochVDR.addServiceWithProperties(
  'did:rooch:0x123...',
  {
    id: 'did:rooch:0x123...#llm-service',
    type: 'LLMGatewayNIP9',
    serviceEndpoint: 'https://api.example.com/llm',
    properties: {
      'model': 'gpt-4',
      'version': '1.0',
      'apiKey': 'encrypted_key_reference'
    }
  },
  {
    signer: yourRoochSigner
  }
);

// Remove a service
await roochVDR.removeService(
  'did:rooch:0x123...',
  'did:rooch:0x123...#service-1',
  {
    signer: yourRoochSigner
  }
);
```

## Architecture

### VDR (Verifiable Data Registry) Pattern

The SDK uses a pluggable VDR pattern that allows different blockchain implementations:

```typescript
import { AbstractVDR } from 'nuwa-identity-kit';

// All VDR implementations extend AbstractVDR
class CustomVDR extends AbstractVDR {
  constructor() {
    super('custom'); // method name
  }
  
  async store(didDocument: DIDDocument): Promise<boolean> {
    // Implementation specific logic
  }
  
  async resolve(did: string): Promise<DIDDocument | null> {
    // Implementation specific logic
  }
  
  // ... other required methods
}
```

### Rooch Integration

The RoochVDR implementation integrates directly with Rooch's DID contract system:

- **Contract Address**: `0x3::did` (configurable)
- **Session Key Support**: Automatic registration of authentication keys as Rooch session keys
- **Permission Model**: Based on verification relationships (authentication, capabilityDelegation, etc.)
- **Gas Management**: Configurable gas limits for all operations

### Key Features

#### 1. Session Key Integration
When adding verification methods with `authentication` relationship, they are automatically registered as Rooch session keys for seamless transaction signing.

#### 2. Permission-Based Operations
- **Capability Delegation**: Required for key management operations
- **Capability Invocation**: Required for service management operations
- **Authentication**: Required for basic DID operations

#### 3. Multi-Key Support (NIP-1)
- Support for multiple verification methods per DID
- Different key types: Ed25519, Secp256k1
- Flexible verification relationships

#### 4. CADOP Support (NIP-3)
- Custodian-assisted onboarding using did:key
- Service key provisioning
- User retains control through did:key controller

## API Reference

### RoochVDR Class

#### Constructor Options
```typescript
interface RoochVDROptions {
  rpcUrl: string;                    // Rooch RPC endpoint
  client?: RoochClient;              // Optional pre-configured client
  signer?: any;                      // Default signer
  didContractAddress?: string;       // DID contract address (default: 0x3::did)
  network?: 'dev' | 'test' | 'main'; // Network type
}
```

#### Operation Options
```typescript
interface RoochVDROperationOptions {
  signer?: any;                      // Signer for this operation
  maxGas?: number;                   // Gas limit (default: 100000000)
  waitForConfirmation?: boolean;     // Wait for transaction confirmation
}
```

#### Methods

- `store(didDocument, options?)`: Store a new DID document
- `createViaCADOP(userDidKey, custodianPk, keyType, options?)`: Create DID via CADOP
- `resolve(did)`: Resolve a DID document
- `exists(did)`: Check if DID exists
- `addVerificationMethod(did, vm, relationships?, options?)`: Add verification method
- `removeVerificationMethod(did, id, options?)`: Remove verification method
- `addService(did, service, options?)`: Add service
- `addServiceWithProperties(did, service, options?)`: Add service with properties
- `removeService(did, id, options?)`: Remove service
- `updateRelationships(did, id, add, remove, options?)`: Update verification relationships

### Static Methods

- `RoochVDR.createDefault(network?)`: Create with default configuration
- `RoochVDR.getRoochNodeUrl(network)`: Get network-specific RPC URL

## Error Handling

The SDK provides comprehensive error handling:

```typescript
try {
  const result = await roochVDR.store(didDocument, { signer });
} catch (error) {
  if (error.message.includes('DID already exists')) {
    // Handle duplicate DID
  } else if (error.message.includes('No signer provided')) {
    // Handle missing signer
  } else {
    // Handle other errors
  }
}
```

## Testing

```bash
npm test                    # Run tests
npm run test:coverage      # Run with coverage
npm run test:watch         # Watch mode
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ISC License

## Related Specifications

- [NIP-1: Agent Single DID Multi-Key Model](https://github.com/nuwa-protocol/nips/blob/main/nip-1.md)
- [NIP-3: CADOP - Custodian-Assisted DID Onboarding Protocol](https://github.com/nuwa-protocol/nips/blob/main/nip-3.md)
- [W3C DID Core Specification](https://www.w3.org/TR/did-core/)
- [Rooch Network Documentation](https://rooch.network/docs)
