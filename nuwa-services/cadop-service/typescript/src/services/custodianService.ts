import {
  DIDDocument,
  CADOPCreationRequest,
  DIDCreationResult,
  VDRInterface,
} from 'nuwa-identity-kit';
import { RoochClient } from '@roochnetwork/rooch-sdk';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { validateIdToken } from './oidcService';
import { calculateSybilLevel } from '../utils/sybilCalculator';

// Local types for DID operations
interface CADOPResult {
  success: boolean;
  didDocument?: DIDDocument;
  transactionHash?: string;
  error?: string;
}

// Mock VDR for development/testing
interface MockRoochVDR extends VDRInterface {
  resolve(did: string): Promise<DIDDocument | null>;
  exists(did: string): Promise<boolean>;
  getMethod(): string;
  create(request: any, options?: any): Promise<DIDCreationResult>;
  createViaCADOP(request: CADOPCreationRequest, options?: any): Promise<DIDCreationResult>;
  addVerificationMethod(did: string, verificationMethod: any, relationships?: any[], options?: any): Promise<boolean>;
  removeVerificationMethod(did: string, id: string, options?: any): Promise<boolean>;
  addService(did: string, service: any, options?: any): Promise<boolean>;
  removeService(did: string, id: string, options?: any): Promise<boolean>;
  updateRelationships(did: string, id: string, add: any[], remove: any[], options?: any): Promise<boolean>;
  updateController(did: string, controller: string | string[], options?: any): Promise<boolean>;
}

// Create Supabase service client
function createSupabaseServiceClient() {
  return createClient(
    process.env['SUPABASE_URL'] || '',
    process.env['SUPABASE_SERVICE_ROLE_KEY'] || ''
  );
}

export interface CADOPMintRequest {
  idToken: string;
  userDidKey?: string | undefined; // 明确允许 undefined
  custodianServicePublicKeyMultibase: string;
  custodianServiceVMType: string;
  additionalAuthMethods?: AuthMethod[] | undefined; // 明确允许 undefined
}

export interface AuthMethod {
  provider: string;
  providerId: string;
  verifiedAt: Date;
  metadata?: Record<string, any> | undefined; // 明确允许 undefined
}

export interface DIDCreationStatus {
  id: string;
  agentDid?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transactionHash?: string;
  blockchainConfirmed: boolean;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Custodian Service - DID custodial service based on @nuwa-identity-kit
 * Implements NIP-3 CADOP protocol to help users create and manage Agent DIDs
 */
export class CustodianService {
  private roochVDR: MockRoochVDR | null = null;
  private roochClient: RoochClient;
  private supabase: any;

  constructor() {
    this.supabase = createSupabaseServiceClient();
    
    // Initialize Rooch client
    const roochRpcUrl = process.env['ROOCH_NETWORK_URL'] || 'https://test-seed.rooch.network';
    this.roochClient = new RoochClient({ url: roochRpcUrl });
    
    this.initializeRoochVDR();
  }

  /**
   * Initialize Rooch VDR (Verifiable Data Registry)
   */
  private async initializeRoochVDR(): Promise<void> {
    try {
      // Create a mock/temporary VDR implementation for Rooch
      // In production, this would be replaced with the actual Rooch VDR
      this.roochVDR = this.createMockRoochVDR();

      logger.info('Rooch VDR initialized successfully', {
        roochNetworkUrl: process.env['ROOCH_NETWORK_URL'] || 'https://test-seed.rooch.network'
      });

    } catch (error) {
      logger.error('Failed to initialize Rooch VDR', { error });
      throw error;
    }
  }

