import { supabase } from '../config/supabase.js';
import { Database } from '../config/supabase.js';

// Type aliases for easier use
type User = {
  id: string;
  user_did: string;
  email?: string;
  display_name?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
};

type UserInsert = Omit<User, 'id' | 'created_at' | 'updated_at'>;
type UserUpdate = Partial<UserInsert>;

type AuthMethod = Database['public']['Tables']['auth_methods']['Row'];
type AuthMethodInsert = Database['public']['Tables']['auth_methods']['Insert'];
type AuthMethodUpdate = Database['public']['Tables']['auth_methods']['Update'];

type AgentDID = Database['public']['Tables']['agent_dids']['Row'];
type AgentDIDInsert = Database['public']['Tables']['agent_dids']['Insert'];
type AgentDIDUpdate = Database['public']['Tables']['agent_dids']['Update'];

type Transaction = Database['public']['Tables']['transactions']['Row'];
type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];
type TransactionUpdate = Database['public']['Tables']['transactions']['Update'];

type ProofRequest = Database['public']['Tables']['proof_requests']['Row'];
type ProofRequestInsert = Database['public']['Tables']['proof_requests']['Insert'];
type ProofRequestUpdate = Database['public']['Tables']['proof_requests']['Update'];

type VerifiableCredential = Database['public']['Tables']['verifiable_credentials']['Row'];
type VerifiableCredentialInsert = Database['public']['Tables']['verifiable_credentials']['Insert'];

type Session = Database['public']['Tables']['sessions']['Row'];
type SessionInsert = Database['public']['Tables']['sessions']['Insert'];
type SessionUpdate = Database['public']['Tables']['sessions']['Update'];



