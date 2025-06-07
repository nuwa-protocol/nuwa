import { 
  RoochClient, 
  Transaction, 
  Args, 
  getRoochNodeUrl as sdkGetRoochNodeUrl, 
  Signer,
  RoochAddress,
  SignatureScheme,
  Keypair,
  PublicKey,
  Address,
  Bytes,
  Authenticator,
  BitcoinAddress,
  ObjectStateView,
} from '@roochnetwork/rooch-sdk';
import { DIDDocument, ServiceEndpoint, VerificationMethod, VerificationRelationship, DIDCreationRequest, DIDCreationResult, CADOPCreationRequest, SignerInterface } from '../types';
import { AbstractVDR } from './abstractVDR';
import {
  convertMoveDIDDocumentToInterface,
  formatDIDString,
  getDIDAddressFromEvent,
  parseDIDCreatedEvent,
  resolveDidObjectID,
} from './roochVDRTypes';

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
   * Network type (dev, test, main)
   */
  network?: 'dev' | 'test' | 'main';

  /**
   * Enable debug mode for detailed logging
   */
  debug?: boolean;
}

/**
 * Result of store operation with actual DID address
 */
export interface StoreResult {
  success: boolean;
  actualDIDAddress?: string;
}

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
 * Represents a signer for a Rooch DID's associated smart contract account.
 *
 * The `DIDAccount` class implements the Rooch `Signer` interface. It is initialized
 * with a DID string (e.g., "did:rooch:0x...") and a `Keypair`. This `Keypair`
 * corresponds to a specific verification method within the DID Document,
 * typically one with an 'authentication' relationship.
 *
 * When this `DIDAccount` signs a transaction, the provided `Keypair` is used.
 * In the context of the Rooch DID system, this signature, when validated against
 * an `authentication` verification method, allows the transaction to be authorized
 * by the DID's associated smart contract account (via the session key mechanism).
 *
 * The `didAddress` (a `RoochAddress`) derived from the input DID string represents
 * the actual on-chain smart contract account associated with the DID.
 */
export class DIDAccount extends Signer implements SignerInterface {
  private did: string;
  private kp: Keypair;
  private didAddress: RoochAddress;
  private keyId: string;
  constructor(did: string, kp: Keypair) {
    super();
    // parse the identifier from the did
    const didParts = did.split(':');
    if (didParts.length !== 3 || didParts[0] !== 'did' || didParts[1] !== 'rooch') {
      throw new Error('Invalid DID format. Expected did:rooch:address');
    }
    this.did = did;
    this.kp = kp;
    this.keyId = `${did}#account-key`;
    this.didAddress = new RoochAddress(didParts[2]);
  }

  getRoochAddress(): RoochAddress {
    return this.didAddress
  }
  
  sign(input: Bytes): Promise<Bytes>{
    return this.kp.sign(input);
  }
  
  signTransaction(input: Transaction): Promise<Authenticator>{
    return Authenticator.rooch(input.hashData(), this);
  }
  
  getKeyScheme(): SignatureScheme{
    return this.kp.getKeyScheme();
  }

  getPublicKey(): PublicKey<Address>{
    return this.kp.getPublicKey();
  }

  getBitcoinAddress(): BitcoinAddress{
    throw new Error('Bitcoin address is not supported for DID account');
  }

  getDid(): string{
    return this.did;
  }

  getDidAddress(): RoochAddress{
    return this.didAddress;
  }

  signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    if (keyId !== this.keyId) {
      throw new Error(`Key ID mismatch. Expected ${this.keyId}, got ${keyId}`);
    }
    return this.sign(data);
  }

  canSignWithKeyId(keyId: string): Promise<boolean> {
    return Promise.resolve(keyId === this.keyId);
  }
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
  private readonly debug: boolean;
  
  // Cache for storing the last created DID address
  private lastCreatedDIDAddress?: string;
  
  constructor(options: RoochVDROptions) {
    super('rooch');
    this.options = options;
    this.didContractAddress = '0x3::did';
    this.debug = options.debug || false;
    
    // Initialize Rooch client
    this.client = new RoochClient({ url: options.rpcUrl });
  }
  
  /**
   * Log message if debug mode is enabled
   */
  private debugLog(message: string, data?: any) {
    if (this.debug) {
      if (data) {
        console.log(`[RoochVDR Debug] ${message}`, data);
      } else {
        console.log(`[RoochVDR Debug] ${message}`);
      }
    }
  }

  /**
   * Log error message (always logged regardless of debug mode)
   */
  private errorLog(message: string, error?: any) {
    if (error) {
      console.error(`[RoochVDR Error] ${message}`, error);
    } else {
      console.error(`[RoochVDR Error] ${message}`);
    }
  }
  
  /**
   * Override create method to support Rooch dynamic DID generation
   */
  async create(request: DIDCreationRequest, options?: RoochVDROperationOptions): Promise<DIDCreationResult> {
    try {
      const signer = options?.signer;
      if (!signer) {
        throw new Error('No signer provided for create operation');
      }
      
      this.debugLog('Creating DID with request:', request);
      
      // Create transaction
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::create_did_object_for_self_entry`,
        args: [Args.string(request.publicKeyMultibase)],
        maxGas: options?.maxGas || 100000000
      });

      this.debugLog('Creating DID Transaction:', transaction)
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      const success = result.execution_info.status.type === 'executed';
      
      if (!success) {
        // Return preferredDID or generate a failure placeholder on failure
        return {
          success: false,
          error: 'Transaction execution failed, execution_info: ' + JSON.stringify(result.execution_info),
          debug: {
            requestedDID: request.preferredDID,
            transactionResult: result.execution_info
          }
        };
      }
      
      // Parse the actual created DID
      const didCreatedEvent = result.output?.events?.find((event: any) => 
        event.event_type === '0x3::did::DIDCreatedEvent'
      );
      let actualDID = this.parseDIDCreatedEventAndGetAddress(didCreatedEvent); 
      
      this.lastCreatedDIDAddress = actualDID;
      
      let didDocument = await this.resolve(actualDID);
      if (!didDocument) {
        throw new Error('DID document not found with DID: ' + actualDID);
      }
      
      return {
        success: true,
        didDocument: didDocument,
        transactionHash: (result as any).transaction_hash,
        debug: {
          requestedDID: request.preferredDID,
          actualDID: actualDID || undefined,
          events: result.output?.events
        }
      };
    } catch (error) {
      this.errorLog('Error creating DID:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Override CADOP creation method
   */
  async createViaCADOP(request: CADOPCreationRequest, options?: RoochVDROperationOptions): Promise<DIDCreationResult> {
    try {
      const signer = options?.signer;
      if (!signer) {
        throw new Error('No custodian signer provided for CADOP operation');
      }
      
      // Create transaction
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::create_did_object_via_cadop_with_did_key_entry`,
        args: [
          Args.string(request.userDidKey),
          Args.string(request.custodianServicePublicKey),
          Args.string(request.custodianServiceVMType)
        ],
        maxGas: options?.maxGas || 100000000
      });

      this.debugLog('Creating DID via CADOP Transaction:', transaction)
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });

      this.debugLog('Creating DID via CADOP Transaction Result:', result)
      
      const success = result.execution_info.status.type === 'executed';
      
      if (!success) {
        return {
          success: false,
          error: 'CADOP transaction execution failed, execution_info: ' + JSON.stringify(result.execution_info)
        };
      }
      
      // Parse the created DID
      const didCreatedEvent = result.output?.events?.find((event: any) => 
        event.event_type === '0x3::did::DIDCreatedEvent'
      );
      if (!didCreatedEvent) {
        throw new Error('DIDCreatedEvent not found');
      }
      let actualDID = this.parseDIDCreatedEventAndGetAddress(didCreatedEvent);
      let didDocument = await this.resolve(actualDID);
      if (!didDocument) {
        throw new Error('DID document not found with DID: ' + actualDID);
      }
      return {
        success: true,
        didDocument: didDocument,
        transactionHash: (result as any).transaction_hash
      };
    } catch (error) {
      this.errorLog('Error creating DID via CADOP:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  } 

  /**
   * Extract verification relationships from DID Document for a specified verification method
   */
  private extractRelationshipsFromDocument(didDocument: DIDDocument, vmId: string): VerificationRelationship[] {
    const relationships: VerificationRelationship[] = [];
    const relationshipTypes: VerificationRelationship[] = [
      'authentication', 'assertionMethod', 'keyAgreement', 
      'capabilityInvocation', 'capabilityDelegation'
    ];
    
    relationshipTypes.forEach(rel => {
      const relationshipArray = didDocument[rel];
      if (relationshipArray && relationshipArray.some(item => 
        typeof item === 'string' ? item === vmId : item.id === vmId
      )) {
        relationships.push(rel);
      }
    });
    
    return relationships;
  }
  
  /**
   * Resolve DID Document from Rooch blockchain
   * 
   * @param did The DID to resolve (e.g., "did:rooch:0x123...")
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
      
      const identifier = didParts[2];
      
      // Calculate Object ID from identifier
      const objectId = resolveDidObjectID(identifier);
      this.debugLog(`Resolved DID object ID: ${objectId}`);
      const objectStates = await this.client.getObjectStates({
        ids: [objectId],
      });

      if (!objectStates || objectStates.length === 0) {
        return null;
      }

      let didDocObject: ObjectStateView = objectStates[0];
      if (!didDocObject) {
        this.debugLog(`Resolved DID document by ${did} is null`);
        return null;
      }
      this.debugLog(`Resolved DID document Move Object:`, JSON.stringify(didDocObject, null, 2));
      return convertMoveDIDDocumentToInterface(didDocObject);
    } catch (error) {
      this.errorLog(`Error resolving DID from Rooch network:`, error);
      return null;
    }
  }
  
  /**
   * Check if a DID exists on the Rooch network
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
      
      // Call DID contract's exists_did_for_address view function on Rooch network
      const result = await this.client.executeViewFunction({
        target: `${this.didContractAddress}::exists_did_for_address`,
        args: [Args.address(address)]
      });
      
      return result?.vm_status === 'Executed' && result.return_values?.[0]?.decoded_value === true;
    } catch (error) {
      console.error(`Error checking DID existence on Rooch network:`, error);
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
      
      const signer = options?.signer;
      if (!signer) {
        throw new Error('No signer provided for addVerificationMethod operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      this.debugLog(`Adding verification method to DID: ${did}`);
      this.debugLog(`Using signer with address: ${signer.getRoochAddress().toBech32Address()}`);
      
      // Check if signer has capabilityDelegation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toBech32Address() : null;
      if (signerAddress && !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityDelegation')) {
        this.errorLog(`Signer does not have capabilityDelegation permission for ${did}`);
        this.debugLog(`Note: DID operations may require the DID account itself to sign, not the controller`);
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
      
      this.debugLog(`Executing transaction: add_verification_method_entry`);
      this.debugLog(`Args:`, [
        this.extractFragmentFromId(verificationMethod.id),
        verificationMethod.type,
        verificationMethod.publicKeyMultibase,
        relationshipValues
      ]);
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      this.debugLog(`Transaction execution result:`, {
        status: result.execution_info.status,
        gas_used: result.execution_info.gas_used,
        events_count: result.output?.events?.length || 0
      });
      
      if (result.execution_info.status.type !== 'executed') {
        this.errorLog(`Transaction failed:`, result.execution_info);
        if (result.execution_info.status.type === 'moveabort') {
          this.errorLog(`Move abort code:`, (result.execution_info.status as any).abort_code);
          this.errorLog(`Move abort location:`, (result.execution_info.status as any).location);
        }
        return false;
      }
      
      this.debugLog(`Verification method added successfully`);
      return true;
    } catch (error) {
      this.errorLog(`Error adding verification method to ${did}:`, error);
      return false;
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
      
      const signer = options?.signer;
      if (!signer) {
        throw new Error('No signer provided for removeVerificationMethod operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if signer has capabilityDelegation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toBech32Address() : null;
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
      
      const signer = options?.signer;
      if (!signer) {
        throw new Error('No signer provided for addService operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      console.log(`🔧 Adding service to DID: ${did}`);
      console.log(`🗝️ Using signer with address: ${signer.getRoochAddress().toBech32Address()}`);
      
      // Check if signer has capabilityInvocation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toBech32Address() : null;
      if (signerAddress && !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityInvocation')) {
        console.error(`❌ Signer does not have capabilityInvocation permission for ${did}`);
        console.log(`💡 Note: DID operations may require the DID account itself to sign, not the controller`);
        return false;
      }

      const standardKeys = ['id', 'type', 'serviceEndpoint'];
      const additionalProperties = Object.entries(service).reduce((acc, [key, value]) => {
        if (!standardKeys.includes(key)) {
          acc[key] = value ? value.toString() : '';
        }
        return acc;
      }, {} as Record<string, string>);

      const propertyKeys = Object.keys(additionalProperties);
      const propertyValues = Object.values(additionalProperties).map(value => value ? value.toString() : '');
      console.log('service', JSON.stringify(service, null, 2))
      console.log('additionalProperties', JSON.stringify(additionalProperties, null, 2))
      console.log('propertyKeys', JSON.stringify(propertyKeys, null, 2))
      console.log('propertyValues', JSON.stringify(propertyValues, null, 2))
      
      // Create transaction for simple service (without properties)
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
      
      console.log(`📤 Executing transaction: add_service_entry`);
      console.log(`📋 Args:`, [
        this.extractFragmentFromId(service.id),
        service.type,
        service.serviceEndpoint
      ]);
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      console.log(`📊 Transaction execution result:`, {
        status: result.execution_info.status,
        gas_used: result.execution_info.gas_used,
        events_count: result.output?.events?.length || 0
      });
      
      if (result.execution_info.status.type !== 'executed') {
        console.error(`❌ Transaction failed:`, result.execution_info);
        if (result.execution_info.status.type === 'moveabort') {
          console.error(`🔥 Move abort code:`, (result.execution_info.status as any).abort_code);
          console.error(`🔥 Move abort location:`, (result.execution_info.status as any).location);
        }
        return false;
      }
      
      console.log(`✅ Service added successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Error adding service to ${did}:`, error);
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
      
      const signer = options?.signer;
      if (!signer) {
        throw new Error('No signer provided for addServiceWithProperties operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if signer has capabilityInvocation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toBech32Address() : null;
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
      
      const signer = options?.signer;
      if (!signer) {
        throw new Error('No signer provided for removeService operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if signer has capabilityInvocation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toBech32Address() : null;
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
      
      const signer = options?.signer;
      if (!signer) {
        throw new Error('No signer provided for updateRelationships operation');
      }
      
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if signer has capabilityDelegation permission
      const signerAddress = signer.getRoochAddress ? signer.getRoochAddress().toBech32Address() : null;
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
      this.debugLog(`Checking permission for signer ${signerAddress} on DID ${didDocument.id}`);
      this.debugLog(`Required relationship: ${requiredRelationship}`);
      this.debugLog(`DID controllers:`, didDocument.controller);
      
      // Create possible DID formats for the signer
      const signerDIDHex = `did:rooch:${signerAddress}`;
      this.debugLog(`Signer DID (hex):`, signerDIDHex);
      
      // Extract DID address from the DID document ID
      const didMatch = didDocument.id.match(/did:rooch:(.+)$/);
      const didAddress = didMatch ? didMatch[1] : null;
      
      this.debugLog(`DID account address:`, didAddress);
      this.debugLog(`Signer address:`, signerAddress);
      
      // **CRITICAL**: In Rooch DID system, operations must be signed by the DID account itself
      // The DID account is created by the contract and is different from the controller
      if (didAddress && signerAddress.toLowerCase() === didAddress.toLowerCase()) {
        this.debugLog(`Permission granted: Signer is the DID account itself`);
        return true;
      }
      
      // If signer is not the DID account, this will fail at contract level
      this.errorLog(`Permission issue: Signer is not the DID account`);
      this.debugLog(`In Rooch DID system:`);
      this.debugLog(`   - DID account address: ${didAddress}`);
      this.debugLog(`   - Signer address: ${signerAddress}`);
      this.debugLog(`   - Operations must be signed by the DID account, not the controller`);
      this.debugLog(`   - DID accounts can only sign via SessionKey or similar mechanism`);
      
      // Legacy permission check (will likely fail at contract level)
      // According to Rooch DID documentation, controllers should have management permissions
      // Check if the signer is in the controller list
      if (Array.isArray(didDocument.controller)) {
        for (const controller of didDocument.controller) {
          this.debugLog(`Checking controller:`, controller);
          
          // Direct match (hex format)
          if (controller === signerDIDHex) {
            this.debugLog(`Signer is a controller (hex format) but may fail at contract level`);
            return true;
          }
          
          // Try to handle bech32 format controllers
          if (controller.includes('rooch1')) {
            // For bech32 controllers, we need to convert addresses
            // For now, we'll be permissive for controllers since the Rooch DID system
            // should handle the actual authorization at the blockchain level
            this.debugLog(`Signer appears to be a controller (bech32 format) but may fail at contract level`);
            return true;
          }
          
          // Extract address from controller DID and compare
          const controllerMatch = controller.match(/did:rooch:(.+)$/);
          if (controllerMatch) {
            const controllerAddress = controllerMatch[1];
            if (controllerAddress === signerAddress || controllerAddress.toLowerCase() === signerAddress.toLowerCase()) {
              this.debugLog(`Address match found but may fail at contract level`);
              return true;
            }
          }
        }
      }
      
      // Check if signer controls any verification method with the required relationship
      if (!didDocument.verificationMethod) {
        this.debugLog(`No verification methods found`);
        return false;
      }
      
      for (const vm of didDocument.verificationMethod) {
        this.debugLog(`Checking verification method: ${vm.id}, controller: ${vm.controller}`);
        
        // Check if this verification method is controlled by the signer
        const isControlledBySigner = vm.controller === signerDIDHex || 
          vm.controller === didDocument.id ||
          (Array.isArray(didDocument.controller) && didDocument.controller.includes(signerDIDHex));
        
        if (isControlledBySigner) {
          this.debugLog(`VM ${vm.id} is controlled by signer, checking relationships...`);
          
          // Check if this verification method has the required relationship
          const relationshipArray = didDocument[requiredRelationship] as (string | object)[];
          if (relationshipArray) {
            this.debugLog(`Relationship array for ${requiredRelationship}:`, relationshipArray);
            
            const hasRelationship = relationshipArray.some(item => {
              if (typeof item === 'string') {
                return item === vm.id;
              } else if (typeof item === 'object' && (item as any).id) {
                return (item as any).id === vm.id;
              }
              return false;
            });
            
            if (hasRelationship) {
              this.debugLog(`VM has required relationship but signer may not be DID account`);
              return true;
            }
          }
        }
      }
      
      this.errorLog(`Permission denied: No matching controller or VM relationship found`);
      return false;
    } catch (error) {
      this.errorLog('Error checking permission:', error);
      return false;
    }
  }
  
  /**
   * Parse DIDCreatedEvent using BCS schema and return the DID address
   */
  private parseDIDCreatedEventAndGetAddress(event: any): string {
    try {
      const eventData = parseDIDCreatedEvent(event.event_data);
      return formatDIDString(eventData.did);
    } catch (error) {
      this.errorLog('BCS parsing failed:', error);
      throw error;
    }
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
    });
  }

  /**
   * Get network-specific RPC URL
   */
  private static getRoochNodeUrl(network: 'dev' | 'test' | 'main'): string {
    // Map our network names to Rooch SDK network names
    const networkMap: { [key: string]: string } = {
      'dev': 'localnet',
      'test': 'testnet', 
      'main': 'mainnet'
    };
    
    const roochNetwork = networkMap[network] || network;
    return sdkGetRoochNodeUrl(roochNetwork as any);
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
