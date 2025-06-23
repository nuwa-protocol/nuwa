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
npm install @nuwa-ai/identity-kit @roochnetwork/rooch-sdk
```

## Core Concepts

Before diving into the examples, let's understand some core components:

- **`NuwaIdentityKit`**: This is the primary SDK class you'll interact with. It provides a comprehensive suite of tools for managing DIDs, verification methods (keys), and services.
- **`VDRInterface` (Verifiable Data Registry Interface)**: An interface that defines how `NuwaIdentityKit` communicates with a specific DID method's underlying ledger or network (e.g., `did:rooch` on the Rooch Network). The SDK allows you to use different VDR implementations. `RoochVDR` is one such implementation for the Rooch Network.
- **`SignerInterface`**: An interface for cryptographic signing operations. This allows `NuwaIdentityKit` to authorize changes to a DID document. You can integrate various signing mechanisms, such as browser extensions, hardware wallets, or custom backend signers.
- **DID Document**: A JSON-LD document that contains information about a DID, including its cryptographic keys, service endpoints, and control mechanisms.

## Quick Start

This section will guide you through the initial steps of using `NuwaIdentityKit`.

### 1. Initializing `NuwaIdentityKit`

There are several ways to get an instance of `NuwaIdentityKit`:

**a) Creating a New DID**

To create a brand new DID and its associated document, you'll use `NuwaIdentityKit.createNewDID()`. This requires a `DIDCreationRequest` object detailing the new DID's properties, a VDR instance (e.g., `RoochVDR` configured for your target network), and a signer instance compliant with the `SignerInterface`.

```typescript
import { NuwaIdentityKit, RoochVDR, DIDCreationRequest, SignerInterface } from '@nuwa-ai/identity-kit';
// import { Secp256k1Keypair } from '@roochnetwork/rooch-sdk'; // Example for a key management library
// import { YourVDRImplementation } from './your-vdr';
// import { YourSignerImplementation } from './your-signer'; // You'll need to provide a class that implements SignerInterface

// 1. Obtain or configure your VDR instance (e.g., RoochVDR for did:rooch)
// const vdr: RoochVDR = RoochVDR.createDefault('test'); 
// /* Or, for example:
// import { RoochClient } from '@roochnetwork/rooch-sdk';
// const roochClient = new RoochClient({ url: 'https://test-seed.rooch.network/' });
// const vdr = new RoochVDR({ client: roochClient });
// */

// 2. Obtain or configure your Signer instance
// The signer must implement the SignerInterface from '@nuwa-ai/identity-kit'.
// It will be used to authorize the creation of the DID and subsequent operations.
// For Rooch, this might involve a Keypair from '@roochnetwork/rooch-sdk' adapted to SignerInterface.
// const keypair = Secp256k1Keypair.generate(); // Example key generation
// const signer: SignerInterface = new YourSignerImplementation(keypair /*, ...other relevant args */);

// 3. Define the DID Creation Request
const didCreationRequest: DIDCreationRequest = {
  method: 'rooch', // Or your target DID method
  controllerKey: {
    type: 'EcdsaSecp256k1VerificationKey2019', // Specify key type matching your signer
    publicKeyMaterial: 'zPublicKeyMultibaseForController', // Provide the public key material for the controller
    // idFragment: 'controller' // Optional custom key ID fragment
  },
  // Optionally, define initial verification methods, services, etc.
  // verificationMethods: [ /* ... */ ],
  // services: [ /* ... */ ],
};

async function setupNewDID(vdr: RoochVDR, signer: SignerInterface) { // Pass configured vdr and signer
  // try {
  //   const nuwaKit = await NuwaIdentityKit.createNewDID(
  //     didCreationRequest,
  //     vdr, 
  //     signer
  //   );
  //   console.log('New DID Created:', nuwaKit.getDIDDocument().id);
  // } catch (error) {
  //   console.error('Error creating new DID:', error);
  // }
}

// Example usage:
// const vdrInstance = /* ... initialize your VDR ... */;
// const signerInstance = /* ... initialize your Signer ... */;
// setupNewDID(vdrInstance, signerInstance);
```

**b) Loading an Existing DID**

To manage a DID that already exists, use `NuwaIdentityKit.fromExistingDID()`. You'll need the DID string and an array of VDR instances that can resolve and interact with that DID's method.

```typescript
import { NuwaIdentityKit, RoochVDR, SignerInterface } from '@nuwa-ai/identity-kit';
// import { YourSignerImplementation } from './your-signer'; 

