# VDR Implementations

This directory contains specialized VDR implementations for various DID methods.

## Solution for Rooch DIDAccount Signature Issue

In the Rooch DID system, all on-chain operations (such as adding/removing verification methods or services) must be authorized by the DID's associated smart contract account. The controller(s) listed in the DID document do not have direct authority to perform these on-chain actions for the DID document itself. The solution and key points are as follows:

- **Authorization by DID's Associated Account**: On-chain modifications to a DID Document (e.g., `addVerificationMethod`, `addService`) must be authorized by the DID's own associated smart contract account (identified by `did:rooch:<account_address>`). For a transaction to be authorized, it must be signed using a private key whose corresponding public key is registered as an `authentication` verification method in the DID Document. This key then acts as a `session_key` for that specific transaction.
- **Permission Check**: The implementation's `hasPermissionForOperation` method effectively checks if the signer (authorized via the session_key mechanism) has the required capabilities (e.g., `capabilityDelegation` for key management) associated with the DID's account.
- **Debugging Advice**: If you encounter permission errors, first verify that the transaction is signed with a key that is part of the DID's `authentication` relationship and has the necessary permissions (e.g. `capabilityDelegation`). It is recommended to enable debug mode (`debug: true` in the RoochVDR constructor) during development and debugging to output detailed logs.
- **SessionKey Mechanism**: The authorization relies on Rooch's `session_key` system. An `authentication` verification method's public key is used to derive a `session_key` that grants temporary, scoped permissions for the DID's associated account to act.

> Summary: In the Rooch DID system, the authority to perform on-chain modifications to a DID Document rests with its associated smart contract account. This authority is exercised when a transaction is signed by a key listed in the DID's `authentication` verification methods (which then acts as a `session_key`). Controllers, as defined in the DID Document, serve roles like off-chain governance or specific delegated capabilities but do not grant direct permissions to sign for on-chain DID Document mutations.

## Adding a New VDR Implementation

To create a new VDR implementation:

1. Create a new file named `[method]VDR.ts` (e.g., `roochVDR.ts`)
2. Extend the `AbstractVDR` class and implement the required methods
3. Register your VDR in the factory methods in `../index.ts`

## Implementation Guidelines

When implementing a new VDR, please follow these guidelines:

1. The `store` method is ONLY for the initial creation of a DID document. Document this clearly.
2. Use specific update methods for all modifications after initial creation:
   - `addVerificationMethod` - For adding a new key
   - `removeVerificationMethod` - For removing an existing key
   - `addService` - For adding a service endpoint
   - `removeService` - For removing a service endpoint
   - `updateRelationships` - For adding/removing verification relationships
   - `updateController` - For changing the controller

3. Enforce appropriate permission checks as defined in NIP-1:
   - Key operations (adding/removing verification methods) require `capabilityDelegation` permission
   - Service operations require `capabilityInvocation` permission
   - Use the `validateKeyPermission` helper method in `AbstractVDR`

## Template for a New VDR Implementation

