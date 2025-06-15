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
  createVDR,
  LocalSigner
} from 'nuwa-identity-kit';
import { logger } from '../utils/logger.js';
import roochSdk from '@roochnetwork/rooch-sdk';
import type { Secp256k1Keypair as Secp256k1KeypairType } from '@roochnetwork/rooch-sdk';
const { Secp256k1Keypair } = roochSdk;

import jwt from 'jsonwebtoken';
import { WebAuthnService } from './WebAuthnService.js';

export interface CustodianServiceConfig {
  cadopDid: string;
  maxDailyMints: number;
}

export class CustodianService {
  private cadopKit: CadopIdentityKit;
  private didCreationRecords: Map<string, AgentDIDCreationStatus>;
  private userDids: Map<string, string[]>;
  private dailyMintCount: Map<string, number>;
  private lastMintReset: Date;
  private config: CustodianServiceConfig;
  private webauthnService: WebAuthnService;

  constructor(config: CustodianServiceConfig, webauthnService: WebAuthnService, cadopKit: CadopIdentityKit) {
    this.config = config;
    this.didCreationRecords = new Map();
    this.userDids = new Map();
    this.dailyMintCount = new Map();
    this.lastMintReset = new Date();
    this.webauthnService = webauthnService;
    this.cadopKit = cadopKit;
  }

  /**
   * Create a new Agent DID via CADOP protocol
   */
  async createAgentDIDViaCADOP(request: CreateAgentDIDRequest): Promise<AgentDIDCreationStatus> {
    try {
      // 1. Simplified ID Token validation: just decode & check audience
      let tokenPayload: any;
      try {
        tokenPayload = jwt.decode(request.idToken) as any;
      } catch {
        throw new Error('Invalid idToken');
      }

      if (!tokenPayload || tokenPayload.aud !== this.config.cadopDid) {
        throw new Error(`Invalid token audience ${tokenPayload.aud} !== ${this.config.cadopDid}`);
      }

      if (!tokenPayload.sub) {
        throw new Error('Token missing subject');
      }

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

  async getUserAgentDIDs(userDid: string): Promise<string[]> {
    return this.userDids.get(userDid) || [];
  }

  async resolveAgentDID(agentDid: string): Promise<DIDDocument | null> {
    return VDRRegistry.getInstance().resolveDID(agentDid);
  }

  async agentDIDExists(agentDid: string): Promise<boolean> {
    return VDRRegistry.getInstance().exists(agentDid);
  }
}

