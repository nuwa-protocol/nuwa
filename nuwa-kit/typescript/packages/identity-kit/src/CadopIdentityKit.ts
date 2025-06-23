import {
  ServiceEndpoint,
  DIDDocument,
  CADOPCreationRequest,
  DIDCreationResult,
  SignerInterface,
  ServiceInfo,
  VerificationRelationship,
} from './types';
import { VDRRegistry } from './VDRRegistry';
import { IdentityKit } from './IdentityKit';

/**
 * CADOP service types
 */
export enum CadopServiceType {
  CUSTODIAN = 'CadopCustodianService',
  IDP = 'CadopIdPService',
  WEB2_PROOF = 'CadopWeb2ProofService',
}

/**
 * CADOP service validation rules
 */
export interface CadopServiceValidationRule {
  requiredProperties: string[];
  optionalProperties: string[];
  propertyValidators?: Record<string, (value: any) => boolean>;
}

/**
 * CadopIdentityKit class for managing CADOP-specific functionality
 */
export class CadopIdentityKit {
  private static readonly SERVICE_VALIDATION_RULES: Record<
    CadopServiceType,
    CadopServiceValidationRule
  > = {
    [CadopServiceType.CUSTODIAN]: {
      requiredProperties: ['id', 'type', 'serviceEndpoint'],
      optionalProperties: ['description', 'fees', 'custodianPublicKey', 'custodianServiceVMType'],
      propertyValidators: {
        custodianPublicKey: (value: any) => typeof value === 'string' && value.length > 0,
        custodianServiceVMType: (value: any) => typeof value === 'string' && value.length > 0,
        fees: (value: any) => typeof value === 'object' && value !== null,
      },
    },
    [CadopServiceType.IDP]: {
      requiredProperties: ['id', 'type', 'serviceEndpoint'],
      optionalProperties: ['supportedCredentials', 'description', 'fees', 'termsOfService'],
      propertyValidators: {
        supportedCredentials: (value: any) => Array.isArray(value) && value.length > 0,
        fees: (value: any) => typeof value === 'object' && value !== null,
        termsOfService: (value: any) => typeof value === 'string' && value.length > 0,
      },
    },
    [CadopServiceType.WEB2_PROOF]: {
      requiredProperties: ['id', 'type', 'serviceEndpoint'],
      optionalProperties: ['supportedPlatforms', 'description', 'fees'],
      propertyValidators: {
        supportedPlatforms: (value: any) => Array.isArray(value) && value.length > 0,
        fees: (value: any) => typeof value === 'object' && value !== null,
      },
    },
  };

  private nuwaKit: IdentityKit;

  private constructor(nuwaKit: IdentityKit) {
    this.nuwaKit = nuwaKit;
  }

  private extractCustodianInfo(): ServiceEndpoint {
    const custodianServices = this.findServicesByType(CadopServiceType.CUSTODIAN);
    if (custodianServices.length > 0) {
      const custodianService = custodianServices[0];
      console.log('extractCustodianInfo', custodianService);
      return custodianService;
    }
    throw new Error('Custodian service not found in service document');
  }

  /**
   * Initialize a CadopIdentityKit instance from an existing CADOP service DID
   */
  static async fromServiceDID(
    serviceDid: string,
    signer: SignerInterface
  ): Promise<CadopIdentityKit> {
    const nuwaKit = await IdentityKit.fromExistingDID(serviceDid, signer);
    return new CadopIdentityKit(nuwaKit);
  }

