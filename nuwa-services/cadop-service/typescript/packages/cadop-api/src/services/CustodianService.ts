import { 
  CreateAgentDIDRequest, 
  AgentDIDCreationStatus,
  IDToken
} from '@cadop/shared';
import {
  VDRRegistry,
  NuwaIdentityKit,
  CadopIdentityKit,
  DIDDocument,
  ServiceEndpoint,
  VDRInterface,
  createVDR
} from 'nuwa-identity-kit';
import { logger } from '../utils/logger.js';
import roochSdk from '@roochnetwork/rooch-sdk';
import type { Secp256k1Keypair as Secp256k1KeypairType } from '@roochnetwork/rooch-sdk';
const { Secp256k1Keypair } = roochSdk;

import { WebAuthnService } from './WebAuthnService.js';

export interface CustodianServiceConfig {
  custodianDid: string;
  maxDailyMints: number;
  rpcUrl?: string;
}

export class CustodianService {
  private cadopKit: CadopIdentityKit;
  private didCreationRecords: Map<string, AgentDIDCreationStatus>;
  private userDids: Map<string, string[]>;
  private dailyMintCount: Map<string, number>;
  private lastMintReset: Date;
  private config: CustodianServiceConfig;
  private webauthnService: WebAuthnService;
  private initialized: boolean = false;

  constructor(config: CustodianServiceConfig, webauthnService: WebAuthnService) {
    this.config = {
      ...config,
      rpcUrl: config.rpcUrl || process.env.ROOCH_RPC_URL || 'https://test-seed.rooch.network/'
    };
    
    this.didCreationRecords = new Map();
    this.userDids = new Map();
    this.dailyMintCount = new Map();
    this.lastMintReset = new Date();
    this.webauthnService = webauthnService;
  }

  /**
   * Initialize the service with required dependencies
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing CustodianService', { config: this.config });
    const vdr = createVDR('rooch', {
      rpcUrl: this.config.rpcUrl,
      signer: Secp256k1Keypair.generate(),
      debug: true
    });
    VDRRegistry.getInstance().registerVDR(vdr);
    this.cadopKit = await CadopIdentityKit.fromServiceDID(this.config.custodianDid);
    this.initialized = true;
    logger.info('CustodianService initialized', { custodianDid: this.config.custodianDid });
  }

  /**
   * Create a new Agent DID via CADOP protocol
   */
  async createAgentDIDViaCADOP(request: CreateAgentDIDRequest): Promise<AgentDIDCreationStatus> {
    try {
      // 1. Validate ID Token using the singleton instance
      const tokenPayload = await this.webauthnService.verifyIdToken(
        { id_token: request.idToken },
        this.config.custodianDid  // Verify we are the intended audience
      );

      // 2. Check daily mint quota
      await this.checkAndUpdateDailyMintQuota(tokenPayload.sub);

      // 3. Create status record
      const recordId = crypto.randomUUID();
      const status: AgentDIDCreationStatus = {
        status: 'processing',
        createdAt: new Date(),
        updatedAt: new Date(),
        userDid: request.userDid
      };
      this.didCreationRecords.set(recordId, status);

      // 4. Create DID Document
      const result = await this.cadopKit.createDID("rooch", request.userDid)

      if (!result.success) {
        status.status = 'failed';
        status.error = result.error;
      } else {
        status.status = 'completed';
        status.userDid = tokenPayload.sub;
        status.agentDid = result.didDocument?.id;
        status.transactionHash = result.transactionHash;
        
        // Update user DIDs mapping
        const userDids = this.userDids.get(tokenPayload.sub) || [];
        userDids.push(result.didDocument!.id);
        this.userDids.set(tokenPayload.sub, userDids);
      }

      status.updatedAt = new Date();
      this.didCreationRecords.set(recordId, status);
      return { ...status, id: recordId };

    } catch (error) {
      logger.error('Failed to create Agent DID', { error });
      throw error;
    }
  }

  /**
   * Check and update daily mint quota
   */
  private async checkAndUpdateDailyMintQuota(userId: string): Promise<void> {
    const now = new Date();
    if (this.isNewDay(now)) {
      this.dailyMintCount.clear();
      this.lastMintReset = now;
    }

    const currentCount = this.dailyMintCount.get(userId) || 0;
    if (currentCount >= this.config.maxDailyMints) {
      throw new Error('Daily mint quota exceeded');
    }

    this.dailyMintCount.set(userId, currentCount + 1);
  }

  private isNewDay(now: Date): boolean {
    return now.getDate() !== this.lastMintReset.getDate() ||
           now.getMonth() !== this.lastMintReset.getMonth() ||
           now.getFullYear() !== this.lastMintReset.getFullYear();
  }

  // Implement other required methods from the API routes
  async getDIDCreationStatus(recordId: string): Promise<AgentDIDCreationStatus | null> {
    return this.didCreationRecords.get(recordId) || null;
  }

  async getUserAgentDIDs(userId: string): Promise<string[]> {
    return this.userDids.get(userId) || [];
  }

  async resolveAgentDID(agentDid: string): Promise<DIDDocument | null> {
    return VDRRegistry.getInstance().resolveDID(agentDid);
  }

  async agentDIDExists(agentDid: string): Promise<boolean> {
    return VDRRegistry.getInstance().exists(agentDid);
  }
}

// Factory function for creating and initializing service
export async function createCustodianService(config: CustodianServiceConfig, webauthnService: WebAuthnService): Promise<CustodianService> {
  const service = new CustodianService(config, webauthnService);
  await service.initialize();
  return service;
}
