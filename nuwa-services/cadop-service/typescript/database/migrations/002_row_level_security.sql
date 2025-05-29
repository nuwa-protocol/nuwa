-- Row Level Security (RLS) Configuration
-- This sets up security policies to ensure users can only access their own data
-- Based on Supabase Auth integration

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_dids ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE proof_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifiable_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- User profiles table policies (extends Supabase auth.users)
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role can manage all profiles" ON user_profiles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Auth methods table policies
CREATE POLICY "Users can view own auth methods" ON auth_methods
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own auth methods" ON auth_methods
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own auth methods" ON auth_methods
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own auth methods" ON auth_methods
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all auth methods" ON auth_methods
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Agent DIDs table policies
CREATE POLICY "Users can view own Agent DIDs" ON agent_dids
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Agent DIDs" ON agent_dids
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Agent DIDs" ON agent_dids
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all Agent DIDs" ON agent_dids
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Public read access to confirmed Agent DIDs for DID resolution
CREATE POLICY "Public can read confirmed Agent DIDs" ON agent_dids
  FOR SELECT USING (status = 'confirmed');

-- Transactions table policies
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all transactions" ON transactions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Proof requests table policies
CREATE POLICY "Users can view own proof requests" ON proof_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all proof requests" ON proof_requests
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Verifiable credentials table policies
CREATE POLICY "Users can view credentials where they are the subject" ON verifiable_credentials
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND (user_profiles.user_did = subject_did OR user_profiles.primary_agent_did = subject_did)
    )
  );

CREATE POLICY "Service role can manage all credentials" ON verifiable_credentials
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Public read access to active credentials for verification
CREATE POLICY "Public can read active credentials" ON verifiable_credentials
  FOR SELECT USING (status = 'active');

-- OAuth clients table policies (admin only)
CREATE POLICY "Service role can manage oauth clients" ON oauth_clients
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Public read access to oauth client metadata (for OIDC discovery)
CREATE POLICY "Public can read oauth client metadata" ON oauth_clients
  FOR SELECT USING (true);

-- Sessions table policies
CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON sessions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all sessions" ON sessions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Create views for easier querying (with RLS automatically applied)
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

-- Enable RLS on the view (but allow public read via policy)
ALTER VIEW public_did_documents SET (security_barrier = true);

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