// 1. Obtain or configure VDR instance(s) for the DID method(s) you'll be working with.
// const roochVDR: RoochVDR = RoochVDR.createDefault('test');
// const anotherVDR = new AnotherVDRImplementation();

// 2. (Optional) Set up an external signer if you intend to perform update operations.
//    This signer should be capable of signing for the DID being loaded.
// const externalSigner: SignerInterface = new YourSignerImplementation(/* ... */);

const didString = "did:rooch:your-existing-did-here"; // Example DID

async function manageExistingDID(vdrs: RoochVDR[], externalSigner?: SignerInterface) { // Pass VDRs and optional signer
  // try {
  //   const nuwaKit = await NuwaIdentityKit.fromExistingDID(
  //     didString,
  //     vdrs, // Provide VDRs capable of handling the DID method
  //     {
  //       externalSigner: externalSigner, // Optional: for signing subsequent operations
  //     }
  //   );
  //   console.log('Loaded DID:', nuwaKit.getDIDDocument().id);
  // } catch (error) {
  //   console.error('Error loading existing DID:', error);
  // }
}

// Example usage:
// const vdrArray = [/* ... your VDR instances ... */];
// const signerForExistingDID = /* ... optional signer for the DID ... */;
// manageExistingDID(vdrArray, signerForExistingDID);
```

**c) Loading from a Known DID Document**

If you have the complete DID Document object, you can initialize `NuwaIdentityKit` using `NuwaIdentityKit.fromDIDDocument()`. This is useful if the DID Document was obtained externally.

```typescript
import { NuwaIdentityKit, DIDDocument, RoochVDR, SignerInterface } from '@nuwa-ai/identity-kit';
// import { YourSignerImplementation } from './your-signer'; 

// const knownDidDocument: DIDDocument = { /* ... your DID Document object ... */ };

function initFromDocument(knownDidDocument: DIDDocument, vdrs?: RoochVDR[], externalSigner?: SignerInterface) {
  // const nuwaKit = NuwaIdentityKit.fromDIDDocument(
  //   knownDidDocument,
  //   {
  //     // Optional: Provide an externalSigner if you need to sign operations
  //     externalSigner: externalSigner,
  //     // Optional: Provide VDRs if you plan to interact with the network for this DID
  //     vdrs: vdrs
  //   }
  // );
  // console.log('Loaded DID from document:', nuwaKit.getDIDDocument().id);
}

// Example usage:
// const doc = /* ... your DIDDocument ... */;
// const vdrArrayForDoc = [/* ... optional VDRs ... */];
// const signerForDoc = /* ... optional Signer ... */;
// initFromDocument(doc, vdrArrayForDoc, signerForDoc);
```

### 2. Basic Operations with a `NuwaIdentityKit` Instance

Once you have a `NuwaIdentityKit` instance (`nuwaKit`), you can perform various operations:

**a) Get the DID Document**

Retrieve the current, in-memory state of the DID Document.

```typescript
// Assuming `nuwaKit` is an initialized NuwaIdentityKit instance
// const didDocument = nuwaKit.getDIDDocument();
// console.log('DID Document:', didDocument);
```

**b) Resolve a DID (Fetch the latest from VDR)**

To get the most up-to-date version of a DID Document from its registered VDR.

```typescript
// Assuming `nuwaKit` is an initialized NuwaIdentityKit instance (`nk`)
// and the appropriate VDR is registered with it.
// const didToResolve = "did:rooch:some-other-did-or-own-did-for-refresh";

async function fetchLatestDID(nk: NuwaIdentityKit, didToResolve: string) {
  // try {
  //   const resolvedDoc = await nk.resolveDID(didToResolve);
  //   if (resolvedDoc) {
  //     console.log('Resolved DID Document:', resolvedDoc);
  //   } else {
  //     console.log('Could not resolve DID:', didToResolve);
  //   }
  // } catch (error) {
  //   console.error('Error resolving DID:', error);
  // }
}

// Example usage:
// const myNuwaKit = /* ... your NuwaIdentityKit instance ... */;
// const someDid = "did:rooch:xyz";
// fetchLatestDID(myNuwaKit, someDid);
```

**c) Check if a DID Exists**

Verify if a DID is registered on its respective VDR.

```typescript
// Assuming `nuwaKit` is an initialized NuwaIdentityKit instance (`nk`)
// and the appropriate VDR is registered.
// const didToCheck = "did:rooch:some-did-to-check";

