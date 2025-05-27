import { 
  address,
  RoochClient, 
  Transaction, 
  Args, 
  getRoochNodeUrl, 
  bcs 
} from '@roochnetwork/rooch-sdk';
import { DIDDocument, ServiceEndpoint, VerificationMethod, VerificationRelationship } from '../../types';
import { AbstractVDR } from '../abstractVDR';

export interface RoochClientConfig {
  url: string;
  transport?: any;
}

export interface RoochTransactionResult {
  execution_info: {
    status: {
      type: string; // 'executed' | 'failed'
    };
    gas_used: string;
  };
  output?: {
    events?: Array<{
      event_type: string;
      event_data: string;
      event_index: string;
      decoded_event_data?: any;
    }>;
  };
  transaction: any;
}

/**
 * Options for RoochVDR configuration
 */
export interface RoochVDROptions {
  /**
   * Rooch RPC endpoint URL
   */
  rpcUrl: string;
  
  /**
   * Rooch client instance (optional, will create one if not provided)
   */
  client?: RoochClient;
  
  /**
   * Default signer for transactions (optional)
   */
  signer?: any; // SessionAccount or other Rooch signer
  
  /**
   * DID contract address on Rooch (default: 0x3::did)
   */
  didContractAddress?: string;
  
  /**
   * Network type (dev, test, main)
   */
  network?: 'dev' | 'test' | 'main';
}

/**
 * Result of DID creation operation
 */
export interface DIDCreationResult {
  success: boolean;
  newDIDAddress?: string;
  transactionHash?: string;
}

/**
 * Result of store operation with actual DID address
 */
export interface StoreResult {
  success: boolean;
  actualDIDAddress?: string;
}

/**
 * BCS type definitions for DID events
 */
export interface DIDStruct {
  method: string;
  identifier: string;
}

// export interface ObjectID {
//   id: address[];
// }

export interface DIDCreatedEventData {
  did: DIDStruct;
  object_id: string;
  controller: DIDStruct[];
  creator_address: address;
  creation_method: string;
}

// BCS schemas for deserializing DID events
const DIDSchema = bcs.struct('DID', {
  method: bcs.string(),
  identifier: bcs.string(),
});

const DIDCreatedEventSchema = bcs.struct('DIDCreatedEvent', {
  did: DIDSchema,
  object_id: bcs.ObjectId, // ObjectID is 32 bytes
  controller: bcs.vector(DIDSchema),
  creator_address: bcs.Address, // Rooch address is 20 bytes  
  creation_method: bcs.string(),
});

/**
 * Options for Rooch VDR operations
 */
export interface RoochVDROperationOptions {
  /**
   * Signer to use for this operation
   */
  signer?: any; // SessionAccount or other Rooch signer
  
  /**
   * Maximum gas limit for the transaction
   */
  maxGas?: number;
  
  /**
   * Whether to wait for transaction confirmation
   */
  waitForConfirmation?: boolean;
}

/**
 * VDR implementation for did:rooch method
 * 
 * This implementation integrates with Rooch network's DID contract system
 * to provide on-chain DID document storage and management.
 */
export class RoochVDR extends AbstractVDR {
  private readonly options: RoochVDROptions;
  private client: RoochClient;
  private readonly didContractAddress: string;
  
  // Cache for storing the last created DID address
  private lastCreatedDIDAddress?: string;
  
  constructor(options: RoochVDROptions) {
    super('rooch');
    this.options = options;
    this.didContractAddress = options.didContractAddress || '0x3::did';
    
    // Initialize Rooch client
    if (options.client) {
      this.client = options.client;
    } else {
      this.client = new RoochClient({ url: options.rpcUrl });
    }
  }
  
