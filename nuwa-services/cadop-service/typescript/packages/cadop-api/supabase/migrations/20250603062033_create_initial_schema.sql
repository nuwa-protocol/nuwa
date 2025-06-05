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
    CREATE TYPE authenticator_attachment AS ENUM ('platform', 'cross-platform');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create schema_migrations table for tracking migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_did VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    display_name VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Agent DIDs table - Rooch Agent DIDs created for users
CREATE TABLE agent_dids (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL,
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
CREATE TABLE transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL,
    agent_did_id UUID,
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
CREATE TABLE proof_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL,
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
CREATE TABLE verifiable_credentials (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    issuer_did VARCHAR(255) NOT NULL,
    subject_did VARCHAR(255) NOT NULL,
    credential_type VARCHAR(100) NOT NULL,
    claims JSONB NOT NULL,
    proof JSONB NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active',
    proof_request_id UUID,
    
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

-- Authenticators table - stores WebAuthn credential info
CREATE TABLE authenticators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    credential_id VARCHAR(255) NOT NULL UNIQUE,
    credential_public_key TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    credential_device_type authenticator_attachment NOT NULL DEFAULT 'cross-platform',
    credential_backed_up BOOLEAN NOT NULL DEFAULT false,
    transports VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],
    friendly_name VARCHAR(255),
    aaguid VARCHAR(255),
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    authenticator_id UUID NOT NULL,
    access_token TEXT NOT NULL UNIQUE,
    refresh_token TEXT NOT NULL UNIQUE,
    access_token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    refresh_token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    CONSTRAINT sessions_access_token_expires_future CHECK (access_token_expires_at > created_at),
    CONSTRAINT sessions_refresh_token_expires_future CHECK (refresh_token_expires_at > created_at),
    CONSTRAINT sessions_refresh_expires_after_access CHECK (refresh_token_expires_at > access_token_expires_at)
);

-- WebAuthn challenges table - temporary storage for registration/authentication challenges
CREATE TABLE webauthn_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- user_id can be null for anonymous authentication attempts
    user_id UUID,
    challenge VARCHAR(255) NOT NULL UNIQUE,
    operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('registration', 'authentication')),
    client_data JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    -- Ensure challenge expiration is in the future
    CONSTRAINT webauthn_challenges_expires_at_future CHECK (expires_at > created_at),
    -- Ensure challenge is used only once
    CONSTRAINT webauthn_challenges_single_use CHECK (
        (used_at IS NULL) OR (used_at <= NOW())
    )
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS users_user_did_idx ON users(user_did);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email) WHERE email IS NOT NULL;

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

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_authenticator_id_idx ON sessions(authenticator_id);
CREATE INDEX IF NOT EXISTS sessions_access_token_idx ON sessions(access_token);
CREATE INDEX IF NOT EXISTS sessions_refresh_token_idx ON sessions(refresh_token);
CREATE INDEX IF NOT EXISTS sessions_access_expires_idx ON sessions(access_token_expires_at);
CREATE INDEX IF NOT EXISTS sessions_refresh_expires_idx ON sessions(refresh_token_expires_at);

CREATE INDEX IF NOT EXISTS authenticators_user_id_idx ON authenticators(user_id);
CREATE INDEX IF NOT EXISTS authenticators_credential_id_idx ON authenticators(credential_id);
CREATE INDEX IF NOT EXISTS authenticators_last_used_at_idx ON authenticators(last_used_at) WHERE last_used_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS authenticators_aaguid_idx ON authenticators(aaguid) WHERE aaguid IS NOT NULL;

CREATE INDEX IF NOT EXISTS webauthn_challenges_user_id_idx ON webauthn_challenges(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS webauthn_challenges_challenge_idx ON webauthn_challenges(challenge);
CREATE INDEX IF NOT EXISTS webauthn_challenges_operation_type_idx ON webauthn_challenges(operation_type);
CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_at_idx ON webauthn_challenges(expires_at);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_dids ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE proof_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifiable_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE authenticators ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- Create helper functions for RLS
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_user_id', TRUE)::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_is_service()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN current_setting('app.is_service_role', TRUE)::BOOLEAN;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RLS policies
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (id = current_user_id());
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (id = current_user_id());
CREATE POLICY "Service role can manage all users" ON users FOR ALL USING (current_user_is_service());

CREATE POLICY "Users can view own Agent DIDs" ON agent_dids FOR SELECT USING (user_id = current_user_id());
CREATE POLICY "Users can insert own Agent DIDs" ON agent_dids FOR INSERT WITH CHECK (user_id = current_user_id());
CREATE POLICY "Users can update own Agent DIDs" ON agent_dids FOR UPDATE USING (user_id = current_user_id());
CREATE POLICY "Service role can manage all Agent DIDs" ON agent_dids FOR ALL USING (current_user_is_service());
CREATE POLICY "Public can read confirmed Agent DIDs" ON agent_dids FOR SELECT USING (status = 'confirmed');

CREATE POLICY "Users can view own transactions" ON transactions FOR SELECT USING (user_id = current_user_id());
CREATE POLICY "Service role can manage all transactions" ON transactions FOR ALL USING (current_user_is_service());

CREATE POLICY "Users can view own proof requests" ON proof_requests FOR SELECT USING (user_id = current_user_id());
CREATE POLICY "Service role can manage all proof requests" ON proof_requests FOR ALL USING (current_user_is_service());

CREATE POLICY "Users can view credentials where they are the subject" ON verifiable_credentials FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = current_user_id() 
        AND (users.user_did = subject_did)
    )
);
CREATE POLICY "Service role can manage all credentials" ON verifiable_credentials FOR ALL USING (current_user_is_service());
CREATE POLICY "Public can read active credentials" ON verifiable_credentials FOR SELECT USING (status = 'active');

CREATE POLICY "Users can view own sessions" ON sessions FOR SELECT USING (user_id = current_user_id());
CREATE POLICY "Users can delete own sessions" ON sessions FOR DELETE USING (user_id = current_user_id());
CREATE POLICY "Service role can manage all sessions" ON sessions FOR ALL USING (current_user_is_service());

CREATE POLICY "Users can view own authenticators" ON authenticators FOR SELECT USING (user_id = current_user_id());
CREATE POLICY "Users can manage own authenticators" ON authenticators FOR ALL USING (user_id = current_user_id());
CREATE POLICY "Service role can manage all authenticators" ON authenticators FOR ALL USING (current_user_is_service());

CREATE POLICY "Users can view own challenges" ON webauthn_challenges FOR SELECT USING (user_id = current_user_id());
CREATE POLICY "Service role can manage all challenges" ON webauthn_challenges FOR ALL USING (current_user_is_service());

-- Create triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_dids_updated_at 
    BEFORE UPDATE ON agent_dids 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at 
    BEFORE UPDATE ON sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_authenticators_updated_at 
    BEFORE UPDATE ON authenticators 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webauthn_challenges_updated_at 
    BEFORE UPDATE ON webauthn_challenges 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create cleanup functions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions 
    WHERE refresh_token_expires_at < NOW();
    
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

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Enable realtime for specific tables
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_dids;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE proof_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE verifiable_credentials;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE authenticators;
ALTER PUBLICATION supabase_realtime ADD TABLE webauthn_challenges;


-- Create test table for repository testing
CREATE TABLE test_table (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS test_table_name_idx ON test_table(name);

-- Enable RLS
ALTER TABLE test_table ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Service role can manage all test data" ON test_table FOR ALL USING (current_user_is_service());

-- Create trigger for updated_at
CREATE TRIGGER update_test_table_updated_at 
    BEFORE UPDATE ON test_table 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 