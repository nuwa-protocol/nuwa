-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types/enums
DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE did_status AS ENUM ('pending', 'creating', 'confirmed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE proof_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE identity_provider AS ENUM ('email', 'google', 'github', 'twitter', 'apple', 'webauthn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE authenticator_transport AS ENUM ('usb', 'nfc', 'ble', 'internal', 'hybrid');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create schema_migrations table for tracking migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User profiles table - extends Supabase auth.users
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    user_did VARCHAR(255) NOT NULL,
    primary_agent_did VARCHAR(255),
    display_name VARCHAR(255),
    avatar_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT user_profiles_user_did_unique UNIQUE (user_did),
    CONSTRAINT user_profiles_primary_agent_did_unique UNIQUE (primary_agent_did)
);

-- Auth methods table - OAuth/Web2 identities linked to users
CREATE TABLE IF NOT EXISTS auth_methods (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider identity_provider NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    provider_data JSONB DEFAULT '{}',
    sybil_contribution INTEGER DEFAULT 0 CHECK (sybil_contribution >= 0 AND sybil_contribution <= 100),
    verified_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique provider identity per user
    UNIQUE(user_id, provider, provider_user_id),
    -- Ensure unique provider identity globally
    UNIQUE(provider, provider_user_id)
);

-- Agent DIDs table - Rooch Agent DIDs created for users
CREATE TABLE IF NOT EXISTS agent_dids (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_did VARCHAR(255) NOT NULL UNIQUE,
    controller_did VARCHAR(255) NOT NULL,
    rooch_address VARCHAR(255) NOT NULL UNIQUE,
    object_id VARCHAR(255) UNIQUE,
    did_document JSONB NOT NULL,
    sybil_level INTEGER DEFAULT 0 CHECK (sybil_level >= 0 AND sybil_level <= 3),
    status did_status DEFAULT 'pending',
    transaction_hash VARCHAR(255),
    blockchain_confirmed BOOLEAN DEFAULT FALSE,
    block_height BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT agent_dids_agent_did_format CHECK (agent_did LIKE 'did:rooch:%'),
    CONSTRAINT agent_dids_controller_did_format CHECK (
        controller_did LIKE 'did:rooch:%' OR 
        controller_did LIKE 'did:key:%'
    ),
    CONSTRAINT agent_dids_rooch_address_unique UNIQUE (rooch_address),
    CONSTRAINT agent_dids_object_id_unique UNIQUE (object_id)
);

-- Transactions table - blockchain transaction tracking
CREATE TABLE IF NOT EXISTS transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_did_id UUID REFERENCES agent_dids(id) ON DELETE SET NULL,
    tx_hash VARCHAR(255) NOT NULL UNIQUE,
    chain_id VARCHAR(50) NOT NULL DEFAULT 'rooch-testnet',
    operation_type VARCHAR(100) NOT NULL,
    tx_data JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending',
    block_info JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT transactions_tx_hash_format CHECK (tx_hash LIKE '0x%')
);

-- Proof requests table - Web2 proof requests and VCs
CREATE TABLE IF NOT EXISTS proof_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    claim_type VARCHAR(100) NOT NULL,
    auth_method VARCHAR(50) NOT NULL,
    status proof_status DEFAULT 'pending',
    request_data JSONB DEFAULT '{}',
    response_data JSONB DEFAULT '{}',
    callback_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Check expiration is in the future
    CONSTRAINT proof_requests_expires_at_future CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Verifiable credentials table - issued VCs
CREATE TABLE IF NOT EXISTS verifiable_credentials (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    issuer_did VARCHAR(255) NOT NULL,
    subject_did VARCHAR(255) NOT NULL,
    credential_type VARCHAR(100) NOT NULL,
    claims JSONB NOT NULL,
    proof JSONB NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active',
    proof_request_id UUID REFERENCES proof_requests(id) ON DELETE SET NULL,
    
    CONSTRAINT vc_issuer_did_format CHECK (
        issuer_did LIKE 'did:rooch:%' OR 
        issuer_did LIKE 'did:key:%' OR
        issuer_did LIKE 'did:web:%'
    ),
    CONSTRAINT vc_subject_did_format CHECK (
        subject_did LIKE 'did:rooch:%' OR 
        subject_did LIKE 'did:key:%'
    )
);

-- OAuth clients table - OIDC client management
CREATE TABLE IF NOT EXISTS oauth_clients (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id VARCHAR(255) NOT NULL UNIQUE,
    client_secret_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    redirect_uris JSONB NOT NULL DEFAULT '[]',
    scopes JSONB NOT NULL DEFAULT '["openid"]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT oauth_clients_client_id_format CHECK (LENGTH(client_id) >= 8)
);

-- Sessions table - user authentication sessions (extends Supabase auth)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES oauth_clients(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(255) NOT NULL UNIQUE,
    access_token_hash VARCHAR(255),
    refresh_token_hash VARCHAR(255),
    session_data JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure expiration is in the future
    CONSTRAINT sessions_expires_at_future CHECK (expires_at > created_at)
);

