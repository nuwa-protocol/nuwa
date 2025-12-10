# VDR (Verifiable Data Registry) System

This directory contains implementations of the VDR (Verifiable Data Registry) interface for various DID methods.

## Overview

The VDR system provides a unified way to interact with different DID methods, allowing IdentityKit to support multiple DID methods through a consistent interface.

## Available VDR Implementations

- `KeyVDR`: Handles `did:key` DIDs, which are self-resolving as they contain public key material in the identifier.
- `RoochVDR`: Handles `did:rooch` DIDs, interacting with the Rooch blockchain for on-chain DID document management. (More details below)

## RoochVDR Specifics: Understanding Authorization

In the Rooch DID system, all on-chain operations (such as adding/removing verification methods or services) must be authorized by the DID's associated smart contract account. The controller(s) listed in the DID document do not have direct authority to perform these on-chain actions for the DID document itself. Key points:

- **Authorization by DID's Associated Account**: On-chain modifications must be authorized by the DID's own smart contract account (e.g., `did:rooch:<account_address>`), signed by a key registered as an `authentication` verification method in the DID Document, acting as a `session_key`.
- **Permission Check**: `AbstractVDR`'s `validateKeyPermission` (used by `RoochVDR`) checks if the signer has the required capabilities (e.g., `capabilityDelegation`).
- **Debugging**: For `RoochVDR` permission errors, ensure the transaction is signed by an `authentication` key with necessary permissions. Enable debug mode (`debug: true` in `RoochVDR` constructor) for logs.
- **SessionKey Mechanism**: Relies on Rooch's `session_key` system, where an `authentication` key grants temporary, scoped permissions.

> Summary: For Rooch DIDs, the DID's associated smart contract account authorizes on-chain changes via a signature from an `authentication` key. Controllers play other governance roles.

## How to Use

### Basic Usage with IdentityKit

```typescript
import { IdentityKit } from '../index';
import { createDefaultVDRs } from './index';
import { DIDDocument } from '../types'; // Assuming DIDDocument is needed for agent construction

// Example: Initialize with a placeholder or existing DID document for the agent's identity
const didDocument: DIDDocument = {
  /* ... your agent's initial DID Document ... */
};

// Create default VDRs for 'key' and 'rooch' methods
const vdrs = createDefaultVDRs();

// Create a IdentityKit instance with VDRs
const kit = new IdentityKit(didDocument, { vdrs });

// Resolve a DID using the registered VDRs
const resolvedDoc = await kit.resolveDID(
  'did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3'
);

// Example of creating a DID with RoochVDR (requires a signer)
// import { Ed25519Keypair, SignatureScheme } from '@roochnetwork/rooch-sdk'; // Example imports
// const roochSigner = new DIDAccount(resolvedDoc.id, Ed25519Keypair.generate()); // Example signer
// const creationRequest = { publicKeyMultibase: 'z...' /* ... other params for DIDCreationRequest */ };
// const vdr = kit.getVDR('rooch');
// if (vdr) {
//   const creationResult = await vdr.create(creationRequest, { signer: roochSigner });
//   if (creationResult.success) {
//     console.log('DID Created:', creationResult.didDocument.id);
//   }
// }
```

### Creating Custom VDR Implementations

To create a custom VDR implementation:

1.  Extend the `AbstractVDR` class (see `abstractVDR.ts`).
2.  Implement the methods from the `VDRInterface` (see below), primarily `create` (and `createViaCADOP` if applicable) for DID generation, and `resolve` for fetching DID documents. Implement update methods (`addVerificationMethod`, etc.) as needed by your VDR.
3.  Register your custom VDR with `IdentityKit`.

For detailed implementation guidance, **refer to the `AbstractVDR.ts` class and existing implementations like `RoochVDR.ts` and `KeyVDR.ts`**. These files provide concrete examples of method implementations, option handling, and error management.

**High-Level Structure Example:**

```typescript
import { AbstractVDR } from './abstractVDR';
import { DIDDocument, DIDCreationRequest, DIDCreationResult } from '../types';

export class CustomVDR extends AbstractVDR {
  constructor(methodName: string /*, ...other options */) {
    super(methodName);
    // ... initialization ...
  }

  async create(request: DIDCreationRequest, options?: any): Promise<DIDCreationResult> {
    // 1. Validate request
    // 2. Interact with your specific DID registry/network
    // 3. Build the DIDDocument (potentially using `this.buildDIDDocumentFromRequest`)
    // 4. Return DIDCreationResult
    // For details, see KeyVDR.ts or RoochVDR.ts
    throw new Error('Method not implemented.');
  }

  async resolve(did: string): Promise<DIDDocument | null> {
    this.validateDIDMethod(did);
    // Implementation for resolving a DID document from your specific source
    // For details, see KeyVDR.ts or RoochVDR.ts
    throw new Error('Method not implemented.');
  }

  // ... implement other VDRInterface methods as needed ...
  // (exists, addVerificationMethod, removeVerificationMethod, addService, etc.)
  // Refer to AbstractVDR.ts for method signatures.
}
```

