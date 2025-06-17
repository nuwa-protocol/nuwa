import { CustodianService } from './CustodianService.js';
import { IdpService } from './IdpService.js';
import { logger } from '../utils/logger.js';
import { BaseMultibaseCodec, CadopIdentityKit, createVDR, VDRInterface, VDRRegistry, LocalSigner, CadopServiceType } from 'nuwa-identity-kit';
import roochSdk from '@roochnetwork/rooch-sdk';
import type { Secp256k1Keypair as Secp256k1KeypairType } from '@roochnetwork/rooch-sdk';
import { cryptoService } from './crypto.js';
const { Secp256k1Keypair } = roochSdk;

export interface ServiceConfig {
  cadopDid: string;
  custodian: {
    maxDailyMints: number;
  };
  idp: {
    signingKey: string;
  };
  rooch: {
    networkUrl: string;
    networkId: string;
  };
  isDevelopment: boolean;
}

export class ServiceContainer {
  private static instance: ServiceContainer | null = null;
  private custodianService!: CustodianService;
  private idpService!: IdpService;
  private serviceConfig: ServiceConfig;

  private constructor(config: ServiceConfig) {
    this.serviceConfig = config;
  }

  private async initialize() {
    try {
      logger.info('Initializing services');
      logger.info('Service config', this.serviceConfig);

      logger.info('Initializing crypto service');
      await cryptoService.initializeKeys();
      logger.info('Crypto service initialized successfully');

      // Initialize VDR and signer for Custodian service
      logger.info('Initializing VDR and signer...');
      const keypair = cryptoService.getRoochKeypair();
      const roochVDR = createVDR('rooch', {
        rpcUrl: this.serviceConfig.rooch.networkUrl,
        debug: true
      });
      VDRRegistry.getInstance().registerVDR(roochVDR);

      let generatedCadopDid: string | undefined;
      const isDevelopment = this.serviceConfig.isDevelopment;
      if (isDevelopment){
        //Auto create a new service DID if the did is placeholder
        if (this.serviceConfig.cadopDid === 'did:rooch:placeholder'){
          generatedCadopDid = await this.createServiceDID(roochVDR);
          this.serviceConfig.cadopDid = generatedCadopDid;
        }
      }
      

      // Initialize CadopKit
      logger.info('Initializing CadopKit...');
      const signer = await LocalSigner.createEmpty(this.serviceConfig.cadopDid);
      signer.importRoochKeyPair('account-key', keypair);
      const cadopKit = await CadopIdentityKit.fromServiceDID(
        this.serviceConfig.cadopDid, 
        signer
      );

      // Initialize Custodian service
      logger.info('Initializing Custodian service...');
      this.custodianService = new CustodianService(
        {
          cadopDid: this.serviceConfig.cadopDid,
          maxDailyMints: this.serviceConfig.custodian.maxDailyMints,
        },
        cadopKit
      );
      logger.info('Custodian service initialized');

      let signingKey = this.serviceConfig.idp.signingKey;
      let generatedSigningKey = false;
      if (signingKey === 'signing-key-placeholder'){
        signingKey = cryptoService.getJwtSigningKey();
        generatedSigningKey = true;
      }

      // Initialize IDP service
      logger.info('Initializing IDP service...');
      this.idpService = new IdpService({
        cadopDid: this.serviceConfig.cadopDid,
        signingKey: signingKey,
      });
      logger.info('IDP service initialized');

      logger.info('All services initialized successfully');
      if (generatedCadopDid || generatedSigningKey) {
        console.log(`==============================================`);
        console.log(`Please update the cadopDid in the environment variables`);
        if (generatedCadopDid) {
          console.log(`CADOP_DID=${generatedCadopDid}`);
          console.log(`ROOCH_PRIVATE_KEY=${cryptoService.getRoochKeypair().getSecretKey()}`);
        }
        if (generatedSigningKey) {
          console.log(`JWT_SIGNING_KEY=${signingKey}`);
        }
        console.log(`==============================================`);
      }
    } catch (error) {
      logger.error('Failed to initialize services', { error });
      throw error;
    }
  }

  static async getInstance(config?: ServiceConfig): Promise<ServiceContainer> {
    if (!ServiceContainer.instance) {
      if (!config) {
        throw new Error('Configuration required for first initialization');
      }
      ServiceContainer.instance = new ServiceContainer(config);
      await ServiceContainer.instance.initialize();
    }
    return ServiceContainer.instance;
  }


  getCustodianService(): CustodianService {
    if (!this.custodianService) {
      throw new Error('Custodian service not initialized');
    }
    return this.custodianService;
  }

  getIdpService(): IdpService {
    if (!this.idpService) {
      throw new Error('IDP service not initialized');
    }
    return this.idpService;
  }

  // For testing purposes only
  static resetInstance(): void {
    ServiceContainer.instance = null;
  }

  private async createServiceDID(roochVDR: VDRInterface): Promise<string> {
    const serviceKeypair = cryptoService.getRoochKeypair();

    const publicKeyBytes = serviceKeypair.getPublicKey().toBytes();
    const publicKeyMultibase = BaseMultibaseCodec.encodeBase58btc(publicKeyBytes);
    
    const createResult = await roochVDR.create({
      publicKeyMultibase,
      keyType: 'EcdsaSecp256k1VerificationKey2019',
    }, {
      signer: serviceKeypair
    });
    if (!createResult.success) {
      throw new Error(`Failed to create service DID, error: ${JSON.stringify(createResult, null, 2)}`);
    }

    const cadopDid = createResult.didDocument!.id;
    logger.debug("Created service DID Result", createResult);

    const localSigner = await LocalSigner.createEmpty(cadopDid);
    localSigner.importRoochKeyPair('account-key', serviceKeypair);
    const cadopKit = await CadopIdentityKit.fromServiceDID(cadopDid, localSigner);
    
    // Add CADOP service
    const serviceId = await cadopKit.addService({
      idFragment: 'custodian',
      type: CadopServiceType.CUSTODIAN,
      serviceEndpoint: 'http://localhost:8080',
      additionalProperties: {
        custodianPublicKey: publicKeyMultibase,
        custodianServiceVMType: 'EcdsaSecp256k1VerificationKey2019',
        description: 'Test Custodian Service'
      }
    });

    logger.info("Please update the cadopDid in the environment variables");
    logger.info(`CADOP DID: ${cadopDid}`);
    return cadopDid;
  }
} 