-- Authenticators table - stores WebAuthn credential info
CREATE TABLE IF NOT EXISTS authenticators (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credential_id VARCHAR(255) NOT NULL UNIQUE,
    credential_public_key VARCHAR(1024) NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    credential_device_type VARCHAR(50) NOT NULL DEFAULT 'singleDevice',
    credential_backed_up BOOLEAN NOT NULL DEFAULT false,
    transports authenticator_transport[] DEFAULT ARRAY[]::authenticator_transport[],
    friendly_name VARCHAR(255),
    aaguid UUID,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure credential_id uniqueness across the system
    CONSTRAINT authenticators_credential_id_unique UNIQUE (credential_id)
);

-- WebAuthn challenges table - temporary storage for registration/authentication challenges
CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    challenge VARCHAR(255) NOT NULL UNIQUE,
    operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('registration', 'authentication')),
    client_data JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure challenge expiration is in the future
    CONSTRAINT webauthn_challenges_expires_at_future CHECK (expires_at > created_at),
    -- Ensure challenge is used only once
    CONSTRAINT webauthn_challenges_single_use CHECK (
        (used_at IS NULL) OR (used_at <= NOW())
    )
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS user_profiles_user_did_idx ON user_profiles(user_did);
CREATE INDEX IF NOT EXISTS user_profiles_primary_agent_did_idx ON user_profiles(primary_agent_did) WHERE primary_agent_did IS NOT NULL;

CREATE INDEX IF NOT EXISTS auth_methods_user_id_idx ON auth_methods(user_id);
CREATE INDEX IF NOT EXISTS auth_methods_provider_idx ON auth_methods(provider);
CREATE INDEX IF NOT EXISTS auth_methods_provider_user_id_idx ON auth_methods(provider_user_id);
CREATE INDEX IF NOT EXISTS auth_methods_verified_at_idx ON auth_methods(verified_at) WHERE verified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_dids_user_id_idx ON agent_dids(user_id);
CREATE INDEX IF NOT EXISTS agent_dids_controller_did_idx ON agent_dids(controller_did);
CREATE INDEX IF NOT EXISTS agent_dids_status_idx ON agent_dids(status);
CREATE INDEX IF NOT EXISTS agent_dids_sybil_level_idx ON agent_dids(sybil_level);
CREATE INDEX IF NOT EXISTS agent_dids_transaction_hash_idx ON agent_dids(transaction_hash) WHERE transaction_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions(user_id);
CREATE INDEX IF NOT EXISTS transactions_agent_did_id_idx ON transactions(agent_did_id) WHERE agent_did_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_operation_type_idx ON transactions(operation_type);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at);

