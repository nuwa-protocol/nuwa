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
  Ed25519PublicKey,
  Secp256k1PublicKey,
  EventView,
} from '@roochnetwork/rooch-sdk';
import {
  DIDDocument,
  VerificationMethod,
  VerificationRelationship,
  ServiceEndpoint,
} from '../types/did';
import { SignerInterface, DidAccountSigner, isSignerInterface } from '../signers';
import { KeyType, keyTypeToRoochSignatureScheme } from '../types/crypto';
import {
  DIDCreationRequest,
  DIDCreationResult,
  CADOPCreationRequest,
  CADOPControllerCreationRequest,
} from './types';
import { AbstractVDR } from './abstractVDR';
import {
  convertMoveDIDDocumentToInterface,
  formatDIDString,
  parseDIDCreatedEvent,
  resolveDidObjectID,
} from './roochVDRTypes';
import { DebugLogger } from '../utils/DebugLogger';
import { parseDid, extractFragmentFromId } from '../utils/did';
import { validateScopes, combineScopes } from '../utils/sessionScopes';
import {
  IdentityKitErrorCode,
  createVDRError,
  createValidationError,
  createSignerError,
  wrapUnknownError,
} from '../errors';

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
  rpcUrl?: string;

  /**
   * Network type (local, dev, test, main)
   */
  network?: 'local' | 'dev' | 'test' | 'main';

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
  signer?: SignerInterface | Signer;

  /**
   * Key ID to use for this operation
   */
  keyId?: string;

  /**
   * Custom session key scopes (for authentication VM)
   * Only used when adding a verification method with authentication relationship
   */
  scopes?: string[];

  /**
   * Advanced blockchain transaction options
   * For high-level users who need fine-grained control over transaction parameters
   */
  advanced?: RoochTxnOptions;
}

/**
 * Advanced Rooch blockchain transaction options
 * These options are typically only needed for advanced use cases
 */
export interface RoochTxnOptions {
  /**
   * Maximum gas limit for the transaction
   */
  maxGas?: number;
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
  private readonly logger: DebugLogger;
  private lastCreatedDIDAddress?: string;

  constructor(options: RoochVDROptions) {
    super('rooch');
    this.options = options;
    this.didContractAddress = '0x3::did';
    this.debug = options.debug || false;
    this.logger = DebugLogger.get('RoochVDR');
    if (this.debug) {
      this.logger.setLevel('debug');
    }

    let rpcUrl = options.rpcUrl;
    if (!rpcUrl) {
      rpcUrl = RoochVDR.getRoochNodeUrl(options.network || 'test');
    }
    this.logger.debug(`RoochVDR initialized with rpcUrl: ${rpcUrl}`);
    // Initialize Rooch client
    this.client = new RoochClient({ url: rpcUrl });
  }

  /**
   * Log message if debug mode is enabled
   */
  private debugLog(message: string, data?: any) {
    if (data !== undefined) {
      this.logger.debug(message, data);
    } else {
      this.logger.debug(message);
    }
  }

  /**
   * Log error message (always logged regardless of debug mode)
   */
  private errorLog(message: string, error?: any) {
    if (error !== undefined) {
      this.logger.error(message, error);
    } else {
      this.logger.error(message);
    }
  }

  private async convertSigner(signer: SignerInterface | Signer, keyId?: string): Promise<Signer> {
    // If it implements SignerInterface, convert it to DidAccountSigner
    if (isSignerInterface(signer)) {
      return DidAccountSigner.create(signer, keyId);
    }
    // Fallback: assume it's Signer
    return signer;
  }

