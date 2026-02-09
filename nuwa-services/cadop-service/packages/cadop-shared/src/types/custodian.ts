export interface CreateAgentDIDRequest {
  idToken: string;
  userDid: string;
}

export interface AgentDIDSubsidyStatus {
  attempted: boolean;
  status: 'success' | 'failed' | 'skipped';
  amountRaw?: string;
  txHash?: string;
  reason?: string;
}

export interface AgentDIDCreationStatus {
  id?: string; // Record ID
  status: 'pending' | 'processing' | 'completed' | 'failed';
  userDid: string; // User's DID
  agentDid?: string; // Created Agent DID
  transactionHash?: string;
  subsidy?: AgentDIDSubsidyStatus;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
