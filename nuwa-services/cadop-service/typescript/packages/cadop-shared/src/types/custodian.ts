export interface CreateAgentDIDRequest {
  idToken: string;
  userDid: string;
}

export interface AgentDIDCreationStatus {
  id?: string; // Record ID
  status: 'pending' | 'processing' | 'completed' | 'failed';
  userDid: string; // User's DID
  agentDid?: string; // Created Agent DID
  transactionHash?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