  /**
   * Create a mock Rooch VDR for development/testing
   * TODO: Replace with actual Rooch VDR implementation
   */
  private createMockRoochVDR(): MockRoochVDR {
    return {
      async resolve(did: string): Promise<DIDDocument | null> {
        // Mock implementation - return null for now
        logger.info('Mock VDR resolve called', { did });
        return null;
      },

      async exists(did: string): Promise<boolean> {
        // Mock implementation - return false for now
        logger.info('Mock VDR exists called', { did });
        return false;
      },

      getMethod(): string {
        return 'rooch';
      },

      async create(request: any, options?: any): Promise<DIDCreationResult> {
        // Mock implementation
        logger.info('Mock VDR create called', { request });
        return {
          success: false,
          error: 'Mock VDR - create not implemented'
        };
      },

      async createViaCADOP(request: CADOPCreationRequest, options?: any): Promise<DIDCreationResult> {
        // Mock implementation for CADOP creation
        logger.info('Mock VDR createViaCADOP called', { request });
        
        const mockAgentDid = `did:rooch:${Date.now()}`;
        const mockTxHash = `0x${Math.random().toString(16).slice(2, 66)}`;
        
        // Simulate async blockchain operation
        await new Promise(resolve => setTimeout(resolve, 2000));

        return {
          success: true,
          didDocument: {
            '@context': 'https://www.w3.org/ns/did/v1',
            id: mockAgentDid,
            controller: request.userDidKey,
            verificationMethod: [{
              id: `${mockAgentDid}#key-1`,
              type: request.custodianServiceVMType,
              controller: mockAgentDid,
              publicKeyMultibase: request.custodianServicePublicKey
            }],
            authentication: [`${mockAgentDid}#key-1`]
          },
          transactionHash: mockTxHash
        };
      },

      async addVerificationMethod(): Promise<boolean> {
        return false;
      },

      async removeVerificationMethod(): Promise<boolean> {
        return false;
      },

      async addService(): Promise<boolean> {
        return false;
      },

      async removeService(): Promise<boolean> {
        return false;
      },

      async updateRelationships(): Promise<boolean> {
        return false;
      },

      async updateController(): Promise<boolean> {
        return false;
      }
    };
  }

  /**
   * Create Agent DID via CADOP protocol for user
   */
  async createAgentDIDViaCADOP(request: CADOPMintRequest): Promise<DIDCreationStatus> {
    try {
      // 1. Validate ID Token
      const tokenPayload = await validateIdToken(request.idToken);
      if (!tokenPayload) {
        throw new Error('Invalid ID token');
      }

      logger.info('Starting CADOP DID creation', {
        userId: tokenPayload.sub,
        userDidKey: request.userDidKey
      });

      // 2. Check Sybil level
      const sybilLevel = await this.calculateUserSybilLevel(
        tokenPayload.sub, 
        request.additionalAuthMethods || []
      );

      if (sybilLevel < 1) {
        throw new Error('Insufficient Sybil protection level');
      }

      // 3. Create database record (pending status)
      const { data: didRecord, error: dbError } = await this.supabase
        .from('agent_dids')
        .insert({
          user_id: tokenPayload.sub,
          controller_did: request.userDidKey || tokenPayload.did,
          sybil_level: sybilLevel,
          status: 'pending'
        })
        .select()
        .single();

      if (dbError) {
        logger.error('Failed to create DID record', { error: dbError });
        throw new Error('Database error');
      }

      // 4. Execute CADOP creation flow asynchronously
      this.executeCADOPCreation(didRecord.id, request, tokenPayload)
        .catch(error => {
          logger.error('CADOP creation failed', { 
            recordId: didRecord.id, 
            error 
          });
          
          // Update database status to failed
          this.supabase
            .from('agent_dids')
            .update({ 
              status: 'failed', 
              error: error.message,
              updated_at: new Date().toISOString()
            })
            .eq('id', didRecord.id)
            .then(({ error: updateError }: { error: any }) => {
              if (updateError) {
                logger.error('Failed to update failed status', { updateError });
              }
            });
        });

      return {
        id: didRecord.id,
        status: 'pending',
        blockchainConfirmed: false,
        createdAt: new Date(didRecord.created_at),
        updatedAt: new Date(didRecord.updated_at)
      };

    } catch (error) {
      logger.error('CADOP DID creation request failed', { error });
      throw error;
    }
  }