async function verifyDIDExistence(nk: NuwaIdentityKit, didToCheck: string) {
  // try {
  //   const exists = await nk.didExists(didToCheck);
  //   console.log(`DID ${didToCheck} exists: ${exists}`);
  // } catch (error) {
  //   console.error('Error checking DID existence:', error);
  // }
}

// Example usage:
// const myNuwaKit = /* ... your NuwaIdentityKit instance ... */;
// const someDidToVerify = "did:rooch:abc";
// verifyDIDExistence(myNuwaKit, someDidToVerify);
```

### CADOP DID Creation (NIP-3)

NIP-3 (Custodian-Assisted DID Onboarding Protocol) allows a custodian to create a DID on behalf of a user. The user typically initiates this process with a `did:key`.

This operation is performed by a VDR (Verifiable Data Registry) that supports the target DID method and CADOP. The `NuwaIdentityKit` can be used to access and utilize such a VDR.

The custodian (who is running the code below) will need a `SignerInterface` instance to authorize the DID creation on the VDR.

```typescript
import { NuwaIdentityKit, RoochVDR, CADOPCreationRequest, SignerInterface, DIDCreationResult } from '@nuwa-ai/identity-kit';

// Assume `custodianNuwaKit` is an initialized NuwaIdentityKit instance for the custodian.
// It should have a VDR registered (e.g., RoochVDR) that supports CADOP for the desired DID method.
// Assume `custodianSigner` is a SignerInterface instance authorized by the custodian 
// to perform operations like creating DIDs for users.

async function createDIDForUserViaCADOP(
  custodianNuwaKit: NuwaIdentityKit, 
  custodianSigner: SignerInterface
) {
  // const userGeneratedDidKey = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'; // User's did:key
  // const custodianServiceKeyMultibase = 'z6MkpzP1n65hZDrY62z48bB9jV2NFBfsn6A1t2hT5c6a4S4p'; // Custodian's public key for the service
  // const custodianServiceKeyType = 'Ed25519VerificationKey2020'; // Type of the custodian's service key

  // const cadopRequest: CADOPCreationRequest = {
  //   userDidKey: userGeneratedDidKey,
  //   custodianServicePublicKey: custodianServiceKeyMultibase, // Public key of the custodian service endpoint VM
  //   custodianServiceVMType: custodianServiceKeyType,      // Type of the custodian service VM
  // };

  // // 1. Get the appropriate VDR from NuwaIdentityKit
  // // The target DID method for which the VDR should be retrieved.
  // // This method string might be part of the custodian's configuration or derived.
  // const targetDidMethod = 'rooch'; // Example: creating a did:rooch
  // const vdr = custodianNuwaKit.getVDR(targetDidMethod);

  // if (!vdr) {
  //   console.error(`No VDR found for method: ${targetDidMethod}`);
  //   return;
  // }

  // try {
  //   // 2. Call createViaCADOP on the VDR instance
  //   const result: DIDCreationResult = await vdr.createViaCADOP(
  //     cadopRequest,
  //     {
  //       keyId: 'did:custodian:id#service-key-for-cadop', // Key ID of the custodian's key used for signing this operation
  //       signer: custodianSigner // Custodian's signer instance
  //     }
  //   );

  //   if (result.success && result.didDocument) {
  //     console.log('Successfully created DID for user via CADOP:', result.didDocument.id);
  //     console.log('Full DID Document:', result.didDocument);
  //   } else {
  //     console.error('CADOP DID creation failed:', result.error);
  //   }
  // } catch (error) {
  //   console.error('Error during CADOP creation:', error);
  // }
}

// To use this function:
// const custodiansKit = /* ... custodian's NuwaIdentityKit instance with a VDR ... */;
// const custodiansSigner = /* ... custodian's SignerInterface instance ... */;
// createDIDForUserViaCADOP(custodiansKit, custodiansSigner);
```

### Key Management (NIP-1)

`NuwaIdentityKit` provides methods to manage the verification methods (cryptographic keys) associated with a DID, in accordance with the NIP-1 Agent Single DID Multi-Key Model.

All key management operations that modify the DID document require a signer capable of authorizing changes for the DID. This is typically provided via the `options` argument in each method, specifying the `keyId` to sign with and the `signer` instance.

```typescript
import { NuwaIdentityKit, OperationalKeyInfo, VerificationRelationship, SignerInterface } from '@nuwa-ai/identity-kit';