  /**
   * Create a new DID via CADOP protocol
   */
  async createDID(
    method: string,
    userDid: string,
    options?: Record<string, any>
  ): Promise<DIDCreationResult> {
    const custodianInfo = this.extractCustodianInfo();

    const authenticationMethods =
      this.nuwaKit.findVerificationMethodsByRelationship('authentication');
    if (authenticationMethods.length === 0) {
      throw new Error('No authentication method found in service document');
    }
    const authenticationMethod = authenticationMethods[0];

    //if the custodianPublicKey and custodianServiceVMType are not found in the service document, use the first authentication method
    const { custodianPublicKey, custodianServiceVMType } =
      custodianInfo.custodianPublicKey && custodianInfo.custodianServiceVMType
        ? {
            custodianPublicKey: custodianInfo.custodianPublicKey,
            custodianServiceVMType: custodianInfo.custodianServiceVMType,
          }
        : {
            custodianPublicKey: authenticationMethod.publicKeyMultibase,
            custodianServiceVMType: authenticationMethod.type,
          };

    if (!custodianPublicKey || !custodianServiceVMType) {
      throw new Error('Custodian service configuration not found in service document');
    }

    const creationRequest: CADOPCreationRequest = {
      userDidKey: userDid,
      custodianServicePublicKey: custodianPublicKey,
      custodianServiceVMType: custodianServiceVMType,
    };

    return VDRRegistry.getInstance().createDIDViaCADOP(method, creationRequest, {
      signer: this.nuwaKit.getSigner(),
      ...options,
    });
  }

  /**
   * Add a new CADOP service to the service DID document
   */
  async addService(service: ServiceInfo): Promise<string> {
    // Convert ServiceInfo to ServiceEndpoint format for validation
    const serviceEndpoint: ServiceEndpoint = {
      id: `${this.nuwaKit.getDIDDocument().id}#${service.idFragment}`,
      type: service.type,
      serviceEndpoint: service.serviceEndpoint,
      ...(service.additionalProperties || {}),
    };

    if (!CadopIdentityKit.validateService(serviceEndpoint, service.type as CadopServiceType)) {
      throw new Error(`Invalid CADOP service configuration for type: ${service.type}`);
    }
    const result = await this.nuwaKit.addService(service);
    return result;
  }

  /**
   * Remove a CADOP service from the service DID document
   */
  async removeService(
    serviceId: string,
    options: {
      keyId: string;
      signer?: SignerInterface;
    }
  ): Promise<boolean> {
    const result = await this.nuwaKit.removeService(serviceId, options);
    return result;
  }

  /**
   * Get the underlying IdentityKit instance
   */
  getNuwaIdentityKit(): IdentityKit {
    return this.nuwaKit;
  }

  /**
   * Find all custodian services in the service document
   */
  findCustodianServices(): ServiceEndpoint[] {
    return this.findServicesByType(CadopServiceType.CUSTODIAN);
  }

  /**
   * Find all IdP services in the service document
   */
  findIdPServices(): ServiceEndpoint[] {
    return this.findServicesByType(CadopServiceType.IDP);
  }

  /**
   * Find all Web2 proof services in the service document
   */
  findWeb2ProofServices(): ServiceEndpoint[] {
    return this.findServicesByType(CadopServiceType.WEB2_PROOF);
  }

  /**
   * Find services by type in the service document
   */
  private findServicesByType(type: CadopServiceType): ServiceEndpoint[] {
    return (this.nuwaKit.getDIDDocument().service || [])
      .filter(service => service.type === type)
      .filter(service => CadopIdentityKit.validateService(service, type));
  }

  /**
   * Validate a service against its type-specific validation rules
   */
  private static validateService(service: ServiceEndpoint, type: CadopServiceType): boolean {
    const rules = CadopIdentityKit.SERVICE_VALIDATION_RULES[type];
    if (!rules) {
      return false;
    }

    // Check required properties
    const hasAllRequired = rules.requiredProperties.every(
      prop => prop in service && service[prop] !== undefined && service[prop] !== null
    );
    if (!hasAllRequired) {
      return false;
    }

    // Check if there are any unknown properties
    const allowedProperties = new Set([...rules.requiredProperties, ...rules.optionalProperties]);
    const hasUnknownProps = Object.keys(service).some(prop => !allowedProperties.has(prop));
    if (hasUnknownProps) {
      return false;
    }

    // Run property-specific validators
    if (rules.propertyValidators) {
      return Object.entries(rules.propertyValidators).every(([prop, validator]) => {
        if (prop in service) {
          return validator(service[prop]);
        }
        return true; // Skip validation for optional properties that are not present
      });
    }

    return true;
  }
}
