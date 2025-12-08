import type { APIClient } from './client';
import type { AgentDIDCreationStatus } from '@cadop/shared';

export interface CustodianMintRequest {
  idToken: string;
}

/**
 * Client for interacting with cadop-api custodian endpoints
 */
export class CustodianAPIClient {
  constructor(private apiClient: APIClient) {}

  /**
   * Create Agent DID via cadop-api custodian service
   */
  async mintAgentDID(idToken: string): Promise<AgentDIDCreationStatus> {
    const response = await this.apiClient.post<CustodianMintRequest, AgentDIDCreationStatus>(
      '/api/custodian/mint',
      { idToken }
    );
    return response;
  }
}
