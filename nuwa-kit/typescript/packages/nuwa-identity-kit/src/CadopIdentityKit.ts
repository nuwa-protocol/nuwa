import { 
  ServiceEndpoint, 
  DIDDocument, 
  CADOPCreationRequest,
  DIDCreationResult,
  SignerInterface,
  ServiceInfo
} from './types';
import { VDRRegistry } from './VDRRegistry';
import { NuwaIdentityKit } from './NuwaIdentityKit';

/**
 * CADOP service types
 */
export enum CadopServiceType {
  CUSTODIAN = 'CadopCustodianService',
  IDP = 'CadopIdPService',
  WEB2_PROOF = 'CadopWeb2ProofService'
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
  private static readonly SERVICE_VALIDATION_RULES: Record<CadopServiceType, CadopServiceValidationRule> = {
    [CadopServiceType.CUSTODIAN]: {
      requiredProperties: [
        'id', 
        'type', 
        'serviceEndpoint', 
        'custodianPublicKey',
        'custodianServiceVMType'
      ],
      optionalProperties: ['description', 'fees'],
      propertyValidators: {
        custodianPublicKey: (value: any) => typeof value === 'string' && value.length > 0,
        custodianServiceVMType: (value: any) => typeof value === 'string' && value.length > 0,
        fees: (value: any) => typeof value === 'object' && value !== null
      }
    },
    [CadopServiceType.IDP]: {
      requiredProperties: ['id', 'type', 'serviceEndpoint', 'supportedCredentials'],
      optionalProperties: ['description', 'fees', 'termsOfService'],
      propertyValidators: {
        supportedCredentials: (value: any) => Array.isArray(value) && value.length > 0,
        fees: (value: any) => typeof value === 'object' && value !== null,
        termsOfService: (value: any) => typeof value === 'string' && value.length > 0
      }
    },
    [CadopServiceType.WEB2_PROOF]: {
      requiredProperties: ['id', 'type', 'serviceEndpoint', 'supportedPlatforms'],
      optionalProperties: ['description', 'fees'],
      propertyValidators: {
        supportedPlatforms: (value: any) => Array.isArray(value) && value.length > 0,
        fees: (value: any) => typeof value === 'object' && value !== null
      }
    }
  };

  private nuwaKit: NuwaIdentityKit;
  private cadopSigner: SignerInterface;

  private constructor(nuwaKit: NuwaIdentityKit, cadopSigner: SignerInterface) {
    this.nuwaKit = nuwaKit;
    this.cadopSigner = cadopSigner;
  }

  private extractCustodianInfo() : {custodianPublicKey?: string, custodianServiceVMType?: string} {
    const custodianServices = this.findServicesByType(CadopServiceType.CUSTODIAN);
    if (custodianServices.length > 0) {
      const custodianPublicKey = custodianServices[0].custodianPublicKey;
      const custodianServiceVMType = custodianServices[0].custodianServiceVMType;
      console.log('extractCustodianInfo', custodianPublicKey, custodianServiceVMType)
      return {
        custodianPublicKey: custodianPublicKey,
        custodianServiceVMType: custodianServiceVMType
      }
    }
    return {
      custodianPublicKey: undefined,
      custodianServiceVMType: undefined
    }
  }

  /**
   * Initialize a CadopIdentityKit instance from an existing CADOP service DID
   */
  static async fromServiceDID(
    serviceDid: string,
    cadopSigner: SignerInterface,
    options?: {
      operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>,
    }
  ): Promise<CadopIdentityKit> {
    const nuwaKit = await NuwaIdentityKit.fromExistingDID(serviceDid, options);
    return new CadopIdentityKit(nuwaKit, cadopSigner);
  }

  /**
   * Create a new DID via CADOP protocol
   */
  async createDID(
    method: string,
    userDid: string,
    options?: Record<string, any>,
  ): Promise<DIDCreationResult> {
    const custodianInfo = this.extractCustodianInfo();
    if (!custodianInfo.custodianPublicKey || !custodianInfo.custodianServiceVMType) {
      throw new Error('Custodian service configuration not found in service document');
    }

    const creationRequest: CADOPCreationRequest = {
      userDidKey: userDid,
      custodianServicePublicKey: custodianInfo.custodianPublicKey,
      custodianServiceVMType: custodianInfo.custodianServiceVMType,
    };

    return VDRRegistry.getInstance().createDIDViaCADOP(method, creationRequest, {
      signer: this.cadopSigner,
      ...options
    });
  }

  /**
   * Add a new CADOP service to the service DID document
   */
  async addService(
    service: ServiceInfo,
  ): Promise<string> {
    // Convert ServiceInfo to ServiceEndpoint format for validation
    const serviceEndpoint: ServiceEndpoint = {
      id: `${this.nuwaKit.getDIDDocument().id}#${service.idFragment}`,
      type: service.type,
      serviceEndpoint: service.serviceEndpoint,
      ...(service.additionalProperties || {})
    };

    if (!CadopIdentityKit.validateService(serviceEndpoint, service.type as CadopServiceType)) {
      throw new Error(`Invalid CADOP service configuration for type: ${service.type}`);
    }
    const result = await this.nuwaKit.addService(service, {signer: this.cadopSigner});
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
   * Get the underlying NuwaIdentityKit instance
   */
  getNuwaIdentityKit(): NuwaIdentityKit {
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
    const hasAllRequired = rules.requiredProperties.every(prop => 
      prop in service && service[prop] !== undefined && service[prop] !== null
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