  /**
   * Execute actual CADOP creation flow
   */
  private async executeCADOPCreation(
    recordId: string, 
    request: CADOPMintRequest, 
    tokenPayload: any
  ): Promise<void> {
    try {
      if (!this.roochVDR) {
        throw new Error('Rooch VDR not initialized');
      }

      // Update status to processing
      await this.supabase
        .from('agent_dids')
        .update({ 
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', recordId);

      // Send realtime update
      await this.sendRealtimeUpdate(tokenPayload.sub, {
        recordId,
        status: 'processing',
        message: 'Creating Agent DID on blockchain...'
      });

      // Prepare CADOP creation request
      const cadopRequest: CADOPCreationRequest = {
        userDidKey: request.userDidKey || tokenPayload.did,
        custodianServicePublicKey: request.custodianServicePublicKeyMultibase,
        custodianServiceVMType: request.custodianServiceVMType,
        additionalClaims: {
          sybilLevel: await this.calculateUserSybilLevel(tokenPayload.sub, request.additionalAuthMethods || []),
          authMethods: request.additionalAuthMethods || []
        }
      };

      // Execute CADOP creation using Rooch VDR
      const result = await this.roochVDR.createViaCADOP(cadopRequest);

      if (!result.success || !result.didDocument) {
        throw new Error(result.error || 'Failed to create Agent DID');
      }

      // Update database with success
      await this.supabase
        .from('agent_dids')
        .update({
          agent_did: result.didDocument.id,
          status: 'completed',
          transaction_hash: result.transactionHash,
          blockchain_confirmed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordId);

      // Update user's primary Agent DID if this is their first
      await this.updateUserPrimaryAgentDID(tokenPayload.sub, result.didDocument.id);

      // Send realtime update
      await this.sendRealtimeUpdate(tokenPayload.sub, {
        recordId,
        status: 'completed',
        agentDid: result.didDocument.id,
        transactionHash: result.transactionHash,
        message: 'Agent DID created successfully!'
      });

      logger.info('CADOP DID creation completed', {
        recordId,
        agentDid: result.didDocument.id,
        transactionHash: result.transactionHash
      });

    } catch (error) {
      logger.error('CADOP creation execution failed', { recordId, error });
      throw error;
    }
  }

  /**
   * Get DID creation status
   */
  async getDIDCreationStatus(recordId: string): Promise<DIDCreationStatus | null> {
    try {
      const { data, error } = await this.supabase
        .from('agent_dids')
        .select('*')
        .eq('id', recordId)
        .single();

      if (error || !data) {
        logger.error('Failed to get DID creation status', { recordId, error });
        return null;
      }

      return {
        id: data.id,
        agentDid: data.agent_did,
        status: data.status,
        transactionHash: data.transaction_hash,
        blockchainConfirmed: data.blockchain_confirmed,
        error: data.error,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

    } catch (error) {
      logger.error('Error getting DID creation status', { error });
      return null;
    }
  }

  /**
   * Get user's Agent DIDs
   */
  async getUserAgentDIDs(userId: string): Promise<DIDCreationStatus[]> {
    try {
      const { data, error } = await this.supabase
        .from('agent_dids')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to get user Agent DIDs', { userId, error });
        return [];
      }

      return data.map((record: any) => ({
        id: record.id,
        agentDid: record.agent_did,
        status: record.status,
        transactionHash: record.transaction_hash,
        blockchainConfirmed: record.blockchain_confirmed,
        error: record.error,
        createdAt: new Date(record.created_at),
        updatedAt: new Date(record.updated_at)
      }));

    } catch (error) {
      logger.error('Error getting user Agent DIDs', { error });
      return [];
    }
  }

  /**
   * Resolve Agent DID
   */
  async resolveAgentDID(agentDid: string): Promise<DIDDocument | null> {
    try {
      if (!this.roochVDR) {
        throw new Error('Rooch VDR not initialized');
      }

      const didDocument = await this.roochVDR.resolve(agentDid);
      return didDocument;

    } catch (error) {
      logger.error('Failed to resolve Agent DID', { agentDid, error });
      return null;
    }
  }

  /**
   * Check if Agent DID exists
   */
  async agentDIDExists(agentDid: string): Promise<boolean> {
    try {
      if (!this.roochVDR) {
        return false;
      }

      return await this.roochVDR.exists(agentDid);

    } catch (error) {
      logger.error('Error checking Agent DID existence', { agentDid, error });
      return false;
    }
  }

  // Private helper methods

  private async calculateUserSybilLevel(
    userId: string, 
    additionalAuthMethods: AuthMethod[]
  ): Promise<number> {
    // Get user's authentication methods from database
    const { data: userAuthMethods } = await this.supabase
      .from('auth_methods')
      .select('*')
      .eq('user_id', userId);

    const allAuthMethods = [
      ...(userAuthMethods || []),
      ...additionalAuthMethods
    ];

    return calculateSybilLevel(allAuthMethods);
  }

  private getCustodianKeyId(): string {
    // TODO: Return Custodian's key ID
    return 'custodian-key-1';
  }

  private extractRoochAddress(agentDid: string): string {
    // Extract address from did:rooch:address format
    const parts = agentDid.split(':');
    return parts.length >= 3 ? (parts[2] || '') : '';
  }

  private async updateUserPrimaryAgentDID(userId: string, agentDid: string): Promise<void> {
    await this.supabase
      .from('user_profiles')
      .upsert({
        id: userId,
        primary_agent_did: agentDid,
        updated_at: new Date().toISOString()
      });
  }

  private async sendRealtimeUpdate(userId: string, update: any): Promise<void> {
    // Send Supabase Realtime update
    await this.supabase.channel(`user_${userId}`).send({
      type: 'broadcast',
      event: 'agent_did_update',
      payload: update
    });
  }
}

// Export singleton instance
export const custodianService = new CustodianService(); 