## VDR Interface

Each VDR implementation should conform to the `VDRInterface`. `AbstractVDR` provides a base class with some default implementations and helper methods.

```typescript
import {
  DIDDocument,
  ServiceEndpoint,
  VerificationMethod,
  VerificationRelationship,
  DIDCreationRequest,
  DIDCreationResult,
  CADOPCreationRequest,
} from '../types';

interface VDRInterface {
  // DID Document Creation
  create?(request: DIDCreationRequest, options?: any): Promise<DIDCreationResult>;
  createViaCADOP?(request: CADOPCreationRequest, options?: any): Promise<DIDCreationResult>;

  // Core operations
  resolve(did: string): Promise<DIDDocument | null>;
  exists(did: string): Promise<boolean>;
  getMethod(): string;

  // Fine-grained update operations
  // Concrete VDRs must implement these if they support updates.
  // See AbstractVDR.ts for signatures and default "not implemented" errors.
  addVerificationMethod(
    did: string,
    verificationMethod: VerificationMethod,
    relationships?: VerificationRelationship[],
    options?: any
  ): Promise<boolean>;
  removeVerificationMethod(did: string, id: string, options?: any): Promise<boolean>;
  addService(did: string, service: ServiceEndpoint, options?: any): Promise<boolean>;
  removeService(did: string, id: string, options?: any): Promise<boolean>;
  updateRelationships(
    did: string,
    id: string,
    add: VerificationRelationship[],
    remove: VerificationRelationship[],
    options?: any
  ): Promise<boolean>;
  updateController(did: string, controller: string | string[], options?: any): Promise<boolean>;
}
```

### Usage Pattern

**Initial Creation using `create`:**
The `create` method is used when the DID and its document are generated/registered by the VDR system (e.g., on-chain VDRs).

```typescript
// const vdr = agent.getVDR('rooch'); // Or your custom VDR
// const creationRequest: DIDCreationRequest = { /* ... */ };
// const signer = getSignerForDidCreation(); // Obtain appropriate signer for the VDR
// const creationResult = await vdr.create(creationRequest, { signer });
// if (creationResult.success && creationResult.didDocument) { /* ... */ }
```

**Checking Existence and Updates:**
Before updates, check if a DID exists.

```typescript
// const did = 'did:example:123';
// const vdr = agent.getVDR('example');
// const exists = await vdr.exists(did);
// if (!exists) {
//   await vdr.create(...);
// } else {
//   // For updates, use fine-grained methods with appropriate options (e.g., signer, keyId)
//   // await vdr.addVerificationMethod(did, newKey, relationships, updateOptions);
//   // Refer to specific VDR implementation and AbstractVDR.ts for details on options.
// }
```

Update methods include: `addVerificationMethod`, `removeVerificationMethod`, `addService`, etc.

### Permission Model

VDRs enforce permissions, often guided by `AbstractVDR`'s `validateKeyPermission` helper.

- **Key Management** (e.g., `addVerificationMethod`) typically needs `capabilityDelegation`.
- **Service Management** (e.g., `addService`) typically needs `capabilityInvocation`.
- **Controller Updates** require current controller authorization.

**Note for RoochVDR:** On-chain authorization is tied to the DID's account signing via an `authentication` key. Documented permissions (e.g. `capabilityDelegation`) verify intent.

Consult `AbstractVDR.ts` and specific VDRs for how permissions are handled (e.g., via `options.keyId`, `options.signer`).

## Implementing a Custom VDR: Key Points

For building a new VDR:

1.  **Extend `AbstractVDR`**: This provides structure and helper utilities.
2.  **Implement Core Methods**:
    - `create(request: DIDCreationRequest, options?: any)`: For DID generation.
    - `resolve(did: string)`: To fetch the DID document.
3.  **Implement Update Methods (if applicable)**: Such as `addVerificationMethod`, `addService`, etc. These involve:
    - Resolving the current document.
    - Validating permissions (see `validateUpdateOperation` in `AbstractVDR`).
    - Copying the document (`this.copyDocument`).
    - Applying changes and persisting them.
4.  **Error Handling & Validation**: Use helpers from `AbstractVDR` (e.g., `validateDIDMethod`, `validateDocument`) and implement robust error reporting.

**The best resources for understanding implementation details are:**

- `nuwa-kit/typescript/packages/nuwa-identity-kit/src/vdr/abstractVDR.ts`
- Existing VDR implementations like `KeyVDR.ts` and `RoochVDR.ts`.

These files showcase how to structure your VDR, handle parameters, manage state, and interact with the underlying DID method's specifics.