CREATE INDEX IF NOT EXISTS proof_requests_user_id_idx ON proof_requests(user_id);
CREATE INDEX IF NOT EXISTS proof_requests_claim_type_idx ON proof_requests(claim_type);
CREATE INDEX IF NOT EXISTS proof_requests_status_idx ON proof_requests(status);
CREATE INDEX IF NOT EXISTS proof_requests_created_at_idx ON proof_requests(created_at);
CREATE INDEX IF NOT EXISTS proof_requests_expires_at_idx ON proof_requests(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS verifiable_credentials_issuer_did_idx ON verifiable_credentials(issuer_did);
CREATE INDEX IF NOT EXISTS verifiable_credentials_subject_did_idx ON verifiable_credentials(subject_did);
CREATE INDEX IF NOT EXISTS verifiable_credentials_credential_type_idx ON verifiable_credentials(credential_type);
CREATE INDEX IF NOT EXISTS verifiable_credentials_status_idx ON verifiable_credentials(status);
CREATE INDEX IF NOT EXISTS verifiable_credentials_proof_request_id_idx ON verifiable_credentials(proof_request_id) WHERE proof_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS oauth_clients_client_id_idx ON oauth_clients(client_id);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_client_id_idx ON sessions(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_session_token_hash_idx ON sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS authenticators_user_id_idx ON authenticators(user_id);
CREATE INDEX IF NOT EXISTS authenticators_credential_id_idx ON authenticators(credential_id);
CREATE INDEX IF NOT EXISTS authenticators_last_used_at_idx ON authenticators(last_used_at) WHERE last_used_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS authenticators_aaguid_idx ON authenticators(aaguid) WHERE aaguid IS NOT NULL;

CREATE INDEX IF NOT EXISTS webauthn_challenges_user_id_idx ON webauthn_challenges(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS webauthn_challenges_challenge_idx ON webauthn_challenges(challenge);
CREATE INDEX IF NOT EXISTS webauthn_challenges_operation_type_idx ON webauthn_challenges(operation_type);
CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_at_idx ON webauthn_challenges(expires_at);

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_dids ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE proof_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifiable_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE authenticators ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Service role can manage all profiles" ON user_profiles FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view own auth methods" ON auth_methods FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own auth methods" ON auth_methods FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own auth methods" ON auth_methods FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own auth methods" ON auth_methods FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage all auth methods" ON auth_methods FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view own Agent DIDs" ON agent_dids FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own Agent DIDs" ON agent_dids FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own Agent DIDs" ON agent_dids FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage all Agent DIDs" ON agent_dids FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Public can read confirmed Agent DIDs" ON agent_dids FOR SELECT USING (status = 'confirmed');

CREATE POLICY "Users can view own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage all transactions" ON transactions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view own proof requests" ON proof_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage all proof requests" ON proof_requests FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view credentials where they are the subject" ON verifiable_credentials FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND (user_profiles.user_did = subject_did OR user_profiles.primary_agent_did = subject_did)
    )
);
CREATE POLICY "Service role can manage all credentials" ON verifiable_credentials FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Public can read active credentials" ON verifiable_credentials FOR SELECT USING (status = 'active');

CREATE POLICY "Service role can manage oauth clients" ON oauth_clients FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Public can read oauth client metadata" ON oauth_clients FOR SELECT USING (true);

CREATE POLICY "Users can view own sessions" ON sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON sessions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage all sessions" ON sessions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view own authenticators" ON authenticators FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own authenticators" ON authenticators FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage all authenticators" ON authenticators FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view own challenges" ON webauthn_challenges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage all challenges" ON webauthn_challenges FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Create views for easier querying
CREATE OR REPLACE VIEW user_complete_profile AS
  SELECT 
    up.id,
    au.email,
    up.user_did,
    up.primary_agent_did,
    up.display_name,
    up.avatar_url,
    up.metadata,
    up.created_at,
    up.updated_at,
    au.created_at as auth_created_at,
    au.last_sign_in_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'provider', am.provider,
          'provider_user_id', am.provider_user_id,
          'sybil_contribution', am.sybil_contribution,
          'verified_at', am.verified_at
        )
      ) FILTER (WHERE am.id IS NOT NULL), 
      '[]'::jsonb
    ) as auth_methods,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'agent_did', ad.agent_did,
          'controller_did', ad.controller_did,
          'rooch_address', ad.rooch_address,
          'status', ad.status,
          'sybil_level', ad.sybil_level,
          'created_at', ad.created_at,
          'blockchain_confirmed', ad.blockchain_confirmed
        )
      ) FILTER (WHERE ad.id IS NOT NULL), 
      '[]'::jsonb
    ) as agent_dids
  FROM user_profiles up
  LEFT JOIN auth.users au ON up.id = au.id
  LEFT JOIN auth_methods am ON up.id = am.user_id
  LEFT JOIN agent_dids ad ON up.id = ad.user_id
  GROUP BY up.id, up.user_did, up.primary_agent_did, up.display_name, up.avatar_url, 
           up.metadata, up.created_at, up.updated_at, au.email, au.created_at, au.last_sign_in_at;

-- Enable RLS on the view
ALTER VIEW user_complete_profile SET (security_barrier = true);

-- Create view for DID resolution (public access)
CREATE OR REPLACE VIEW public_did_documents AS
  SELECT 
    agent_did as did,
    did_document,
    rooch_address,
    object_id,
    status,
    blockchain_confirmed,
    updated_at
  FROM agent_dids 
  WHERE status = 'confirmed' AND blockchain_confirmed = true;

-- Enable RLS on the view
ALTER VIEW public_did_documents SET (security_barrier = true);

-- Create triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at 
    BEFORE UPDATE ON user_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_dids_updated_at 
    BEFORE UPDATE ON agent_dids 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_clients_updated_at 
    BEFORE UPDATE ON oauth_clients 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at 
    BEFORE UPDATE ON sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_authenticators_updated_at 
    BEFORE UPDATE ON authenticators 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create cleanup functions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_proof_requests()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    UPDATE proof_requests 
    SET status = 'expired'
    WHERE status IN ('pending', 'processing')
    AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_webauthn_challenges()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM webauthn_challenges 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_webauthn_challenges()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM webauthn_challenges 
    WHERE created_at < NOW() - INTERVAL '1 hour' AND used_at IS NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create primary agent DID constraint check
CREATE OR REPLACE FUNCTION check_primary_agent_did_constraint()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.primary_agent_did IS NOT NULL THEN
        -- Check if the primary_agent_did exists in agent_dids table
        IF NOT EXISTS (
            SELECT 1 FROM agent_dids 
            WHERE agent_did = NEW.primary_agent_did 
            AND user_id = NEW.id
            AND status = 'confirmed'
        ) THEN
            RAISE EXCEPTION 'Primary agent DID must be a confirmed DID owned by the user';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_primary_agent_did_constraint_trigger
    BEFORE INSERT OR UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION check_primary_agent_did_constraint();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Grant permissions on views
GRANT SELECT ON user_complete_profile TO authenticated, service_role;
GRANT SELECT ON public_did_documents TO anon, authenticated, service_role;

-- Enable realtime for specific tables
ALTER PUBLICATION supabase_realtime ADD TABLE user_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE auth_methods;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_dids;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE proof_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE verifiable_credentials;