```typescript
import { DIDDocument, ServiceEndpoint, VerificationMethod, VerificationRelationship } from '../../types';
import { AbstractVDR } from '../abstractVDR';

export interface YourVDROptions {
  // Custom options for your VDR implementation
}

export class YourVDR extends AbstractVDR {
  private readonly options: YourVDROptions;
  
  constructor(options: YourVDROptions = {}) {
    super('your-method');
    this.options = options;
  }
  
  /**
   * Store a new DID Document using your method
   * 
   * Note: This method should ONLY be used for the initial creation of a DID document.
   * For updates, use the specific methods like addVerificationMethod, etc.
   */
  async store(didDocument: DIDDocument, options?: any): Promise<boolean> {
    try {
      // 1. Validate the document
      this.validateDocument(didDocument);
      
      // 2. Check if document already exists - reject if it does
      const exists = await this.exists(didDocument.id);
      if (exists) {
        throw new Error(`DID document ${didDocument.id} already exists. Use specific update methods instead of store() for updates.`);
      }
      
      // 3. Implementation-specific code to store the document
      
      return true;
    } catch (error) {
      console.error(`Error storing document:`, error);
      throw error;
    }
  }
  
  /**
   * Resolve a DID to its corresponding DID document
   */
  async resolve(did: string): Promise<DIDDocument | null> {
    try {
      this.validateDIDMethod(did);
      
      // Implementation for resolving a DID with your method
      return null; // Return the document or null if not found
    } catch (error) {
      console.error(`Error resolving ${did}:`, error);
      return null;
    }
  }
  
  /**
   * Add a verification method to a DID document
   * Remember to check permissions (capabilityDelegation)
   */
  async addVerificationMethod(
    did: string,
    verificationMethod: VerificationMethod,
    relationships?: VerificationRelationship[],
    options?: any
  ): Promise<boolean> {
    try {
      // 1. Validate inputs
      if (!options?.keyId) {
        throw new Error('Key ID required for addVerificationMethod operation');
      }
      
      // 2. Get current document
      const document = await this.resolve(did);
      if (!document) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // 3. Check permission - key must have capabilityDelegation
      if (!this.validateKeyPermission(document, options.keyId, 'capabilityDelegation')) {
        throw new Error(`Key ${options.keyId} does not have capabilityDelegation permission`);
      }
      
      // 4. Create a mutable copy
      const updatedDoc = JSON.parse(JSON.stringify(document));
      
      // 5. Validate the verification method
      if (!verificationMethod.id.startsWith(did)) {
        throw new Error(`Verification method ID ${verificationMethod.id} must start with DID ${did}`);
      }
      
      // 6. Add to document
      if (!updatedDoc.verificationMethod) {
        updatedDoc.verificationMethod = [];
      }
      
      if (updatedDoc.verificationMethod.some(vm => vm.id === verificationMethod.id)) {
        throw new Error(`Verification method ${verificationMethod.id} already exists`);
      }
      
      updatedDoc.verificationMethod.push(verificationMethod);
      
      // 7. Add to relationships
      if (relationships && relationships.length > 0) {
        relationships.forEach(rel => {
          if (!updatedDoc[rel]) {
            updatedDoc[rel] = [];
          }
          (updatedDoc[rel] as string[]).push(verificationMethod.id);
        });
      }
      
      // 8. Implementation-specific code to update the document
      
      return true;
    } catch (error) {
      console.error(`Error adding verification method to ${did}:`, error);
      throw error;
    }
  }
  
  /**
   * Remove a verification method from a DID document
   */
  async removeVerificationMethod(
    did: string,
    id: string,
    options?: any
  ): Promise<boolean> {
    try {
      // 1. Validate inputs
      if (!options?.keyId) {
        throw new Error('Key ID required for removeVerificationMethod operation');
      }
      
      // 2. Get current document
      const document = await this.resolve(did);
      if (!document) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // 3. Check permission - key must have capabilityDelegation
      if (!this.validateKeyPermission(document, options.keyId, 'capabilityDelegation')) {
        throw new Error(`Key ${options.keyId} does not have capabilityDelegation permission`);
      }
      
      // 4. Create a mutable copy
      const updatedDoc = JSON.parse(JSON.stringify(document));
      
      // 5. Validate key exists
      if (!updatedDoc.verificationMethod?.some(vm => vm.id === id)) {
        throw new Error(`Verification method ${id} not found`);
      }
      
      // 6. Check edge cases
      if (updatedDoc.verificationMethod.length === 1) {
        throw new Error(`Cannot remove the last verification method`);
      }
      
      if (id === options.keyId) {
        throw new Error(`Cannot remove the key being used for signing`);
      }
      
      // 7. Remove from document
      updatedDoc.verificationMethod = updatedDoc.verificationMethod.filter(vm => vm.id !== id);
      
      // 8. Remove from relationships
      const relationships: VerificationRelationship[] = 
        ['authentication', 'assertionMethod', 'keyAgreement', 'capabilityInvocation', 'capabilityDelegation'];
        
      relationships.forEach(rel => {
        if (updatedDoc[rel]) {
          updatedDoc[rel] = (updatedDoc[rel] as any[]).filter(item => {
            if (typeof item === 'string') return item !== id;
            if (typeof item === 'object' && item.id) return item.id !== id;
            return true;
          });
        }
      });
      
      // 9. Implementation-specific code to update the document
      
      return true;
    } catch (error) {
      console.error(`Error removing verification method from ${did}:`, error);
      throw error;
    }
  }
  
  // Implement other update methods following this pattern...
  
  async exists(did: string): Promise<boolean> {
    try {
      const doc = await this.resolve(did);
      return doc !== null;
    } catch (error) {
      return false;
    }
  }
}
```

## Implementation Checklist

When implementing a VDR, ensure that:

1. ✓ Your VDR extends the `AbstractVDR` class
2. ✓ `store()` method is limited to initial document creation only
3. ✓ `store()` method checks if the document already exists and rejects updates
4. ✓ All update methods have proper permission checking:
   - Key operations require `capabilityDelegation` permission
   - Service operations require `capabilityInvocation` permission
   - Controller updates require current controller permission
5. ✓ All methods handle edge cases:
   - Can't remove the last verification method
   - Can't remove the key being used for signing
   - Can't reuse verification method or service IDs
6. ✓ Input validation is comprehensive:
   - Verification method IDs and service IDs must start with the DID
   - Required fields are present
7. ✓ Error handling includes descriptive messages
8. ✓ Mutate-publish pattern is followed

## Best Practices for VDR Implementations

1. **Cache Resolved Documents When Appropriate**:
   - Consider implementing an in-memory or persistent cache for resolved documents
   - Example: `KeyVDR` uses `documentCache` to avoid regenerating documents

2. **Provide Clear Error Messages**:
   - Error messages should be descriptive and helpful for debugging
   - Include the DID, key ID, or operation in error messages

3. **Validate Documents Before Storing**:
   - Always validate the document structure before storing
   - Use `validateDocument()` from AbstractVDR

4. **Handle Edge Cases Gracefully**:
   - Non-existent DIDs should return null from resolve() rather than throwing
   - Document not found errors should be thrown by update methods
   - Invalid operations should throw clear errors (e.g., removing last key)

5. **Follow the Mutate-Publish Pattern**:
   - Get the current document
   - Validate permissions and inputs
   - Create a mutable copy
   - Make changes to the copy
   - Publish the updated document

6. **Use Helper Methods from AbstractVDR**:
   - `validateDIDMethod()` - Ensures the DID matches your method
   - `validateDocument()` - Validates document structure
   - `validateKeyPermission()` - Checks key permissions
   - `hasVerificationRelationship()` - Checks if a key has a relationship

7. **Document Method Limitations and Requirements**:
   - Clearly document any method-specific limitations
   - Document required options for each method
   - Include examples for method-specific features

8. **Follow TypeScript Best Practices**:
   - Use proper typing for parameters and return values
   - Document parameters and return types
   - Handle null and undefined values properly
   - Use optional parameters appropriately