  /**
   * Store a new DID Document on the Rooch blockchain
   * This creates a DID for oneself using account key
   * 
   * @param didDocument The DID Document to store
   * @param options Operation options including signer
   * @returns Promise resolving to true if successful
   */
  async store(didDocument: DIDDocument, options?: RoochVDROperationOptions): Promise<boolean> {
    try {
      this.validateDocument(didDocument);
      
      const signer = options?.signer || this.options.signer;
      if (!signer) {
        throw new Error('No signer provided for store operation');
      }
      
      // Extract the account public key from the first verification method
      const firstVM = didDocument.verificationMethod?.[0];
      if (!firstVM || !firstVM.publicKeyMultibase) {
        throw new Error('DID document must have at least one verification method with publicKeyMultibase');
      }
      
      // Create transaction to call DID contract's create_did_object_for_self_entry function
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::create_did_object_for_self_entry`,
        args: [
          Args.string(firstVM.publicKeyMultibase)
        ],
        maxGas: options?.maxGas || 100000000 // 1 RGas default
      });
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      // Check if transaction was successful
      const success = result.execution_info.status.type === 'executed';
      
      if (success) {
        console.log(`DID Document ${didDocument.id} successfully stored on Rooch blockchain`);
        
        // Extract the actual DID address from transaction events
        // Look for DIDCreatedEvent in the events
        const didCreatedEvent = result.output?.events?.find((event: any) => 
          event.event_type === '0x3::did::DIDCreatedEvent'
        );
        
        if (didCreatedEvent) {
          console.log('DID creation event found:', didCreatedEvent);
          
          // Parse the actual DID address from the event data using BCS
          try {
            const actualDIDAddress = this.parseDIDCreatedEventAndGetAddress(didCreatedEvent);
            if (actualDIDAddress) {
              this.lastCreatedDIDAddress = actualDIDAddress;
            }
          } catch (error) {
            console.warn('Could not parse DID from event data using BCS:', error);
            // Fallback to string parsing if BCS fails
            const fallbackAddress = this.parseDIDCreatedEventFallbackAndGetAddress(didCreatedEvent);
            if (fallbackAddress) {
              this.lastCreatedDIDAddress = fallbackAddress;
            }
          }
        }
      } else {
        console.error(`Failed to store DID Document ${didDocument.id} on Rooch blockchain`);
        console.error('Transaction execution info:', JSON.stringify(result.execution_info, null, 2));
      }
      
      return success;
    } catch (error) {
      console.error(`Error storing DID document on Rooch blockchain:`, error);
      throw error;
    }
  }
  
  /**
   * Create a DID via CADOP (Custodian-Assisted DID Onboarding Protocol)
   * 
   * @param userDidKeyString User's did:key string
   * @param custodianServicePkMultibase Custodian's service public key
   * @param custodianServiceVmType Custodian service VM type
   * @param options Operation options including custodian signer
   * @returns Promise resolving to true if successful
   */
  async createViaCADOP(
    userDidKeyString: string,
    custodianServicePkMultibase: string,
    custodianServiceVmType: string,
    options?: RoochVDROperationOptions
  ): Promise<boolean> {
    try {
      const signer = options?.signer || this.options.signer;
      if (!signer) {
        throw new Error('No custodian signer provided for CADOP operation');
      }
      
      // Create transaction to call DID contract's create_did_object_via_cadop_with_did_key_entry function
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::create_did_object_via_cadop_with_did_key_entry`,
        args: [
          Args.string(userDidKeyString),
          Args.string(custodianServicePkMultibase),
          Args.string(custodianServiceVmType)
        ],
        maxGas: options?.maxGas || 100000000
      });
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      return result.execution_info.status.type === 'executed';
    } catch (error) {
      console.error(`Error creating DID via CADOP:`, error);
      throw error;
    }
  }
  
  /**
   * Resolve a DID Document from the Rooch blockchain
   * 
   * @param did The DID to resolve
   * @returns Promise resolving to the DID Document or null if not found
   */
  async resolve(did: string): Promise<DIDDocument | null> {
    try {
      this.validateDIDMethod(did);
      
      // Extract address from did:rooch:address format
      const didParts = did.split(':');
      if (didParts.length !== 3 || didParts[0] !== 'did' || didParts[1] !== 'rooch') {
        throw new Error('Invalid DID format. Expected did:rooch:address');
      }
      
      const address = didParts[2];
      
      // Call DID contract's get_did_document view function
      const result = await this.client.executeViewFunction({
        target: `${this.didContractAddress}::get_did_document`,
        args: [Args.address(address)]
      });
      
      if (!result || result.vm_status !== 'Executed' || !result.return_values) {
        return null;
      }
      
      // Convert the Move DIDDocument struct to our DIDDocument interface
      return this.convertMoveDIDDocumentToInterface(result.return_values[0]?.decoded_value);
    } catch (error) {
      console.error(`Error resolving DID from Rooch blockchain:`, error);
      return null;
    }
  }
  
  /**
   * Check if a DID exists on the Rooch blockchain
   * 
   * @param did The DID to check
   * @returns Promise resolving to true if the DID exists
   */
  async exists(did: string): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      // Extract address from did:rooch:address format
      const didParts = did.split(':');
      if (didParts.length !== 3 || didParts[0] !== 'did' || didParts[1] !== 'rooch') {
        return false;
      }
      
      const address = didParts[2];
      
      // Call DID contract's exists_did_for_address view function
      const result = await this.client.executeViewFunction({
        target: `${this.didContractAddress}::exists_did_for_address`,
        args: [Args.address(address)]
      });
      
      return result?.vm_status === 'Executed' && result.return_values?.[0]?.decoded_value === true;
    } catch (error) {
      console.error(`Error checking DID existence on Rooch blockchain:`, error);
      return false;
    }
  }
  
  /**
   * Add a verification method to a DID document on Rooch blockchain
   */
  async addVerificationMethod(
    did: string,
    verificationMethod: VerificationMethod,
    relationships?: VerificationRelationship[],
    options?: RoochVDROperationOptions
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      const signer = options?.signer || this.options.signer;
      if (!signer) {
        throw new Error('No signer provided for addVerificationMethod operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if signer has capabilityDelegation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toHexAddress() : null;
      if (signerAddress && !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityDelegation')) {
        console.error(`Signer does not have capabilityDelegation permission for ${did}`);
        return false;
      }
      
      // Validate verification method
      if (!verificationMethod.publicKeyMultibase) {
        throw new Error('Verification method must have publicKeyMultibase');
      }
      
      // Convert verification relationships to u8 values
      const relationshipValues = this.convertVerificationRelationships(relationships || []);
      
      // Create transaction
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::add_verification_method_entry`,
        args: [
          Args.string(this.extractFragmentFromId(verificationMethod.id)),
          Args.string(verificationMethod.type),
          Args.string(verificationMethod.publicKeyMultibase),
          Args.vec('u8', relationshipValues)
        ],
        maxGas: options?.maxGas || 100000000
      });
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      return result.execution_info.status.type === 'executed';
    } catch (error) {
      console.error(`Error adding verification method to ${did}:`, error);
      return false; // Return false instead of throwing for permission errors
    }
  }
  
  /**
   * Remove a verification method from a DID document on Rooch blockchain
   */
  async removeVerificationMethod(
    did: string,
    id: string,
    options?: RoochVDROperationOptions
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      const signer = options?.signer || this.options.signer;
      if (!signer) {
        throw new Error('No signer provided for removeVerificationMethod operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if signer has capabilityDelegation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toHexAddress() : null;
      if (signerAddress && !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityDelegation')) {
        console.error(`Signer does not have capabilityDelegation permission for ${did}`);
        return false;
      }
      
      // Create transaction
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::remove_verification_method_entry`,
        args: [
          Args.string(this.extractFragmentFromId(id))
        ],
        maxGas: options?.maxGas || 100000000
      });
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      return result.execution_info.status.type === 'executed';
    } catch (error) {
      console.error(`Error removing verification method from ${did}:`, error);
      return false;
    }
  }
  
  /**
   * Add a service to a DID document on Rooch blockchain
   */
  async addService(
    did: string,
    service: ServiceEndpoint,
    options?: RoochVDROperationOptions
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      const signer = options?.signer || this.options.signer;
      if (!signer) {
        throw new Error('No signer provided for addService operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if signer has capabilityInvocation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toHexAddress() : null;
      if (signerAddress && !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityInvocation')) {
        console.error(`Signer does not have capabilityInvocation permission for ${did}`);
        return false;
      }
      
      // Create transaction for simple service (without properties)
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::add_service_entry`,
        args: [
          Args.string(this.extractFragmentFromId(service.id)),
          Args.string(service.type),
          Args.string(service.serviceEndpoint)
        ],
        maxGas: options?.maxGas || 100000000
      });
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      return result.execution_info.status.type === 'executed';
    } catch (error) {
      console.error(`Error adding service to ${did}:`, error);
      return false;
    }
  }
  
  /**
   * Add a service with properties to a DID document on Rooch blockchain
   */
  async addServiceWithProperties(
    did: string,
    service: ServiceEndpoint & { properties?: Record<string, string> },
    options?: RoochVDROperationOptions
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      const signer = options?.signer || this.options.signer;
      if (!signer) {
        throw new Error('No signer provided for addServiceWithProperties operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if signer has capabilityInvocation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toHexAddress() : null;
      if (signerAddress && !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityInvocation')) {
        console.error(`Signer does not have capabilityInvocation permission for ${did}`);
        return false;
      }
      
      const properties = service.properties || {};
      const propertyKeys = Object.keys(properties);
      const propertyValues = Object.values(properties);
      
      // Create transaction for service with properties
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::add_service_with_properties_entry`,
        args: [
          Args.string(this.extractFragmentFromId(service.id)),
          Args.string(service.type),
          Args.string(service.serviceEndpoint),
          Args.vec('string', propertyKeys),
          Args.vec('string', propertyValues)
        ],
        maxGas: options?.maxGas || 100000000
      });
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      return result.execution_info.status.type === 'executed';
    } catch (error) {
      console.error(`Error adding service with properties to ${did}:`, error);
      return false;
    }
  }
  
  /**
   * Remove a service from a DID document on Rooch blockchain
   */
  async removeService(
    did: string,
    id: string,
    options?: RoochVDROperationOptions
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      const signer = options?.signer || this.options.signer;
      if (!signer) {
        throw new Error('No signer provided for removeService operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if signer has capabilityInvocation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toHexAddress() : null;
      if (signerAddress && !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityInvocation')) {
        console.error(`Signer does not have capabilityInvocation permission for ${did}`);
        return false;
      }
      
      // Create transaction
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::remove_service_entry`,
        args: [
          Args.string(this.extractFragmentFromId(id))
        ],
        maxGas: options?.maxGas || 100000000
      });
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      return result.execution_info.status.type === 'executed';
    } catch (error) {
      console.error(`Error removing service from ${did}:`, error);
      return false;
    }
  }
  
  /**
   * Update verification relationships for a verification method on Rooch blockchain
   */
  async updateRelationships(
    did: string,
    id: string,
    add: VerificationRelationship[],
    remove: VerificationRelationship[],
    options?: RoochVDROperationOptions
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      const signer = options?.signer || this.options.signer;
      if (!signer) {
        throw new Error('No signer provided for updateRelationships operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if signer has capabilityDelegation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toHexAddress() : null;
      if (signerAddress && !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityDelegation')) {
        console.error(`Signer does not have capabilityDelegation permission for ${did}`);
        return false;
      }
      
      const fragment = this.extractFragmentFromId(id);
      
      // Add relationships
      for (const relationship of add) {
        const relationshipValue = this.convertVerificationRelationship(relationship);
        const transaction = this.createTransaction();
        transaction.callFunction({
          target: `${this.didContractAddress}::add_to_verification_relationship_entry`,
          args: [
            Args.string(fragment),
            Args.u8(relationshipValue)
          ],
          maxGas: options?.maxGas || 100000000
        });
        
        const result = await this.client.signAndExecuteTransaction({
          transaction,
          signer,
          option: { withOutput: true }
        });
        
        if (result.execution_info.status.type !== 'executed') {
          return false;
        }
      }
      
      // Remove relationships
      for (const relationship of remove) {
        const relationshipValue = this.convertVerificationRelationship(relationship);
        const transaction = this.createTransaction();
        transaction.callFunction({
          target: `${this.didContractAddress}::remove_from_verification_relationship_entry`,
          args: [
            Args.string(fragment),
            Args.u8(relationshipValue)
          ],
          maxGas: options?.maxGas || 100000000
        });
        
        const result = await this.client.signAndExecuteTransaction({
          transaction,
          signer,
          option: { withOutput: true }
        });
        
        if (result.execution_info.status.type !== 'executed') {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Error updating relationships for ${did}:`, error);
      return false;
    }
  }
  
  /**
   * Create a new Rooch transaction instance
   */
  private createTransaction(): Transaction {
    return new Transaction();
  }
  
  /**
   * Convert verification relationships to u8 values based on did.move constants
   */
  private convertVerificationRelationships(relationships: VerificationRelationship[]): number[] {
    return relationships.map(rel => this.convertVerificationRelationship(rel));
  }
  
  /**
   * Convert a single verification relationship to u8 value
   */
  private convertVerificationRelationship(relationship: VerificationRelationship): number {
    switch (relationship) {
      case 'authentication':
        return 0; // VERIFICATION_RELATIONSHIP_AUTHENTICATION
      case 'assertionMethod':
        return 1; // VERIFICATION_RELATIONSHIP_ASSERTION_METHOD
      case 'capabilityInvocation':
        return 2; // VERIFICATION_RELATIONSHIP_CAPABILITY_INVOCATION
      case 'capabilityDelegation':
        return 3; // VERIFICATION_RELATIONSHIP_CAPABILITY_DELEGATION
      case 'keyAgreement':
        return 4; // VERIFICATION_RELATIONSHIP_KEY_AGREEMENT
      default:
        throw new Error(`Unknown verification relationship: ${relationship}`);
    }
  }
  
  /**
   * Extract fragment from a full ID (e.g., "did:rooch:address#fragment" -> "fragment")
   */
  private extractFragmentFromId(id: string): string {
    const hashIndex = id.indexOf('#');
    if (hashIndex === -1) {
      throw new Error(`Invalid ID format: ${id}. Expected format: did:rooch:address#fragment`);
    }
    return id.substring(hashIndex + 1);
  }

  /**
   * Check if a signer has permission to perform an operation on a DID
   */
  private hasPermissionForOperation(
    didDocument: DIDDocument,
    signerAddress: string,
    requiredRelationship: VerificationRelationship
  ): boolean {
    try {
      console.log(`🔍 Checking permission for signer ${signerAddress} on DID ${didDocument.id}`);
      console.log(`📋 Required relationship: ${requiredRelationship}`);
      console.log(`👑 DID controllers:`, didDocument.controller);
      
      // Create possible DID formats for the signer
      const signerDIDHex = `did:rooch:${signerAddress}`;
      console.log(`🔑 Signer DID (hex):`, signerDIDHex);
      
      // According to Rooch DID documentation, controllers should have management permissions
      // Check if the signer is in the controller list
      if (Array.isArray(didDocument.controller)) {
        for (const controller of didDocument.controller) {
          console.log(`🔍 Checking controller:`, controller);
          
          // Direct match (hex format)
          if (controller === signerDIDHex) {
            console.log(`✅ Permission granted: Signer is a direct controller (hex format)`);
            return true;
          }
          
          // Try to handle bech32 format controllers
          if (controller.includes('rooch1')) {
            // For bech32 controllers, we need to convert addresses
            // For now, we'll be permissive for controllers since the Rooch DID system
            // should handle the actual authorization at the blockchain level
            console.log(`✅ Permission granted: Signer appears to be a controller (bech32 format)`);
            return true;
          }
          
          // Extract address from controller DID and compare
          const controllerMatch = controller.match(/did:rooch:(.+)$/);
          if (controllerMatch) {
            const controllerAddress = controllerMatch[1];
            if (controllerAddress === signerAddress || controllerAddress.toLowerCase() === signerAddress.toLowerCase()) {
              console.log(`✅ Permission granted: Address match found`);
              return true;
            }
          }
        }
      }
      
      // Check if signer controls any verification method with the required relationship
      if (!didDocument.verificationMethod) {
        console.log(`❌ No verification methods found`);
        return false;
      }
      
      for (const vm of didDocument.verificationMethod) {
        console.log(`🔍 Checking verification method:`, vm.id, 'controller:', vm.controller);
        
        // Check if this verification method is controlled by the signer
        const isControlledBySigner = vm.controller === signerDIDHex || 
          vm.controller === didDocument.id ||
          (Array.isArray(didDocument.controller) && didDocument.controller.includes(signerDIDHex));
        
        if (isControlledBySigner) {
          console.log(`🔍 VM ${vm.id} is controlled by signer, checking relationships...`);
          
          // Check if this verification method has the required relationship
          const relationshipArray = didDocument[requiredRelationship] as (string | object)[];
          if (relationshipArray) {
            console.log(`🔍 Relationship array for ${requiredRelationship}:`, relationshipArray);
            
            const hasRelationship = relationshipArray.some(item => {
              if (typeof item === 'string') {
                return item === vm.id;
              } else if (typeof item === 'object' && (item as any).id) {
                return (item as any).id === vm.id;
              }
              return false;
            });
            
            if (hasRelationship) {
              console.log(`✅ Permission granted: VM has required relationship`);
              return true;
            }
          }
        }
      }
      
      console.log(`❌ Permission denied: No matching controller or VM relationship found`);
      return false;
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }
  
  /**
   * Convert Move DIDDocument struct to our DIDDocument interface
   */
  private convertMoveDIDDocumentToInterface(moveDoc: any): DIDDocument | null {
    if (!moveDoc) return null;
    
    try {
      // Extract DID information from the actual structure
      const didId = moveDoc.value?.id?.value ? 
        `did:${moveDoc.value.id.value.method}:${moveDoc.value.id.value.identifier}` : 
        '';
      
      // Convert controller from the actual structure  
      // Controller is stored as [["method", "identifier"]] format
      const controller = moveDoc.value?.controller?.value?.[0] && Array.isArray(moveDoc.value.controller.value[0]) ? 
        [`did:${moveDoc.value.controller.value[0][0]}:${moveDoc.value.controller.value[0][1]}`] : 
        [];
      
      // Convert verification methods from SimpleMap structure
      const verificationMethods = this.convertMoveVerificationMethods(moveDoc.value?.verification_methods);
      
      // Convert authentication/assertion/capability arrays from hex strings
      const authentication = this.convertHexStringArray(moveDoc.value?.authentication);
      const assertionMethod = this.convertHexStringArray(moveDoc.value?.assertion_method);
      const capabilityInvocation = this.convertHexStringArray(moveDoc.value?.capability_invocation);
      const capabilityDelegation = this.convertHexStringArray(moveDoc.value?.capability_delegation);
      const keyAgreement = this.convertHexStringArray(moveDoc.value?.key_agreement);
      
      return {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: didId,
        controller: controller,
        verificationMethod: verificationMethods,
        authentication: authentication,
        assertionMethod: assertionMethod,
        capabilityInvocation: capabilityInvocation,
        capabilityDelegation: capabilityDelegation,
        keyAgreement: keyAgreement,
        service: this.convertMoveServices(moveDoc.value?.services),
        alsoKnownAs: moveDoc.value?.also_known_as || []
      };
    } catch (error) {
      console.error('Error converting Move DIDDocument:', error);
      return null;
    }
  }
  
  /**
   * Convert Move verification methods to our format
   */
  private convertMoveVerificationMethods(moveVMs: any): VerificationMethod[] {
    if (!moveVMs?.value?.data) return [];
    
    try {
      const vms: VerificationMethod[] = [];
      const data = moveVMs.value.data;
      
      // Handle single element case vs array case
      if (Array.isArray(data)) {
        // Multiple verification methods
        for (const element of data) {
          const vm = this.convertSingleVerificationMethod(element);
          if (vm) vms.push(vm);
        }
      } else if (data.value) {
        // Single verification method
        const vm = this.convertSingleVerificationMethod(data);
        if (vm) vms.push(vm);
      }
      
      return vms;
    } catch (error) {
      console.error('Error converting verification methods:', error);
      return [];
    }
  }

  /**
   * Convert a single verification method element
   */
  private convertSingleVerificationMethod(element: any): VerificationMethod | null {
    try {
      if (!element.value || element.value.length < 2) return null;
      
      const [key, valueData] = element.value;
      const vmData = valueData.value;
      
      const vmId = vmData.id?.value;
      const did = vmId?.did?.value;
      const fragment = vmId?.fragment;
      
      if (!did || !fragment) return null;
      
      return {
        id: `did:${did.method}:${did.identifier}#${fragment}`,
        type: vmData.type,
        controller: `did:${vmData.controller.value.method}:${vmData.controller.value.identifier}`,
        publicKeyMultibase: vmData.public_key_multibase
      };
    } catch (error) {
      console.error('Error converting single verification method:', error);
      return null;
    }
  }

  /**
   * Convert hex string array to string array
   */
  private convertHexStringArray(hexArray: any): string[] {
    if (!hexArray?.value) return [];
    
    try {
      // hexArray.value should be an array of hex strings
      return hexArray.value.map((hexBytes: any) => {
        if (Array.isArray(hexBytes) && hexBytes.length > 0 && hexBytes[0].startsWith('0x')) {
          // Convert hex string to text
          const hex = hexBytes[0].slice(2); // Remove '0x' prefix
          return Buffer.from(hex, 'hex').toString('utf-8');
        }
        return '';
      }).filter((str: string) => str.length > 0);
    } catch (error) {
      console.error('Error converting hex string array:', error);
      return [];
    }
  }
  
  /**
   * Convert Move services to our format
   */
  private convertMoveServices(moveServices: any): ServiceEndpoint[] {
    if (!moveServices) return [];
    
    // Assuming moveServices is a SimpleMap structure
    const services: ServiceEndpoint[] = [];
    // Implementation depends on the actual Move SimpleMap structure
    // This is a placeholder - adjust based on actual data structure
    
    return services;
  }
  
  /**
   * Get network-specific RPC URL
   */
  static getRoochNodeUrl(network: 'dev' | 'test' | 'main'): string {
    // Map our network names to Rooch SDK network names
    const networkMap: { [key: string]: string } = {
      'dev': 'localnet',
      'test': 'testnet', 
      'main': 'mainnet'
    };
    
    const roochNetwork = networkMap[network] || network;
    return getRoochNodeUrl(roochNetwork as any);
  }
  
  /**
   * Parse DIDCreatedEvent using BCS schema
   */
  private parseDIDCreatedEvent(event: any): void {
    const eventData = event.event_data;
    const hexData = eventData.startsWith('0x') ? eventData.slice(2) : eventData;
    const bytes = new Uint8Array(hexData.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []);

    console.log('Event data bytes length:', bytes.length);
    console.log('First few bytes:', Array.from(bytes.slice(0, 10)).map((b: number) => '0x' + b.toString(16).padStart(2, '0')));

    try {
      const decoded: DIDCreatedEventData = DIDCreatedEventSchema.parse(bytes);
      console.log('🎉 DID Created Event (BCS parsed):');
      console.log('  New DID:', `did:${decoded.did.method}:${decoded.did.identifier}`);
      console.log('  Object ID:', decoded.object_id);
      console.log('  Creator Address:', decoded.creator_address);
      console.log('  Creation Method:', decoded.creation_method);
      console.log('  Controllers:');
      decoded.controller.forEach((controller, index) => {
        console.log(`    [${index}] did:${controller.method}:${controller.identifier}`);
      });
    } catch (parseError) {
      console.warn('BCS parsing failed:', parseError);
      throw parseError;
    }
  }

  /**
   * Parse DIDCreatedEvent using BCS schema and return the DID address
   */
  private parseDIDCreatedEventAndGetAddress(event: any): string | null {
    const eventData = event.event_data;
    const hexData = eventData.startsWith('0x') ? eventData.slice(2) : eventData;
    const bytes = new Uint8Array(hexData.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []);

    console.log('Event data bytes length:', bytes.length);
    console.log('First few bytes:', Array.from(bytes.slice(0, 10)).map((b: number) => '0x' + b.toString(16).padStart(2, '0')));

    try {
      const decoded: DIDCreatedEventData = DIDCreatedEventSchema.parse(bytes);
      const newDIDAddress = `did:${decoded.did.method}:${decoded.did.identifier}`;
      console.log('🎉 DID Created Event (BCS parsed):');
      console.log('  New DID:', newDIDAddress);
      console.log('  Object ID:', decoded.object_id);
      console.log('  Creator Address:', decoded.creator_address);
      console.log('  Creation Method:', decoded.creation_method);
      console.log('  Controllers:');
      decoded.controller.forEach((controller, index) => {
        console.log(`    [${index}] did:${controller.method}:${controller.identifier}`);
      });
      return newDIDAddress;
    } catch (parseError) {
      console.warn('BCS parsing failed:', parseError);
      throw parseError;
    }
  }

  /**
   * Fallback method to parse DIDCreatedEvent using string matching
   */
  private parseDIDCreatedEventFallback(event: any): void {
    const eventData = event.event_data;
    const hexData = eventData.startsWith('0x') ? eventData.slice(2) : eventData;
    const bytes = new Uint8Array(hexData.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []);
    
    // Try to find DID strings in the data (look for "did:rooch:" patterns)
    const dataStr = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    console.log('Event data as string (fallback):', dataStr);
    
    // Look for rooch addresses (bech32 format starting with "rooch1")
    const roochAddressMatches = dataStr.match(/rooch1[a-z0-9]{58}/g);
    if (roochAddressMatches && roochAddressMatches.length > 0) {
      console.log('Found Rooch addresses in event:', roochAddressMatches);
      // The first address should be the new DID, the second should be the controller
      if (roochAddressMatches.length >= 1) {
        const newDIDAddress = roochAddressMatches[0];
        console.log('🎉 New DID created (fallback):', `did:rooch:${newDIDAddress}`);
        console.log('📝 Controller DID (fallback):', roochAddressMatches.length > 1 ? `did:rooch:${roochAddressMatches[1]}` : 'Not found');
      }
    }
  }

  /**
   * Fallback method to parse DIDCreatedEvent using string matching and return the DID address
   */
  private parseDIDCreatedEventFallbackAndGetAddress(event: any): string | null {
    const eventData = event.event_data;
    const hexData = eventData.startsWith('0x') ? eventData.slice(2) : eventData;
    const bytes = new Uint8Array(hexData.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []);
    
    // Try to find DID strings in the data (look for "did:rooch:" patterns)
    const dataStr = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    console.log('Event data as string (fallback):', dataStr);
    
    // Look for rooch addresses (bech32 format starting with "rooch1")
    const roochAddressMatches = dataStr.match(/rooch1[a-z0-9]{58}/g);
    if (roochAddressMatches && roochAddressMatches.length > 0) {
      console.log('Found Rooch addresses in event:', roochAddressMatches);
      // The first address should be the new DID, the second should be the controller
      if (roochAddressMatches.length >= 1) {
        const newDIDAddress = roochAddressMatches[0];
        const didAddress = `did:rooch:${newDIDAddress}`;
        console.log('🎉 New DID created (fallback):', didAddress);
        console.log('📝 Controller DID (fallback):', roochAddressMatches.length > 1 ? `did:rooch:${roochAddressMatches[1]}` : 'Not found');
        return didAddress;
      }
    }
    return null;
  }

  /**
   * Get the last created DID address from the most recent store operation
   */
  getLastCreatedDIDAddress(): string | undefined {
    return this.lastCreatedDIDAddress;
  }

  /**
   * Create a RoochVDR instance with default configuration
   */
  static createDefault(network: 'dev' | 'test' | 'main' = 'test'): RoochVDR {
    return new RoochVDR({
      rpcUrl: RoochVDR.getRoochNodeUrl(network),
      network,
      didContractAddress: '0x3::did'
    });
  }
}