  /**
   * Override create method to support Rooch dynamic DID generation
   */
  async create(
    request: DIDCreationRequest,
    options?: RoochVDROperationOptions
  ): Promise<DIDCreationResult> {
    try {
      const signer = options?.signer;
      if (!signer) {
        throw createSignerError(
          IdentityKitErrorCode.SIGNER_NOT_AVAILABLE,
          'No signer provided for create operation',
          { operation: 'create', request }
        );
      }

      this.debugLog('Creating DID with request:', request);

      const didAccountSigner = await this.convertSigner(signer, options?.keyId);

      // Always combine base scopes with custom scopes
      const finalScopes = combineScopes(request.customScopes || []);

      // Validate all scopes
      const scopeValidation = validateScopes(finalScopes);
      if (!scopeValidation.valid) {
        throw createValidationError(
          IdentityKitErrorCode.SCOPE_VALIDATION_FAILED,
          `Invalid scope format: ${scopeValidation.invalidScopes.join(', ')}`,
          {
            invalidScopes: scopeValidation.invalidScopes,
            allScopes: finalScopes,
            operation: 'create',
          }
        );
      }

      // Always use the scopes version since we always have scopes (at minimum base scopes)
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::create_did_object_for_self_with_custom_scopes_entry`,
        args: [Args.string(request.publicKeyMultibase), Args.vec('string', finalScopes)],
        maxGas: options?.advanced?.maxGas || 100000000,
      });

      this.debugLog('Creating DID with scopes:', finalScopes);

      this.debugLog('Creating DID Transaction:', transaction);

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: didAccountSigner,
        option: { withOutput: true },
      });

      const success = result.execution_info.status.type === 'executed';

      if (!success) {
        // Return preferredDID or generate a failure placeholder on failure
        return {
          success: false,
          error:
            'Transaction execution failed, execution_info: ' +
            JSON.stringify(result.execution_info),
          debug: {
            requestedDID: request.preferredDID,
            transactionResult: result.execution_info,
          },
        };
      }

      // Parse the actual created DID
      const didCreatedEvent = result.output?.events?.find(
        (event: EventView) => event.event_type === '0x3::did::DIDCreatedEvent'
      );
      if (!didCreatedEvent) {
        throw createVDRError(
          IdentityKitErrorCode.VDR_INVALID_RESPONSE,
          'DIDCreatedEvent not found in transaction result',
          { transactionResult: result, events: result.output?.events, operation: 'create' }
        );
      }
      let actualDID = this.parseDIDCreatedEventAndGetDID(didCreatedEvent);

      this.lastCreatedDIDAddress = actualDID;

      let didDocument = await this.resolve(actualDID);
      if (!didDocument) {
        throw createVDRError(
          IdentityKitErrorCode.DID_RESOLUTION_FAILED,
          `DID document not found with DID: ${actualDID}`,
          { did: actualDID, operation: 'create' }
        );
      }

      return {
        success: true,
        didDocument: didDocument,
        transactionHash: (result as any).transaction_hash,
        debug: {
          requestedDID: request.preferredDID,
          actualDID: actualDID || undefined,
          events: result.output?.events,
        },
      };
    } catch (error) {
      this.errorLog('Error creating DID:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Override CADOP creation method
   */
  async createViaCADOP(
    request: CADOPCreationRequest,
    options?: RoochVDROperationOptions
  ): Promise<DIDCreationResult> {
    try {
      const signer = options?.signer;
      if (!signer) {
        throw createSignerError(
          IdentityKitErrorCode.SIGNER_NOT_AVAILABLE,
          'No custodian signer provided for CADOP operation',
          { operation: 'createViaCADOP', request }
        );
      }

      this.debugLog('Creating DID via CADOP with request:', request);
      const didAccountSigner = await this.convertSigner(signer, options?.keyId);

      // Always combine base scopes with custom scopes
      const finalScopes = combineScopes(request.customScopes || []);

      // Validate all scopes
      const scopeValidation = validateScopes(finalScopes);
      if (!scopeValidation.valid) {
        throw createValidationError(
          IdentityKitErrorCode.SCOPE_VALIDATION_FAILED,
          `Invalid scope format: ${scopeValidation.invalidScopes.join(', ')}`,
          {
            invalidScopes: scopeValidation.invalidScopes,
            allScopes: finalScopes,
            operation: 'createViaCADOP',
          }
        );
      }

      // Always use the scopes version since the contract will add base scopes
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::create_did_object_via_cadop_with_did_key_and_scopes_entry`,
        args: [
          Args.string(request.userDidKey),
          Args.string(request.custodianServicePublicKey),
          Args.string(request.custodianServiceVMType),
          Args.vec('string', finalScopes),
        ],
        maxGas: options?.advanced?.maxGas || 100000000,
      });

