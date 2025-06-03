import { apiClient } from '../lib/api/client';
import type { CreateAgentDIDRequest, AgentDIDCreationStatus } from '@cadop/shared/types';

interface AgentDIDResponse {
  recordId: string;
  agentDid: string;
}

export interface CustodianService {
  createAgentDIDViaCADOP(request: CreateAgentDIDRequest): Promise<string>;
  getDIDCreationStatus(recordId: string): Promise<AgentDIDCreationStatus>;
  getUserAgentDIDs(userId: string): Promise<string[]>;
  resolveAgentDID(did: string): Promise<any>;
  agentDIDExists(did: string): Promise<boolean>;
}

class CustodianServiceImpl implements CustodianService {
  private static instance: CustodianServiceImpl;
  private baseUrl: string;

  private constructor() {
    this.baseUrl = '/api/custodian';
  }

  public static getInstance(): CustodianServiceImpl {
    if (!CustodianServiceImpl.instance) {
      CustodianServiceImpl.instance = new CustodianServiceImpl();
    }
    return CustodianServiceImpl.instance;
  }

  async createAgentDIDViaCADOP(request: CreateAgentDIDRequest): Promise<string> {
    const response = await apiClient.post<AgentDIDResponse>('/api/custodian/agent-did', request);
    
    if (response.error) {
      throw new Error(`Failed to create agent DID: ${response.error.message}`);
    }

    return response.data!.recordId;
  }

  async getDIDCreationStatus(recordId: string): Promise<AgentDIDCreationStatus> {
    const response = await fetch(`${this.baseUrl}/agent-did/${recordId}/status`);

    if (!response.ok) {
      throw new Error('Failed to get DID creation status');
    }

    return await response.json();
  }

  async getUserAgentDIDs(userId: string): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/users/${userId}/agent-dids`);

    if (!response.ok) {
      throw new Error('Failed to get user agent DIDs');
    }

    const data = await response.json();
    return data.dids;
  }

  async resolveAgentDID(did: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/agent-did/${encodeURIComponent(did)}`);

    if (!response.ok) {
      throw new Error('Failed to resolve agent DID');
    }

    return await response.json();
  }

  async agentDIDExists(did: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/agent-did/${encodeURIComponent(did)}/exists`);

    if (!response.ok) {
      throw new Error('Failed to check agent DID existence');
    }

    const data = await response.json();
    return data.exists;
  }
}

export const custodianService = CustodianServiceImpl.getInstance(); 