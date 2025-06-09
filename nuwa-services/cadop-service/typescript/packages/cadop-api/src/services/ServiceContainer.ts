import { CustodianService, type CustodianServiceConfig } from './CustodianService.js';
import { WebAuthnService } from './WebAuthnService.js';
import { logger } from '../utils/logger.js';
import { CadopIdentityKit, createVDR, LocalSigner, VDRRegistry } from 'nuwa-identity-kit';
import { Secp256k1Keypair } from '@roochnetwork/rooch-sdk';

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
      //TODO load keypair from env
      const keypair = Secp256k1Keypair.generate();
      const vdr = createVDR('rooch', {
        rpcUrl: this.config.rpcUrl || process.env.ROOCH_RPC_URL || 'https://test-seed.rooch.network/',
        signer: keypair,
        debug: true
      });
      VDRRegistry.getInstance().registerVDR(vdr);
      const signer = await LocalSigner.createEmpty(this.config.custodianDid);
      signer.importRoochKeyPair('account-key', keypair);
      const cadopKit = await CadopIdentityKit.fromServiceDID(this.config.custodianDid, signer);
      this.custodianService = new CustodianService(this.config, this.webauthnService, cadopKit);
    }
    return this.custodianService;
  }

  // For testing purposes only
  static resetInstance(): void {
    ServiceContainer.instance = null;
  }
} 