import { NuwaIdentityKit } from './NuwaIdentityKit';
import { ServiceEndpoint, DIDDocument } from './types';

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
      requiredProperties: ['id', 'type', 'serviceEndpoint', 'custodianPublicKey'],
      optionalProperties: ['description', 'fees'],
      propertyValidators: {
        custodianPublicKey: (value: any) => typeof value === 'string' && value.length > 0,
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

  constructor(private baseKit: NuwaIdentityKit) {}

  /**
   * Find all custodian services in the DID document
   */
  findCustodianServices(): ServiceEndpoint[] {
    return this.findServicesByType(CadopServiceType.CUSTODIAN);
  }

  /**
   * Find all IdP services in the DID document
   */
  findIdPServices(): ServiceEndpoint[] {
    return this.findServicesByType(CadopServiceType.IDP);
  }

  /**
   * Find all Web2 proof services in the DID document
   */
  findWeb2ProofServices(): ServiceEndpoint[] {
    return this.findServicesByType(CadopServiceType.WEB2_PROOF);
  }

  /**
   * Discover custodian services from a given custodian DID
   */
  async discoverCustodianServices(custodianDid: string): Promise<ServiceEndpoint[]> {
    const didDocument = await this.resolveDIDDocument(custodianDid);
    if (!didDocument) {
      return [];
    }
    return this.extractServices(didDocument, CadopServiceType.CUSTODIAN);
  }

  /**
   * Discover IdP services from a given IdP DID
   */
  async discoverIdPServices(idpDid: string): Promise<ServiceEndpoint[]> {
    const didDocument = await this.resolveDIDDocument(idpDid);
    if (!didDocument) {
      return [];
    }
    return this.extractServices(didDocument, CadopServiceType.IDP);
  }

  /**
   * Discover Web2 proof services from a given provider DID
   */
  async discoverWeb2ProofServices(providerDid: string): Promise<ServiceEndpoint[]> {
    const didDocument = await this.resolveDIDDocument(providerDid);
    if (!didDocument) {
      return [];
    }
    return this.extractServices(didDocument, CadopServiceType.WEB2_PROOF);
  }

  /**
   * Validate a custodian service
   */
  static validateCustodianService(service: ServiceEndpoint): boolean {
    return CadopIdentityKit.validateService(service, CadopServiceType.CUSTODIAN);
  }

  /**
   * Validate an IdP service
   */
  static validateIdPService(service: ServiceEndpoint): boolean {
    return CadopIdentityKit.validateService(service, CadopServiceType.IDP);
  }

  /**
   * Validate a Web2 proof service
   */
  static validateWeb2ProofService(service: ServiceEndpoint): boolean {
    return CadopIdentityKit.validateService(service, CadopServiceType.WEB2_PROOF);
  }

  /**
   * Find services by type in the base kit's DID document
   */
  private findServicesByType(type: CadopServiceType): ServiceEndpoint[] {
    const didDocument = this.baseKit.getDIDDocument();
    return this.extractServices(didDocument, type);
  }

  /**
   * Extract services of a specific type from a DID document
   */
  private extractServices(didDocument: DIDDocument, type: CadopServiceType): ServiceEndpoint[] {
    return (didDocument.service || [])
      .filter(service => service.type === type)
      .filter(service => CadopIdentityKit.validateService(service, type));
  }

  /**
   * Resolve a DID document
   */
  private async resolveDIDDocument(did: string): Promise<DIDDocument | null> {
    try {
      return await this.baseKit.resolveDID(did);
    } catch (error) {
      console.error(`Failed to resolve DID document for ${did}:`, error);
      return null;
    }
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