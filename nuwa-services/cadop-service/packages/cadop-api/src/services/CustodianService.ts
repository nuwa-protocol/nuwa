import {
  CreateAgentDIDRequest,
  AgentDIDCreationStatus,
  ExtendedIDTokenPayload,
} from '@cadop/shared';
import { VDRRegistry, DIDDocument, CadopIdentityKit } from '@nuwa-ai/identity-kit';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';
import { GasSubsidyService } from './GasSubsidyService.js';

import jwt from 'jsonwebtoken';

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
  private gasSubsidyService: GasSubsidyService;

  constructor(
    config: CustodianServiceConfig,
    cadopKit: CadopIdentityKit,
    gasSubsidyService: GasSubsidyService
  ) {
    this.config = config;
    this.didCreationRecords = new Map();
    this.userDids = new Map();
    this.dailyMintCount = new Map();
    this.lastMintReset = new Date();
    this.cadopKit = cadopKit;
    this.gasSubsidyService = gasSubsidyService;
  }

  /**
   * Create a new Agent DID via CADOP protocol
   */
  async createAgentDIDViaCADOP(request: CreateAgentDIDRequest): Promise<AgentDIDCreationStatus> {
    try {
      // 1. Decode and validate ID Token
      let tokenPayload: ExtendedIDTokenPayload;
      try {
        tokenPayload = jwt.decode(request.idToken) as ExtendedIDTokenPayload;
      } catch {
        throw new Error('Invalid idToken');
      }

      if (!tokenPayload || tokenPayload.aud !== this.config.cadopDid) {
        throw new Error(`Invalid token audience ${tokenPayload.aud} !== ${this.config.cadopDid}`);
      }

      if (!tokenPayload.sub) {
        throw new Error('Token missing subject');
      }

      logger.info('Processing CADOP request', {
        provider: tokenPayload.provider || 'webauthn',
        controllerDid: tokenPayload.sub,
        hasControllerPublicKey: !!tokenPayload.controllerPublicKeyMultibase,
      });

      // 2. Check daily mint quota
      await this.checkAndUpdateDailyMintQuota(tokenPayload.sub);

      // 3. Create status record
      const recordId = crypto.randomUUID();
      const status: AgentDIDCreationStatus = {
        status: 'processing',
        createdAt: new Date(),
        updatedAt: new Date(),
        userDid: request.userDid,
      };
      this.didCreationRecords.set(recordId, status);

      // 4. Route to appropriate DID creation method based on provider
      let result;
      const provider = tokenPayload.provider || 'webauthn';

      if (provider === 'bitcoin' || tokenPayload.sub.startsWith('did:bitcoin:')) {
        // Use controller-based CADOP creation for Bitcoin
        if (!tokenPayload.controllerPublicKeyMultibase || !tokenPayload.controllerVMType) {
          throw new Error(
            'Bitcoin provider requires controllerPublicKeyMultibase and controllerVMType'
          );
        }

        logger.info('Using controller-based CADOP creation for Bitcoin', {
          controllerDid: tokenPayload.sub,
          controllerVMType: tokenPayload.controllerVMType,
        });

        result = await this.cadopKit.createDIDWithController('rooch', tokenPayload.sub, {
          controllerPublicKeyMultibase: tokenPayload.controllerPublicKeyMultibase,
          controllerVMType: tokenPayload.controllerVMType,
          customScopes: undefined, // Could be configurable
        });
      } else if (
        tokenPayload.sub.startsWith('did:key:') &&
        !tokenPayload.controllerPublicKeyMultibase
      ) {
        // Backward compatible path for did:key without explicit public key
        logger.info('Using legacy CADOP creation for did:key', {
          userDid: request.userDid,
        });

        result = await this.cadopKit.createDID('rooch', request.userDid);
      } else {
        // Use controller-based CADOP creation for other cases
        logger.info('Using controller-based CADOP creation', {
          controllerDid: tokenPayload.sub,
          controllerVMType: tokenPayload.controllerVMType,
        });

        result = await this.cadopKit.createDIDWithController('rooch', tokenPayload.sub, {
          controllerPublicKeyMultibase: tokenPayload.controllerPublicKeyMultibase,
          controllerVMType: tokenPayload.controllerVMType,
          customScopes: undefined, // Could be configurable
        });
      }

      if (!result.success) {
        status.status = 'failed';
        status.error = result.error;
        logger.error('DID creation failed', {
          error: result.error,
          provider,
          controllerDid: tokenPayload.sub,
        });
      } else {
        status.status = 'completed';
        status.userDid = tokenPayload.sub;
        status.agentDid = result.didDocument?.id;
        status.transactionHash = result.transactionHash;
        status.subsidy = await this.gasSubsidyService.subsidizeAgentDid(result.didDocument!.id);
        logger.info('Agent DID subsidy result', {
          agentDid: result.didDocument?.id,
          attempted: status.subsidy.attempted,
          subsidyStatus: status.subsidy.status,
          amountRaw: status.subsidy.amountRaw,
          subsidyTxHash: status.subsidy.txHash,
          reason: status.subsidy.reason,
        });

        // Update user DIDs mapping
        const userDids = this.userDids.get(tokenPayload.sub) || [];
        userDids.push(result.didDocument!.id);
        this.userDids.set(tokenPayload.sub, userDids);

        logger.info('Agent DID created successfully', {
          provider,
          controllerDid: tokenPayload.sub,
          agentDid: result.didDocument?.id,
        });
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
    return (
      now.getDate() !== this.lastMintReset.getDate() ||
      now.getMonth() !== this.lastMintReset.getMonth() ||
      now.getFullYear() !== this.lastMintReset.getFullYear()
    );
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