// Assume `nuwaKit` is an initialized NuwaIdentityKit instance for the DID being managed.
// Assume `signerForDIDManagement` is a SignerInterface instance authorized 
// to make changes to the nuwaKit's DID (e.g., using a controller key).

// Example: Add a new verification method
async function addNewKey(nuwaKit: NuwaIdentityKit, signer: SignerInterface) {
  // const newKeyMaterial = /* Generate or retrieve new public key material (e.g., multibase string or JWK) */;
  // const newKeyType = 'Ed25519VerificationKey2020'; // Or EcdsaSecp256k1VerificationKey2019, etc.
  
  // const keyInfo: OperationalKeyInfo = {
  //   idFragment: 'key-new', // A unique fragment for the new key's ID within the DID document
  //   type: newKeyType,
  //   publicKeyMaterial: newKeyMaterial, // Uint8Array or JsonWebKey
  //   controller: nuwaKit.getDIDDocument().id, // Typically the DID itself
  // };

  // const relationships: VerificationRelationship[] = ['authentication', 'assertionMethod'];
  
  // try {
  //   const newVerificationMethodId = await nuwaKit.addVerificationMethod(
  //     keyInfo,
  //     relationships,
  //     {
  //       keyId: 'did:example:controller#key-1', // The ID of the key to be used for signing this operation
  //       signer: signer // The signer instance
  //     }
  //   );
  //   console.log('New verification method added:', newVerificationMethodId);
  //   console.log('Updated DID Document:', nuwaKit.getDIDDocument());
  // } catch (error) {
  //   console.error('Error adding verification method:', error);
  // }
}

// Example: Remove a verification method
async function removeExistingKey(nuwaKit: NuwaIdentityKit, signer: SignerInterface) {
  // const keyIdToRemove = `${nuwaKit.getDIDDocument().id}#key-new`; // ID of the key to remove

  // try {
  //   const success = await nuwaKit.removeVerificationMethod(
  //     keyIdToRemove,
  //     {
  //       keyId: 'did:example:controller#key-1', // Signing key ID
  //       signer: signer // Signer instance
  //     }
  //   );
  //   if (success) {
  //     console.log('Verification method removed:', keyIdToRemove);
  //     console.log('Updated DID Document:', nuwaKit.getDIDDocument());
  //   } else {
  //     console.log('Failed to remove verification method.');
  //   }
  // } catch (error) {
  //   console.error('Error removing verification method:', error);
  // }
}

// Example: Update verification relationships for a key
async function updateKeyRelationships(nuwaKit: NuwaIdentityKit, signer: SignerInterface) {
  // const keyIdToUpdate = `${nuwaKit.getDIDDocument().id}#some-existing-key`;
  // const addRelationships: VerificationRelationship[] = ['keyAgreement'];
  // const removeRelationships: VerificationRelationship[] = ['assertionMethod'];

  // try {
  //   const success = await nuwaKit.updateVerificationMethodRelationships(
  //     keyIdToUpdate,
  //     addRelationships,
  //     removeRelationships,
  //     {
  //       keyId: 'did:example:controller#key-1', // Signing key ID
  //       signer: signer // Signer instance
  //     }
  //   );
  //   if (success) {
  //     console.log('Verification relationships updated for:', keyIdToUpdate);
  //     console.log('Updated DID Document:', nuwaKit.getDIDDocument());
  //   } else {
  //     console.log('Failed to update verification relationships.');
  //   }
  // } catch (error) {
  //   console.error('Error updating relationships:', error);
  // }
}

// To use these functions:
// const myNuwaKit = /* ... your NuwaIdentityKit instance ... */;
// const didSigner = /* ... your SignerInterface instance for DID operations ... */;
// addNewKey(myNuwaKit, didSigner);
// removeExistingKey(myNuwaKit, didSigner);
// updateKeyRelationships(myNuwaKit, didSigner);
```

### Service Management

`NuwaIdentityKit` allows you to manage service endpoints in a DID document. Services can be used to advertise capabilities or provide information associated with the DID.

Similar to key management, operations that modify service endpoints in the DID document require a signer.

```typescript
import { NuwaIdentityKit, ServiceInfo, SignerInterface } from '@nuwa-ai/identity-kit';