export class DatabaseService {
  // User operations
  static async createUser(userData: UserInsert): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }

    return data;
  }

  static async getUserById(userId: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get user: ${error.message}`);
    }

    return data;
  }

  static async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get user by email: ${error.message}`);
    }

    return data;
  }

  static async getUserByDID(userDid: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_did', userDid)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get user by DID: ${error.message}`);
    }

    return data;
  }

  static async updateUser(userId: string, updates: UserUpdate): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }

    return data;
  }

  // Auth methods operations
  static async createAuthMethod(authData: AuthMethodInsert): Promise<AuthMethod> {
    const { data, error } = await supabase
      .from('auth_methods')
      .insert(authData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create auth method: ${error.message}`);
    }

    return data;
  }

  static async getUserAuthMethods(userId: string): Promise<AuthMethod[]> {
    const { data, error } = await supabase
      .from('auth_methods')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get user auth methods: ${error.message}`);
    }

    return data || [];
  }

  static async getAuthMethodByProvider(
    userId: string,
    provider: string,
    providerUserId: string
  ): Promise<AuthMethod | null> {
    const { data, error } = await supabase
      .from('auth_methods')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('provider_user_id', providerUserId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get auth method: ${error.message}`);
    }

    return data;
  }

  static async findUserByProviderIdentity(
    provider: string,
    providerUserId: string
  ): Promise<User | null> {
    const { data, error } = await supabase
      .from('auth_methods')
      .select(`
        user_id,
        users!inner(*)
      `)
      .eq('provider', provider)
      .eq('provider_user_id', providerUserId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to find user by provider identity: ${error.message}`);
    }

    return (data?.users as unknown as User) || null;
  }

  static async updateAuthMethod(authId: string, updates: AuthMethodUpdate): Promise<AuthMethod> {
    const { data, error } = await supabase
      .from('auth_methods')
      .update(updates)
      .eq('id', authId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update auth method: ${error.message}`);
    }

    return data;
  }

  // Agent DID operations
  static async createAgentDID(didData: AgentDIDInsert): Promise<AgentDID> {
    const { data, error } = await supabase
      .from('agent_dids')
      .insert(didData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create agent DID: ${error.message}`);
    }

    return data;
  }

  static async getUserAgentDIDs(userId: string): Promise<AgentDID[]> {
    const { data, error } = await supabase
      .from('agent_dids')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get user agent DIDs: ${error.message}`);
    }

    return data || [];
  }

  static async getAgentDIDByDID(agentDid: string): Promise<AgentDID | null> {
    const { data, error } = await supabase
      .from('agent_dids')
      .select('*')
      .eq('agent_did', agentDid)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get agent DID: ${error.message}`);
    }

    return data;
  }

  static async updateAgentDID(didId: string, updates: AgentDIDUpdate): Promise<AgentDID> {
    const { data, error } = await supabase
      .from('agent_dids')
      .update(updates)
      .eq('id', didId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update agent DID: ${error.message}`);
    }

    return data;
  }

  static async getUserConfirmedAgentDID(userId: string): Promise<AgentDID | null> {
    const { data, error } = await supabase
      .from('agent_dids')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .eq('blockchain_confirmed', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get user confirmed agent DID: ${error.message}`);
    }

    return data;
  }

  // Transaction operations
  static async createTransaction(txData: TransactionInsert): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .insert(txData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create transaction: ${error.message}`);
    }

    return data;
  }

  static async getTransactionByHash(txHash: string): Promise<Transaction | null> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('tx_hash', txHash)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get transaction: ${error.message}`);
    }

    return data;
  }

  static async updateTransaction(txId: string, updates: TransactionUpdate): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', txId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update transaction: ${error.message}`);
    }

    return data;
  }

  static async getUserTransactions(userId: string): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get user transactions: ${error.message}`);
    }

    return data || [];
  }

  // Proof request operations
  static async createProofRequest(proofData: ProofRequestInsert): Promise<ProofRequest> {
    const { data, error } = await supabase
      .from('proof_requests')
      .insert(proofData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create proof request: ${error.message}`);
    }

    return data;
  }

  static async getProofRequestById(requestId: string): Promise<ProofRequest | null> {
    const { data, error } = await supabase
      .from('proof_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get proof request: ${error.message}`);
    }

    return data;
  }

  static async getUserProofRequests(userId: string): Promise<ProofRequest[]> {
    const { data, error } = await supabase
      .from('proof_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get user proof requests: ${error.message}`);
    }

    return data || [];
  }

  static async updateProofRequest(
    requestId: string,
    updates: ProofRequestUpdate
  ): Promise<ProofRequest> {
    const { data, error } = await supabase
      .from('proof_requests')
      .update(updates)
      .eq('id', requestId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update proof request: ${error.message}`);
    }

    return data;
  }

  // Verifiable credentials operations
  static async createVerifiableCredential(vcData: VerifiableCredentialInsert): Promise<VerifiableCredential> {
    const { data, error } = await supabase
      .from('verifiable_credentials')
      .insert(vcData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create verifiable credential: ${error.message}`);
    }

    return data;
  }

  static async getVerifiableCredentialById(vcId: string): Promise<VerifiableCredential | null> {
    const { data, error } = await supabase
      .from('verifiable_credentials')
      .select('*')
      .eq('id', vcId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get verifiable credential: ${error.message}`);
    }

    return data;
  }

  static async getCredentialsBySubject(subjectDid: string): Promise<VerifiableCredential[]> {
    const { data, error } = await supabase
      .from('verifiable_credentials')
      .select('*')
      .eq('subject_did', subjectDid)
      .eq('status', 'active')
      .order('issued_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get credentials by subject: ${error.message}`);
    }

    return data || [];
  }

  static async getSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_token_hash', tokenHash)
      .gte('expires_at', new Date().toISOString())
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get session: ${error.message}`);
    }

    return data;
  }

  static async updateSession(sessionId: string, updates: SessionUpdate): Promise<Session> {
    const { data, error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update session: ${error.message}`);
    }

    return data;
  }

  static async deleteSession(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to delete session: ${error.message}`);
    }
  }

  static async deleteExpiredSessions(): Promise<number> {
    const { error } = await supabase.rpc('cleanup_expired_sessions');

    if (error) {
      throw new Error(`Failed to cleanup expired sessions: ${error.message}`);
    }

    return 0; // The function returns the count, but we'll simplify for now
  }

  // Utility methods
  static async calculateSybilLevel(userId: string): Promise<number> {
    // Get user auth methods
    const authMethods = await this.getUserAuthMethods(userId);
    
    let totalScore = 0;
    
    // Sum up sybil contributions from all verified auth methods
    for (const method of authMethods) {
      if (method.verified_at && method.sybil_contribution) {
        totalScore += method.sybil_contribution;
      }
    }

    // Convert to sybil level (0-3 scale)
    if (totalScore >= 75) return 3;
    if (totalScore >= 50) return 2;
    if (totalScore >= 25) return 1;
    return 0;
  }

} 