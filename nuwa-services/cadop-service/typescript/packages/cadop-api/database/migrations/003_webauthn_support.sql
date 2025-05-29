-- CADOP Service WebAuthn/Passkey Support Migration
-- This adds tables to support WebAuthn authentication

-- Create WebAuthn-specific types
DO $$ BEGIN
    CREATE TYPE authenticator_transport AS ENUM ('usb', 'nfc', 'ble', 'internal', 'hybrid');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Authenticators table - stores WebAuthn credential info
CREATE TABLE IF NOT EXISTS authenticators (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credential_id BYTEA NOT NULL UNIQUE,
    credential_public_key BYTEA NOT NULL,
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
    challenge BYTEA NOT NULL UNIQUE,
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

-- Create indexes for WebAuthn tables
CREATE INDEX IF NOT EXISTS authenticators_user_id_idx ON authenticators(user_id);
CREATE INDEX IF NOT EXISTS authenticators_credential_id_idx ON authenticators(credential_id);
CREATE INDEX IF NOT EXISTS authenticators_last_used_at_idx ON authenticators(last_used_at) WHERE last_used_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS authenticators_aaguid_idx ON authenticators(aaguid) WHERE aaguid IS NOT NULL;

CREATE INDEX IF NOT EXISTS webauthn_challenges_user_id_idx ON webauthn_challenges(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS webauthn_challenges_challenge_idx ON webauthn_challenges(challenge);
CREATE INDEX IF NOT EXISTS webauthn_challenges_operation_type_idx ON webauthn_challenges(operation_type);
CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_at_idx ON webauthn_challenges(expires_at);

-- Add trigger for updated_at
CREATE TRIGGER update_authenticators_updated_at 
    BEFORE UPDATE ON authenticators 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to cleanup expired WebAuthn challenges
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

-- Function to cleanup unused challenges older than 1 hour
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