      this.debugLog('Creating DID via CADOP with scopes:', finalScopes);

      this.debugLog('Creating DID via CADOP Transaction:', transaction);

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: didAccountSigner,
        option: { withOutput: true },
      });

      this.debugLog('Creating DID via CADOP Transaction Result:', result);

      const success = result.execution_info.status.type === 'executed';

      if (!success) {
        return {
          success: false,
          error:
            'CADOP transaction execution failed, execution_info: ' +
            JSON.stringify(result.execution_info),
        };
      }

      // Parse the created DID
      const didCreatedEvent = result.output?.events?.find(
        (event: any) => event.event_type === '0x3::did::DIDCreatedEvent'
      );
      if (!didCreatedEvent) {
        throw createVDRError(
          IdentityKitErrorCode.VDR_INVALID_RESPONSE,
          'DIDCreatedEvent not found in transaction result',
          { transactionResult: result, events: result.output?.events }
        );
      }
      let actualDID = this.parseDIDCreatedEventAndGetDID(didCreatedEvent);
      let didDocument = await this.resolve(actualDID);
      if (!didDocument) {
        throw createVDRError(
          IdentityKitErrorCode.DID_RESOLUTION_FAILED,
          `DID document not found with DID: ${actualDID}`,
          { did: actualDID }
        );
      }
      return {
        success: true,
        didDocument: didDocument,
        transactionHash: (result as any).transaction_hash,
      };
    } catch (error) {
      this.errorLog('Error creating DID via CADOP:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create DID via CADOP with controller (supports did:key, did:bitcoin, etc.)
   */
  async createViaCADOPWithController(
    request: CADOPControllerCreationRequest,
    options?: RoochVDROperationOptions
  ): Promise<DIDCreationResult> {
    try {
      const signer = options?.signer;
      if (!signer) {
        throw createSignerError(
          IdentityKitErrorCode.SIGNER_NOT_AVAILABLE,
          'No custodian signer provided for CADOP controller operation',
          { operation: 'createViaCADOPWithController', request }
        );
      }

      this.debugLog('Creating DID via CADOP with controller request:', request);
      const didAccountSigner = await this.convertSigner(signer, options?.keyId);

      // Always combine base scopes with custom scopes
      const finalScopes = combineScopes(request.customScopes || []);

      // Validate all scopes
      const scopeValidation = validateScopes(finalScopes);
      if (!scopeValidation.valid) {
        throw createValidationError(
          IdentityKitErrorCode.SCOPE_VALIDATION_FAILED,
          `Invalid scope format: ${scopeValidation.invalidScopes.join(', ')}`,
          {
            invalidScopes: scopeValidation.invalidScopes,
            allScopes: finalScopes,
            operation: 'createViaCADOPWithController',
          }
        );
      }

      // Use the new controller-based contract entry point
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::create_did_object_via_cadop_with_controller_and_scopes_entry`,
        args: [
          Args.string(request.controllerDid),
          Args.string(request.controllerPublicKeyMultibase || ''),
          Args.string(request.controllerVMType || ''),
          Args.string(request.custodianServicePublicKey),
          Args.string(request.custodianServiceVMType),
          Args.vec('string', finalScopes),
        ],
        maxGas: options?.advanced?.maxGas || 100000000,
      });

      this.debugLog('Creating DID via CADOP with controller and scopes:', finalScopes);
      this.debugLog('Controller DID:', request.controllerDid);
      this.debugLog('Controller public key multibase:', request.controllerPublicKeyMultibase);
      this.debugLog('Controller VM type:', request.controllerVMType);

      this.debugLog('Creating DID via CADOP with controller Transaction:', transaction);

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: didAccountSigner,
        option: { withOutput: true },
      });

      this.debugLog('Creating DID via CADOP with controller Transaction Result:', result);

      const success = result.execution_info.status.type === 'executed';

      if (!success) {
        return {
          success: false,
          error:
            'CADOP controller transaction execution failed, execution_info: ' +
            JSON.stringify(result.execution_info),
        };
      }

      // Parse the created DID
      const didCreatedEvent = result.output?.events?.find(
        (event: any) => event.event_type === '0x3::did::DIDCreatedEvent'
      );
      if (!didCreatedEvent) {
        throw createVDRError(
          IdentityKitErrorCode.VDR_INVALID_RESPONSE,
          'DIDCreatedEvent not found in transaction result',
          { transactionResult: result, events: result.output?.events }
        );
      }
      let actualDID = this.parseDIDCreatedEventAndGetDID(didCreatedEvent);
      let didDocument = await this.resolve(actualDID);
      if (!didDocument) {
        throw createVDRError(
          IdentityKitErrorCode.DID_RESOLUTION_FAILED,
          `DID document not found with DID: ${actualDID}`,
          { did: actualDID }
        );
      }
      return {
        success: true,
        didDocument: didDocument,
        transactionHash: (result as any).transaction_hash,
        debug: {
          requestedDID: request.controllerDid,
          actualDID: actualDID,
          events: result.output?.events,
        },
      };
    } catch (error) {
      this.errorLog('Error creating DID via CADOP with controller:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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
      const { method, identifier } = parseDid(did);
      if (method !== 'rooch') {
        throw createVDRError(
          IdentityKitErrorCode.DID_INVALID_FORMAT,
          'Invalid DID format. Expected did:rooch:address',
          { did, expectedMethod: 'rooch', actualMethod: method }
        );
      }

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
      const { method, identifier } = parseDid(did);
      if (method !== 'rooch') {
        return false;
      }

      const address = identifier;

      // Call DID contract's exists_did_for_address view function on Rooch network
      const result = await this.client.executeViewFunction({
        target: `${this.didContractAddress}::exists_did_for_address`,
        args: [Args.address(address)],
      });

      return result?.vm_status === 'Executed' && result.return_values?.[0]?.decoded_value === true;
    } catch (error) {
      this.errorLog(`Error checking DID existence on Rooch network:`, error);
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
        throw createSignerError(
          IdentityKitErrorCode.SIGNER_NOT_AVAILABLE,
          'No signer provided for addVerificationMethod operation',
          { operation: 'addVerificationMethod', did }
        );
      }

      const didAccountSigner = await this.convertSigner(signer, options?.keyId);

      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw createVDRError(IdentityKitErrorCode.DID_NOT_FOUND, `DID document ${did} not found`, {
          did,
        });
      }

      this.debugLog(`Adding verification method to DID: ${did}`);
      this.debugLog(
        `Using signer with address: ${didAccountSigner.getRoochAddress().toBech32Address()}`
      );

      // Check if signer has capabilityDelegation permission
      const signerAddress = didAccountSigner.getRoochAddress
        ? didAccountSigner.getRoochAddress().toBech32Address()
        : null;
      if (
        signerAddress &&
        !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityDelegation')
      ) {
        this.errorLog(`Signer does not have capabilityDelegation permission for ${did}`);
        this.debugLog(
          `Note: DID operations may require the DID account itself to sign, not the controller`
        );
        return false;
      }

      // Validate verification method
      if (!verificationMethod.publicKeyMultibase) {
        throw createValidationError(
          IdentityKitErrorCode.INVALID_INPUT_FORMAT,
          'Verification method must have publicKeyMultibase',
          { verificationMethod, did }
        );
      }

      // Convert verification relationships to u8 values
      const relationshipValues = this.convertVerificationRelationships(relationships || []);

      // Check if we need to use scopes version for authentication relationship
      const hasAuthentication = relationships?.includes('authentication');

      // Create transaction
      const transaction = this.createTransaction();

      if (hasAuthentication) {
        // When adding authentication VM, we need to handle scopes
        const finalScopes = combineScopes(options?.scopes || []);

        // Validate all scopes
        const scopeValidation = validateScopes(finalScopes);
        if (!scopeValidation.valid) {
          throw createValidationError(
            IdentityKitErrorCode.SCOPE_VALIDATION_FAILED,
            `Invalid scope format: ${scopeValidation.invalidScopes.join(', ')}`,
            {
              invalidScopes: scopeValidation.invalidScopes,
              allScopes: finalScopes,
              operation: 'addVerificationMethod',
            }
          );
        }

        // Use the scopes version for authentication VM
        transaction.callFunction({
          target: `${this.didContractAddress}::add_verification_method_with_scopes_entry`,
          args: [
            Args.string(extractFragmentFromId(verificationMethod.id)),
            Args.string(verificationMethod.type),
            Args.string(verificationMethod.publicKeyMultibase),
            Args.vec('u8', relationshipValues),
            Args.vec('string', finalScopes),
          ],
          maxGas: options?.advanced?.maxGas || 100000000,
        });

        this.debugLog('Using add_verification_method_with_scopes_entry with scopes:', finalScopes);
      } else {
        // Use regular version for non-authentication VM
        transaction.callFunction({
          target: `${this.didContractAddress}::add_verification_method_entry`,
          args: [
            Args.string(extractFragmentFromId(verificationMethod.id)),
            Args.string(verificationMethod.type),
            Args.string(verificationMethod.publicKeyMultibase),
            Args.vec('u8', relationshipValues),
          ],
          maxGas: options?.advanced?.maxGas || 100000000,
        });

        this.debugLog(
          'Using regular add_verification_method_entry (no authentication relationship)'
        );
      }

      this.debugLog(`Verification method transaction prepared`);
      this.debugLog(`Fragment:`, extractFragmentFromId(verificationMethod.id));
      this.debugLog(`Type:`, verificationMethod.type);
      this.debugLog(`Relationships:`, relationshipValues);

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: didAccountSigner,
        option: { withOutput: true },
      });

      this.debugLog(`Transaction execution result:`, {
        status: result.execution_info.status,
        gas_used: result.execution_info.gas_used,
        events_count: result.output?.events?.length || 0,
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
        throw createSignerError(
          IdentityKitErrorCode.SIGNER_NOT_AVAILABLE,
          'No signer provided for removeVerificationMethod operation',
          { operation: 'removeVerificationMethod', did, id }
        );
      }

      const didAccountSigner = await this.convertSigner(signer, options?.keyId);

      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw createVDRError(IdentityKitErrorCode.DID_NOT_FOUND, `DID document ${did} not found`, {
          did,
        });
      }

      // Check if signer has capabilityDelegation permission
      const signerAddress = didAccountSigner.getRoochAddress
        ? didAccountSigner.getRoochAddress().toBech32Address()
        : null;
      if (
        signerAddress &&
        !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityDelegation')
      ) {
        this.errorLog(`Signer does not have capabilityDelegation permission for ${did}`);
        return false;
      }

      // Create transaction
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::remove_verification_method_entry`,
        args: [Args.string(extractFragmentFromId(id))],
        maxGas: options?.advanced?.maxGas || 100000000,
      });

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: didAccountSigner,
        option: { withOutput: true },
      });

      return result.execution_info.status.type === 'executed';
    } catch (error) {
      this.errorLog(`Error removing verification method from ${did}:`, error);
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
        throw createSignerError(
          IdentityKitErrorCode.SIGNER_NOT_AVAILABLE,
          'No signer provided for addService operation',
          { operation: 'addService', did }
        );
      }

      const didAccountSigner = await this.convertSigner(signer, options?.keyId);
      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw createVDRError(IdentityKitErrorCode.DID_NOT_FOUND, `DID document ${did} not found`, {
          did,
        });
      }

      this.debugLog(`Adding service to DID: ${did}`);
      this.debugLog(
        `🗝️ Using signer with address: ${didAccountSigner.getRoochAddress().toBech32Address()}`
      );

      // Check if signer has capabilityInvocation permission
      const signerAddress = didAccountSigner.getRoochAddress
        ? didAccountSigner.getRoochAddress().toBech32Address()
        : null;
      if (
        signerAddress &&
        !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityInvocation')
      ) {
        this.errorLog(`Signer does not have capabilityInvocation permission for ${did}`);
        this.debugLog(
          `💡 Note: DID operations may require the DID account itself to sign, not the controller`
        );
        return false;
      }

      const standardKeys = ['id', 'type', 'serviceEndpoint'];
      const additionalProperties = Object.entries(service).reduce(
        (acc, [key, value]) => {
          if (!standardKeys.includes(key)) {
            acc[key] = value ? value.toString() : '';
          }
          return acc;
        },
        {} as Record<string, string>
      );

      const propertyKeys = Object.keys(additionalProperties);
      const propertyValues = Object.values(additionalProperties).map(value =>
        value ? value.toString() : ''
      );
      this.debugLog('service', service);
      this.debugLog('additionalProperties', additionalProperties);
      this.debugLog('propertyKeys', propertyKeys);
      this.debugLog('propertyValues', propertyValues);

      // Create transaction for simple service (without properties)
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::add_service_with_properties_entry`,
        args: [
          Args.string(extractFragmentFromId(service.id)),
          Args.string(service.type),
          Args.string(service.serviceEndpoint),
          Args.vec('string', propertyKeys),
          Args.vec('string', propertyValues),
        ],
        maxGas: options?.advanced?.maxGas || 100000000,
      });

      this.debugLog('Executing transaction: add_service_entry');
      this.debugLog('Args:', [
        extractFragmentFromId(service.id),
        service.type,
        service.serviceEndpoint,
      ]);

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: didAccountSigner,
        option: { withOutput: true },
      });

      this.debugLog('Transaction execution result:', {
        status: result.execution_info.status,
        gas_used: result.execution_info.gas_used,
        events_count: result.output?.events?.length || 0,
      });

      if (result.execution_info.status.type !== 'executed') {
        this.errorLog('Transaction failed:', result.execution_info);
        if (result.execution_info.status.type === 'moveabort') {
          this.errorLog('Move abort code:', (result.execution_info.status as any).abort_code);
          this.errorLog('Move abort location:', (result.execution_info.status as any).location);
        }
        return false;
      }

      this.debugLog('Service added successfully');
      return true;
    } catch (error) {
      this.errorLog(`Error adding service to ${did}:`, error);
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
        throw createSignerError(
          IdentityKitErrorCode.SIGNER_NOT_AVAILABLE,
          'No signer provided for addServiceWithProperties operation',
          { operation: 'addServiceWithProperties', did }
        );
      }

      const didAccountSigner = await this.convertSigner(signer, options?.keyId);

      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw createVDRError(IdentityKitErrorCode.DID_NOT_FOUND, `DID document ${did} not found`, {
          did,
        });
      }

      // Check if signer has capabilityInvocation permission
      const signerAddress = didAccountSigner.getRoochAddress
        ? didAccountSigner.getRoochAddress().toBech32Address()
        : null;
      if (
        signerAddress &&
        !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityInvocation')
      ) {
        this.errorLog(`Signer does not have capabilityInvocation permission for ${did}`);
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
          Args.string(extractFragmentFromId(service.id)),
          Args.string(service.type),
          Args.string(service.serviceEndpoint),
          Args.vec('string', propertyKeys),
          Args.vec('string', propertyValues),
        ],
        maxGas: options?.advanced?.maxGas || 100000000,
      });

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: didAccountSigner,
        option: { withOutput: true },
      });

      return result.execution_info.status.type === 'executed';
    } catch (error) {
      this.errorLog(`Error adding service with properties to ${did}:`, error);
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
        throw createSignerError(
          IdentityKitErrorCode.SIGNER_NOT_AVAILABLE,
          'No signer provided for removeService operation',
          { operation: 'removeService', did, id }
        );
      }

      const didAccountSigner = await this.convertSigner(signer, options?.keyId);

      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw createVDRError(IdentityKitErrorCode.DID_NOT_FOUND, `DID document ${did} not found`, {
          did,
        });
      }

      // Check if signer has capabilityInvocation permission
      const signerAddress = didAccountSigner.getRoochAddress().toBech32Address();
      if (
        signerAddress &&
        !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityInvocation')
      ) {
        this.errorLog(`Signer does not have capabilityInvocation permission for ${did}`);
        return false;
      }

      // Create transaction
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::remove_service_entry`,
        args: [Args.string(extractFragmentFromId(id))],
        maxGas: options?.advanced?.maxGas || 100000000,
      });

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer: didAccountSigner,
        option: { withOutput: true },
      });

      return result.execution_info.status.type === 'executed';
    } catch (error) {
      this.errorLog(`Error removing service from ${did}:`, error);
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
        throw createSignerError(
          IdentityKitErrorCode.SIGNER_NOT_AVAILABLE,
          'No signer provided for updateRelationships operation',
          { operation: 'updateRelationships', did, id }
        );
      }

      const didAccountSigner = await this.convertSigner(signer, options?.keyId);

      // Pre-validate permissions by resolving the DID document
      const currentDoc = await this.resolve(did);
      if (!currentDoc) {
        throw createVDRError(IdentityKitErrorCode.DID_NOT_FOUND, `DID document ${did} not found`, {
          did,
        });
      }

      // Check if signer has capabilityDelegation permission
      const signerAddress = didAccountSigner.getRoochAddress().toBech32Address();
      if (
        signerAddress &&
        !this.hasPermissionForOperation(currentDoc, signerAddress, 'capabilityDelegation')
      ) {
        this.errorLog(`Signer does not have capabilityDelegation permission for ${did}`);
        return false;
      }

      const fragment = extractFragmentFromId(id);

      // Add relationships
      for (const relationship of add) {
        const relationshipValue = this.convertVerificationRelationship(relationship);
        const transaction = this.createTransaction();
        transaction.callFunction({
          target: `${this.didContractAddress}::add_to_verification_relationship_entry`,
          args: [Args.string(fragment), Args.u8(relationshipValue)],
          maxGas: options?.advanced?.maxGas || 100000000,
        });

        const result = await this.client.signAndExecuteTransaction({
          transaction,
          signer: didAccountSigner,
          option: { withOutput: true },
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
          args: [Args.string(fragment), Args.u8(relationshipValue)],
          maxGas: options?.advanced?.maxGas || 100000000,
        });

        const result = await this.client.signAndExecuteTransaction({
          transaction,
          signer: didAccountSigner,
          option: { withOutput: true },
        });

        if (result.execution_info.status.type !== 'executed') {
          return false;
        }
      }

      return true;
    } catch (error) {
      this.errorLog(`Error updating relationships for ${did}:`, error);
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
        throw createValidationError(
          IdentityKitErrorCode.INVALID_PARAMETER,
          `Unknown verification relationship: ${relationship}`,
          {
            relationship,
            validRelationships: [
              'authentication',
              'assertionMethod',
              'keyAgreement',
              'capabilityInvocation',
              'capabilityDelegation',
            ],
          }
        );
    }
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
            this.debugLog(
              `Signer appears to be a controller (bech32 format) but may fail at contract level`
            );
            return true;
          }

          // Extract address from controller DID and compare
          const controllerMatch = controller.match(/did:rooch:(.+)$/);
          if (controllerMatch) {
            const controllerAddress = controllerMatch[1];
            if (
              controllerAddress === signerAddress ||
              controllerAddress.toLowerCase() === signerAddress.toLowerCase()
            ) {
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
        const isControlledBySigner =
          vm.controller === signerDIDHex ||
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
  private parseDIDCreatedEventAndGetDID(event: EventView): string {
    try {
      const eventData = parseDIDCreatedEvent(event.event_data);
      return eventData.did;
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
  static createDefault(
    network: 'local' | 'dev' | 'test' | 'main' = 'test',
    rpcUrl: string | undefined = undefined
  ): RoochVDR {
    return new RoochVDR({
      rpcUrl: rpcUrl || RoochVDR.getRoochNodeUrl(network),
      network,
    });
  }

  /**
   * Get network-specific RPC URL
   */
  private static getRoochNodeUrl(network: 'local' | 'dev' | 'test' | 'main'): string {
    // Map our network names to Rooch SDK network names
    const networkMap: { [key: string]: string } = {
      local: 'localnet',
      dev: 'devnet',
      test: 'testnet',
      main: 'mainnet',
    };

    const roochNetwork = networkMap[network] || network;
    return sdkGetRoochNodeUrl(roochNetwork as any);
  }
}