// Assume `nuwaKit` is an initialized NuwaIdentityKit instance for the DID being managed.
// Assume `signerForDIDManagement` is a SignerInterface instance authorized 
// to make changes to the nuwaKit's DID.

// Example: Add a new service endpoint
async function addNewService(nuwaKit: NuwaIdentityKit, signer: SignerInterface) {
  // const serviceInfo: ServiceInfo = {
  //   idFragment: 'my-service-1', // A unique fragment for the service ID within the DID document
  //   type: 'LinkedDomains',       // Type of the service
  //   serviceEndpoint: 'https://example.com/myservice',
  //   // Optional: additional properties for the service
  //   additionalProperties: {
  //     description: 'My awesome service',
  //     cost: 'free'
  //   }
  // };

  // // Example for a service with more complex properties (e.g., NIP-9 LLMGateway)
  // const llmServiceInfo: ServiceInfo = {
  //   idFragment: 'llm-gateway',
  //   type: 'LLMGatewayNIP9',
  //   serviceEndpoint: 'https://api.example.com/llm',
  //   additionalProperties: {
  //     model: 'gpt-4',
  //     version: '1.0',
  //     apiKeyReference: 'did:example:mykeyprovider#key-1' // Example reference
  //   }
  // };

  // try {
  //   const newServiceId = await nuwaKit.addService(
  //     serviceInfo, // or llmServiceInfo
  //     {
  //       keyId: 'did:example:controller#key-1', // The ID of the key to sign this operation
  //       signer: signer // The signer instance
  //     }
  //   );
  //   console.log('New service added:', newServiceId);
  //   console.log('Updated DID Document:', nuwaKit.getDIDDocument());
  // } catch (error) {
  //   console.error('Error adding service:', error);
  // }
}

// Example: Remove a service endpoint
async function removeExistingService(nuwaKit: NuwaIdentityKit, signer: SignerInterface) {
  // const serviceIdToRemove = `${nuwaKit.getDIDDocument().id}#my-service-1`; // Full ID of the service to remove

  // try {
  //   const success = await nuwaKit.removeService(
  //     serviceIdToRemove,
  //     {
  //       keyId: 'did:example:controller#key-1', // Signing key ID
  //       signer: signer // Signer instance
  //     }
  //   );
  //   if (success) {
  //     console.log('Service removed:', serviceIdToRemove);
  //     console.log('Updated DID Document:', nuwaKit.getDIDDocument());
  //   } else {
  //     console.log('Failed to remove service.');
  //   }
  // } catch (error) {
  //   console.error('Error removing service:', error);
  // }
}