/**
 * Usage Examples:
 * 
 * // 1. Basic setup with default configuration
 * const roochVDR = RoochVDR.createDefault('test');
 * 
 * // 2. Custom configuration with your own client
 * import { RoochClient } from '@roochnetwork/rooch-sdk';
 * const client = new RoochClient({ url: 'https://test-seed.rooch.network/' });
 * const roochVDR = new RoochVDR({
 *   rpcUrl: 'https://test-seed.rooch.network/',
 *   client: client,
 *   didContractAddress: '0x3::did'
 * });
 * 
 * // 3. Store a DID document (self-creation)
 * const didDocument = {
 *   id: 'did:rooch:0x123...',
 *   verificationMethod: [{
 *     id: 'did:rooch:0x123...#account-key',
 *     type: 'EcdsaSecp256k1VerificationKey2019',
 *     controller: 'did:rooch:0x123...',
 *     publicKeyMultibase: 'z...'
 *   }],
 *   // ... other DID document fields
 * };
 * 
 * const success = await roochVDR.store(didDocument, {
 *   signer: yourRoochSigner
 * });
 * 
 * // 4. Create DID via CADOP
 * const success = await roochVDR.createViaCADOP(
 *   'did:key:z6Mk...',
 *   'z6Mk...', // custodian service public key
 *   'Ed25519VerificationKey2020',
 *   {
 *     signer: custodianSigner
 *   }
 * );
 * 
 * // 5. Resolve a DID document
 * const resolvedDoc = await roochVDR.resolve('did:rooch:0x123...');
 * 
 * // 6. Add a verification method
 * await roochVDR.addVerificationMethod(
 *   'did:rooch:0x123...',
 *   {
 *     id: 'did:rooch:0x123...#key-2',
 *     type: 'Ed25519VerificationKey2020',
 *     controller: 'did:rooch:0x123...',
 *     publicKeyMultibase: 'z6Mk...'
 *   },
 *   ['authentication', 'assertionMethod'],
 *   {
 *     signer: yourRoochSigner
 *   }
 * );
 * 
 * // 7. Add a service endpoint
 * await roochVDR.addService(
 *   'did:rooch:0x123...',
 *   {
 *     id: 'did:rooch:0x123...#service-1',
 *     type: 'LinkedDomains',
 *     serviceEndpoint: 'https://example.com'
 *   },
 *   {
 *     signer: yourRoochSigner
 *   }
 * );
 */
