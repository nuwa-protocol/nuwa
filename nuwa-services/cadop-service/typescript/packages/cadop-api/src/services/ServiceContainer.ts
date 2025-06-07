import { CustodianService, type CustodianServiceConfig } from './CustodianService.js';
import { WebAuthnService } from './WebAuthnService.js';
import { logger } from '../utils/logger.js';

export class ServiceContainer {
  private static instance: ServiceContainer | null = null;
  private custodianService: CustodianService | null = null;
  private config: CustodianServiceConfig;
  private webauthnService: WebAuthnService;

  private constructor(config: CustodianServiceConfig, webauthnService: WebAuthnService) {
    this.config = config;
    this.webauthnService = webauthnService;
  }

  static getInstance(config?: CustodianServiceConfig, webauthnService?: WebAuthnService): ServiceContainer {
    if (!ServiceContainer.instance) {
      if (!config || !webauthnService) {
        throw new Error('Configuration required for first initialization');
      }
      ServiceContainer.instance = new ServiceContainer(config, webauthnService);
    }
    return ServiceContainer.instance;
  }

  async getCustodianService(): Promise<CustodianService> {
    if (!this.custodianService) {
      logger.info('Creating new CustodianService instance');
      this.custodianService = new CustodianService(this.config, this.webauthnService);
      await this.custodianService.initialize();
    }
    return this.custodianService;
  }

  // For testing purposes only
  static resetInstance(): void {
    ServiceContainer.instance = null;
  }
} 