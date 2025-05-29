export interface CreateAgentDIDRequest {
  idToken: string;
  custodianServicePublicKeyMultibase: string;
  custodianServiceVMType: string;
  userDidKey?: string;
  additionalAuthMethods?: {
    provider: string;
    providerId: string;
    verifiedAt: Date;
  }[];
}

export interface AgentDIDCreationStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  did?: string;
  agentDid?: string;
  transactionHash?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
} 