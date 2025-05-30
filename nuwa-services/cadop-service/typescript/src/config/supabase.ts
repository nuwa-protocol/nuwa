import { createClient } from '@supabase/supabase-js';
import { config } from './environment';

// Create Supabase client with service role key for server-side operations
export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Create Supabase client with anon key for client-side operations
export const supabaseClient = createClient(
  config.supabase.url,
  config.supabase.anonKey
);

// Database types based on new architecture
export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          user_did: string;
          primary_agent_did?: string;
          display_name?: string;
          avatar_url?: string;
          metadata: any;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_did: string;
          primary_agent_did?: string;
          display_name?: string;
          avatar_url?: string;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_did?: string;
          primary_agent_did?: string;
          display_name?: string;
          avatar_url?: string;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
        };
      };
      auth_methods: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          provider_user_id: string;
          provider_data: any;
          sybil_contribution: number;
          verified_at?: string;
          expires_at?: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          provider_user_id: string;
          provider_data?: any;
          sybil_contribution?: number;
          verified_at?: string;
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          provider_user_id?: string;
          provider_data?: any;
          sybil_contribution?: number;
          verified_at?: string;
          expires_at?: string;
          created_at?: string;
        };
      };
      agent_dids: {
        Row: {
          id: string;
          user_id: string;
          agent_did: string;
          controller_did: string;
          rooch_address: string;
          object_id?: string;
          did_document: any;
          sybil_level: number;
          status: string;
          transaction_hash?: string;
          blockchain_confirmed: boolean;
          block_height?: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          agent_did: string;
          controller_did: string;
          rooch_address: string;
          object_id?: string;
          did_document: any;
          sybil_level?: number;
          status?: string;
          transaction_hash?: string;
          blockchain_confirmed?: boolean;
          block_height?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          agent_did?: string;
          controller_did?: string;
          rooch_address?: string;
          object_id?: string;
          did_document?: any;
          sybil_level?: number;
          status?: string;
          transaction_hash?: string;
          blockchain_confirmed?: boolean;
          block_height?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          agent_did_id?: string;
          tx_hash: string;
          chain_id: string;
          operation_type: string;
          tx_data: any;
          status: string;
          block_info: any;
          created_at: string;
          confirmed_at?: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          agent_did_id?: string;
          tx_hash: string;
          chain_id?: string;
          operation_type: string;
          tx_data?: any;
          status?: string;
          block_info?: any;
          created_at?: string;
          confirmed_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          agent_did_id?: string;
          tx_hash?: string;
          chain_id?: string;
          operation_type?: string;
          tx_data?: any;
          status?: string;
          block_info?: any;
          created_at?: string;
          confirmed_at?: string;
        };
      };
      proof_requests: {
        Row: {
          id: string;
          user_id: string;
          claim_type: string;
          auth_method: string;
          status: string;
          request_data: any;
          response_data: any;
          callback_url?: string;
          created_at: string;
          completed_at?: string;
          expires_at?: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          claim_type: string;
          auth_method: string;
          status?: string;
          request_data?: any;
          response_data?: any;
          callback_url?: string;
          created_at?: string;
          completed_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          claim_type?: string;
          auth_method?: string;
          status?: string;
          request_data?: any;
          response_data?: any;
          callback_url?: string;
          created_at?: string;
          completed_at?: string;
          expires_at?: string;
        };
      };
      verifiable_credentials: {
        Row: {
          id: string;
          issuer_did: string;
          subject_did: string;
          credential_type: string;
          claims: any;
          proof: any;
          issued_at: string;
          expires_at?: string;
          status: string;
          proof_request_id?: string;
        };
        Insert: {
          id?: string;
          issuer_did: string;
          subject_did: string;
          credential_type: string;
          claims: any;
          proof: any;
          issued_at?: string;
          expires_at?: string;
          status?: string;
          proof_request_id?: string;
        };
        Update: {
          id?: string;
          issuer_did?: string;
          subject_did?: string;
          credential_type?: string;
          claims?: any;
          proof?: any;
          issued_at?: string;
          expires_at?: string;
          status?: string;
          proof_request_id?: string;
        };
      };
      oauth_clients: {
        Row: {
          id: string;
          client_id: string;
          client_secret_hash: string;
          name: string;
          redirect_uris: any;
          scopes: any;
          metadata: any;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          client_secret_hash: string;
          name: string;
          redirect_uris?: any;
          scopes?: any;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          client_secret_hash?: string;
          name?: string;
          redirect_uris?: any;
          scopes?: any;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
        };
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          client_id?: string;
          session_token_hash: string;
          access_token_hash?: string;
          refresh_token_hash?: string;
          session_data: any;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id?: string;
          session_token_hash: string;
          access_token_hash?: string;
          refresh_token_hash?: string;
          session_data?: any;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          session_token_hash?: string;
          access_token_hash?: string;
          refresh_token_hash?: string;
          session_data?: any;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      user_complete_profile: {
        Row: {
          id: string;
          email?: string;
          user_did: string;
          primary_agent_did?: string;
          display_name?: string;
          avatar_url?: string;
          metadata: any;
          created_at: string;
          updated_at: string;
          auth_created_at: string;
          last_sign_in_at?: string;
          auth_methods: any;
          agent_dids: any;
        };
      };
      public_did_documents: {
        Row: {
          did: string;
          did_document: any;
          rooch_address: string;
          object_id?: string;
          status: string;
          blockchain_confirmed: boolean;
          updated_at: string;
        };
      };
    };
    Functions: {
      cleanup_expired_sessions: {
        Args: {};
        Returns: number;
      };
      cleanup_expired_proof_requests: {
        Args: {};
        Returns: number;
      };
    };
    Enums: {
      user_status: 'active' | 'inactive' | 'suspended';
      did_status: 'pending' | 'creating' | 'confirmed' | 'failed';
      proof_status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
      identity_provider: 'email' | 'google' | 'github' | 'twitter' | 'apple' | 'webauthn';
    };
  };
} 