// To use these functions:
// const myNuwaKit = /* ... your NuwaIdentityKit instance ... */;
// const didSigner = /* ... your SignerInterface instance for DID operations ... */;
// addNewService(myNuwaKit, didSigner);
// removeExistingService(myNuwaKit, didSigner);
```

## Architecture

The Nuwa Identity Kit is designed with a modular architecture centered around the `NuwaIdentityKit` class, which acts as the primary interface for developers. This core class orchestrates DID operations by interacting with Verifiable Data Registries (VDRs) and utilizing Signers for authorization.

### 1. `NuwaIdentityKit` - The Core

`NuwaIdentityKit` provides a unified API for managing DIDs, their associated verification methods (keys), and service endpoints. It handles the NIP-1 Agent Single DID Multi-Key Model and supports NIP-3 CADOP workflows by coordinating with appropriate VDRs and signers.

### 2. VDR (Verifiable Data Registry) Pattern

The SDK employs a pluggable VDR pattern. Each VDR is an implementation of the `VDRInterface` and is responsible for interacting with a specific DID method's underlying ledger or network (e.g., `did:key`, `did:rooch`). This design allows `NuwaIdentityKit` to be extended to support various DID methods.

- **`VDRInterface`**: Defines the contract for all VDRs, including methods for creating, resolving, and updating DID documents (e.g., `create()`, `createViaCADOP()`, `resolve()`, `addVerificationMethod()`).
- **Custom VDRs**: Developers can add support for new DID methods by creating a class that extends `AbstractVDR` (which implements `VDRInterface`) and implementing the required methods. `AbstractVDR` provides a base structure and some utility functions.

  ```typescript
  // Example of a custom VDR structure (conceptual)
  import { AbstractVDR, DIDDocument, DIDCreationRequest, DIDCreationResult } from '@nuwa-ai/identity-kit'; // Assuming these are correct paths

  class CustomVDR extends AbstractVDR {
    constructor(methodName: string /*, ...other options */) {
      super(methodName); // e.g., 'custom'
      // ... custom initialization ...
    }
  
    async create(request: DIDCreationRequest, options?: any): Promise<DIDCreationResult> {
      // Implementation specific logic to create a DID on your custom registry
      throw new Error('Method not implemented.');
    }

    async resolve(did: string): Promise<DIDDocument | null> {
      this.validateDIDMethod(did); // Helper from AbstractVDR
      // Implementation specific logic to resolve a DID from your custom registry
      throw new Error('Method not implemented.');
    }
    
    // ... implement other VDRInterface methods as needed ...
    // (exists, addVerificationMethod, removeVerificationMethod, addService, createViaCADOP, etc.)
  }
  ```

### 3. `SignerInterface` - Decoupled Authorization

All operations that modify a DID document or require on-chain/ledger interaction must be authorized. `NuwaIdentityKit` and VDRs utilize a `SignerInterface`. This interface decouples the core SDK logic from specific signing mechanisms (e.g., browser wallets, hardware signers, backend key management systems). Implementations of `SignerInterface` are responsible for performing cryptographic signing operations.

### 4. Rooch Integration (Example VDR Implementation)

`NuwaIdentityKit` integrates with the Rooch Network through `RoochVDR`, an implementation of `VDRInterface`.

- **Target Contract**: `RoochVDR` interacts with Rooch's standard DID contract (e.g., `0x3::did` or as configured).
- **On-Chain DID Management**: It handles the creation and management of `did:rooch` DIDs directly on the Rooch blockchain.
- **Session Key Support**: `RoochVDR` can leverage Rooch's session key mechanism. For instance, when adding verification methods with an `authentication` relationship, these can be registered as Rooch session keys to authorize subsequent DID operations seamlessly.
- **Permission Model**: Operations on `did:rooch` DIDs are authorized by the DID's associated smart contract account, typically signing with an `authentication` key. The VDR also checks for appropriate NIP-1 verification relationships (like `capabilityDelegation` for key management) as part of its internal logic.
- **Gas Management**: Gas limits for Rooch transactions can be configured when performing operations via `RoochVDR`.

### NIP-1 and NIP-3 Support

The overall architecture enables `NuwaIdentityKit` to:
- Manage multiple keys and verification relationships for a single DID as per **NIP-1**.
- Facilitate custodian-assisted DID onboarding workflows as per **NIP-3**, where VDRs (like `RoochVDR`) handle the `createViaCADOP` process.

## API Reference

This section provides a high-level overview of the core APIs provided by `NuwaIdentityKit`. For detailed type definitions and method signatures, please refer to the source code or generated TypeDoc documentation.

### `NuwaIdentityKit` Class

This is the main class for interacting with DIDs.

**Factory Methods (Static Methods for Initialization):**

- `static async createNewDID(creationRequest: DIDCreationRequest, vdr: VDRInterface, signer: SignerInterface): Promise<NuwaIdentityKit>`
  - Creates a new DID and its document, then initializes an `NuwaIdentityKit` instance.
  - Requires details about the DID to be created (`creationRequest`), a VDR for the target DID method, and a signer for authorization.

- `static async fromExistingDID(did: string, vdrs: VDRInterface[], options?: { operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>, externalSigner?: SignerInterface }): Promise<NuwaIdentityKit>`
  - Resolves an existing DID using one of the provided VDRs and initializes an `NuwaIdentityKit` instance.
  - `options.externalSigner` can be provided to authorize subsequent operations.

- `static fromDIDDocument(didDocument: DIDDocument, options?: { operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>, externalSigner?: SignerInterface, vdrs?: VDRInterface[] }): NuwaIdentityKit`
  - Initializes an `NuwaIdentityKit` instance from an already known DID Document object.

**Instance Methods:**

- `getDIDDocument(): DIDDocument`
  - Returns the current (in-memory) DID Document associated with this kit instance.

- `async resolveDID(did: string): Promise<DIDDocument | null>`
  - Resolves the given DID using a registered VDR capable of handling its method.

- `async didExists(did: string): Promise<boolean>`
  - Checks if the given DID exists on its VDR.

- `async addVerificationMethod(keyInfo: OperationalKeyInfo, relationships: VerificationRelationship[], options: { keyId: string; signer?: SignerInterface }): Promise<string>`
  - Adds a new verification method (key) to the DID document and publishes the change via its VDR.
  - `options` must specify the `keyId` and `signer` to authorize the operation.

- `async removeVerificationMethod(keyIdToRemove: string, options: { keyId: string; signer?: SignerInterface }): Promise<boolean>`
  - Removes a verification method from the DID document.

- `async updateVerificationMethodRelationships(keyIdToUpdate: string, addRelationships: VerificationRelationship[], removeRelationships: VerificationRelationship[], options: { keyId: string; signer?: SignerInterface }): Promise<boolean>`
  - Updates the verification relationships for an existing key.

- `async addService(serviceInfo: ServiceInfo, options: { keyId: string; signer?: SignerInterface }): Promise<string>`
  - Adds a service endpoint to the DID document.

- `async removeService(serviceIdToRemove: string, options: { keyId: string; signer?: SignerInterface }): Promise<boolean>`
  - Removes a service endpoint from the DID document.

- `async createNIP1Signature(payload: Omit<SignedData, 'nonce' | 'timestamp'>, keyId: string): Promise<NIP1SignedObject>`
  - Creates a NIP-1 compliant signature for the given payload using the specified `keyId`.

- `registerVDR(vdr: VDRInterface): NuwaIdentityKit`
  - Registers a VDR instance with the kit, making it available for resolving DIDs of its supported method.

- `getVDR(method: string): VDRInterface | undefined`
  - Retrieves a previously registered VDR instance by its DID method name.

**Static Methods (Utility):**

- `static async verifyNIP1Signature(signedObject: NIP1SignedObject, resolvedDidDocumentOrVDRs: DIDDocument | VDRInterface[]): Promise<boolean>`
  - Verifies a NIP-1 signature against a resolved DID document or by resolving the signer's DID using provided VDRs.

### Core Interfaces & Types

Several important interfaces and type definitions are used throughout the SDK:

- `DIDDocument`: Represents a W3C DID Document.
- `SignerInterface`: Interface for cryptographic signing operations.
- `VDRInterface`: Interface for Verifiable Data Registry implementations (see also `AbstractVDR`).
- `DIDCreationRequest`: Parameters for creating a new DID via `NuwaIdentityKit.createNewDID()` or `VDRInterface.create()`.
- `CADOPCreationRequest`: Parameters for creating a DID via CADOP using `VDRInterface.createViaCADOP()`.
- `OperationalKeyInfo`: Parameters for defining a new verification method (key).
- `ServiceInfo`: Parameters for defining a new service endpoint.
- `VerificationRelationship`: Type for DID verification relationships (e.g., 'authentication').
- `NIP1SignedObject`, `SignedData`, `NIP1Signature`: Types related to NIP-1 signatures.

(For full details, please consult the type definition files in the `src/` directory.)

### VDR Implementations (Example: `RoochVDR`)

`NuwaIdentityKit` uses VDRs that implement `VDRInterface` to interact with specific DID methods.

- **`RoochVDR`**: An implementation for `did:rooch` DIDs, interacting with the Rooch Network.
  - Constructor: `new RoochVDR(options: RoochVDROptions)` where `RoochVDROptions` can specify `rpcUrl`, `client`, etc.
  - Static factory: `RoochVDR.createDefault(network?: 'dev' | 'test' | 'main')` for quick setup.
  - Implements all `VDRInterface` methods like `create`, `resolve`, `createViaCADOP`, etc., for the Rooch blockchain.

(Other VDRs, like `KeyVDR` for `did:key`, are also available or can be custom-built by extending `AbstractVDR`.)

### Operation Options

Many methods in `NuwaIdentityKit` and `VDRInterface` that modify DID state (e.g., `addVerificationMethod`, `addService`) accept an `options` object. This object typically includes:

- `signer: SignerInterface`: An instance of a signer to authorize the operation.
- `keyId: string`: The ID of the key (within the DID document or an external controller) that the `signer` will use to sign the operation.
- VDR-specific options (e.g., `maxGas` for `RoochVDR`).

Refer to the specific method documentation or type definitions for details on required options.

## Testing

```bash
pnpm test                    # Run tests
pnpm run test:coverage      # Run with coverage
pnpm run test:watch         # Watch mode
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
