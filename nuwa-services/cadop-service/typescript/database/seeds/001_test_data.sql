-- Test Data Seed File
-- This creates sample data for development and testing
-- Based on Supabase Auth integration

-- Note: In real Supabase environment, users would be created through auth.users table
-- For testing, we assume these users exist in auth.users table

-- Insert test user profiles (extending auth.users)
INSERT INTO user_profiles (id, user_did, primary_agent_did, display_name, avatar_url, metadata) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'did:rooch:rooch1abc123def456ghi789jkl012mno345pqr678stu', 'did:rooch:rooch1xyz789abc012def345ghi678jkl901mno234pqr', 'Alice Johnson', 'https://avatar.url/alice.png', '{"wallet_type": "rooch", "has_hardware_wallet": true}'),
  ('550e8400-e29b-41d4-a716-446655440002', 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', 'did:rooch:rooch1mno345pqr678stu901vwx234yza567bcd890efg', 'Bob Smith', 'https://avatar.url/bob.png', '{"auth_method": "passkey", "device_type": "mobile"}'),
  ('550e8400-e29b-41d4-a716-446655440003', 'did:rooch:rooch1def456ghi789jkl012mno345pqr678stu901vwx', 'did:rooch:rooch1pqr678stu901vwx234yza567bcd890efg123hij', 'Charlie Brown', 'https://avatar.url/charlie.png', '{"wallet_type": "metamask", "connected": true}'),
  ('550e8400-e29b-41d4-a716-446655440004', 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH', NULL, 'Anonymous User', NULL, '{"verified": false, "anonymous": true}')
ON CONFLICT (id) DO NOTHING;

-- Insert test auth methods
INSERT INTO auth_methods (user_id, provider, provider_user_id, provider_data, sybil_contribution, verified_at) VALUES
  -- Alice's auth methods (has Rooch wallet)
  ('550e8400-e29b-41d4-a716-446655440001', 'google', 'google_alice_123', '{"email": "alice@gmail.com", "name": "Alice Johnson", "picture": "https://avatar.url/alice.png", "verified_email": true}', 30, NOW()),
  ('550e8400-e29b-41d4-a716-446655440001', 'github', 'alice_github', '{"login": "alicej", "followers": 150, "public_repos": 25, "account_age_days": 1200}', 25, NOW()),
  ('550e8400-e29b-41d4-a716-446655440001', 'twitter', 'alice_twitter', '{"username": "alice_dev", "followers_count": 1200, "verified": true, "account_age_days": 800}', 20, NOW()),
  
  -- Bob's auth methods (CADOP user with Passkey)
  ('550e8400-e29b-41d4-a716-446655440002', 'webauthn', 'webauthn_bob_001', '{"device_name": "iPhone TouchID", "counter": 1, "device_type": "mobile", "authenticator_type": "platform"}', 10, NOW()),
  ('550e8400-e29b-41d4-a716-446655440002', 'google', 'google_bob_456', '{"email": "bob@gmail.com", "name": "Bob Smith", "verified_email": true}', 30, NOW()),
  ('550e8400-e29b-41d4-a716-446655440002', 'github', 'bob_github', '{"login": "bobsmith", "followers": 80, "public_repos": 15, "account_age_days": 600}', 25, NOW()),
  
  -- Charlie's auth methods (has Rooch wallet + social)
  ('550e8400-e29b-41d4-a716-446655440003', 'google', 'google_charlie_789', '{"email": "charlie@gmail.com", "name": "Charlie Brown", "verified_email": true}', 30, NOW()),
  ('550e8400-e29b-41d4-a716-446655440003', 'apple', 'apple_charlie_456', '{"email": "charlie@privaterelay.appleid.com", "name": "Charlie Brown", "verified": true}', 15, NOW()),
  
  -- Anonymous user with only WebAuthn
  ('550e8400-e29b-41d4-a716-446655440004', 'webauthn', 'webauthn_anon_001', '{"device_name": "Security Key", "counter": 5, "device_type": "external", "authenticator_type": "cross-platform"}', 10, NOW())
ON CONFLICT (provider, provider_user_id) DO NOTHING;

-- Insert test Agent DIDs
INSERT INTO agent_dids (user_id, agent_did, controller_did, rooch_address, object_id, did_document, sybil_level, status, transaction_hash, blockchain_confirmed, block_height) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 
   'did:rooch:rooch1xyz789abc012def345ghi678jkl901mno234pqr', 
   'did:rooch:rooch1abc123def456ghi789jkl012mno345pqr678stu',
   'rooch1xyz789abc012def345ghi678jkl901mno234pqr',
   '0x1234567890abcdef1234567890abcdef12345678',
   '{
     "@context": ["https://www.w3.org/ns/did/v1"],
     "id": "did:rooch:rooch1xyz789abc012def345ghi678jkl901mno234pqr",
     "controller": ["did:rooch:rooch1abc123def456ghi789jkl012mno345pqr678stu"],
     "verificationMethod": [{
       "id": "did:rooch:rooch1xyz789abc012def345ghi678jkl901mno234pqr#key-1",
       "type": "EcdsaSecp256k1VerificationKey2019",
       "controller": "did:rooch:rooch1abc123def456ghi789jkl012mno345pqr678stu",
       "publicKeyMultibase": "zQ3s..."
     }],
     "authentication": ["did:rooch:rooch1xyz789abc012def345ghi678jkl901mno234pqr#key-1"],
     "capabilityDelegation": ["did:rooch:rooch1xyz789abc012def345ghi678jkl901mno234pqr#key-1"]
   }',
   2, 'confirmed', '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', true, 1000),

  ('550e8400-e29b-41d4-a716-446655440002', 
   'did:rooch:rooch1mno345pqr678stu901vwx234yza567bcd890efg', 
   'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
   'rooch1mno345pqr678stu901vwx234yza567bcd890efg',
   '0x9876543210fedcba9876543210fedcba98765432',
   '{
     "@context": ["https://www.w3.org/ns/did/v1"],
     "id": "did:rooch:rooch1mno345pqr678stu901vwx234yza567bcd890efg",
     "controller": ["did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"],
     "verificationMethod": [{
       "id": "did:rooch:rooch1mno345pqr678stu901vwx234yza567bcd890efg#key-1",
       "type": "Ed25519VerificationKey2020",
       "controller": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
       "publicKeyMultibase": "z6Mk..."
     }, {
       "id": "did:rooch:rooch1mno345pqr678stu901vwx234yza567bcd890efg#custodian-key",
       "type": "Ed25519VerificationKey2020",
       "controller": "did:rooch:rooch1custodian123...",
       "publicKeyMultibase": "z6Mk..."
     }],
     "authentication": ["did:rooch:rooch1mno345pqr678stu901vwx234yza567bcd890efg#key-1"],
     "capabilityInvocation": ["did:rooch:rooch1mno345pqr678stu901vwx234yza567bcd890efg#custodian-key"]
   }',
   1, 'confirmed', '0xbcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890a', true, 1001),

  ('550e8400-e29b-41d4-a716-446655440003', 
   'did:rooch:rooch1pqr678stu901vwx234yza567bcd890efg123hij', 
   'did:rooch:rooch1def456ghi789jkl012mno345pqr678stu901vwx',
   'rooch1pqr678stu901vwx234yza567bcd890efg123hij',
   '0xabcd1234567890abcdef1234567890abcdef123456',
   '{
     "@context": ["https://www.w3.org/ns/did/v1"],
     "id": "did:rooch:rooch1pqr678stu901vwx234yza567bcd890efg123hij",
     "controller": ["did:rooch:rooch1def456ghi789jkl012mno345pqr678stu901vwx"],
     "verificationMethod": [{
       "id": "did:rooch:rooch1pqr678stu901vwx234yza567bcd890efg123hij#key-1",
       "type": "EcdsaSecp256k1VerificationKey2019",
       "controller": "did:rooch:rooch1def456ghi789jkl012mno345pqr678stu901vwx",
       "publicKeyMultibase": "zQ3s..."
     }],
     "authentication": ["did:rooch:rooch1pqr678stu901vwx234yza567bcd890efg123hij#key-1"]
   }',
   1, 'creating', '0xcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab', false, NULL),

  ('550e8400-e29b-41d4-a716-446655440004', 
   'did:rooch:rooch1stu901vwx234yza567bcd890efg123hij456klm', 
   'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
   'rooch1stu901vwx234yza567bcd890efg123hij456klm',
   NULL,
   '{
     "@context": ["https://www.w3.org/ns/did/v1"],
     "id": "did:rooch:rooch1stu901vwx234yza567bcd890efg123hij456klm",
     "controller": ["did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH"],
     "verificationMethod": [{
       "id": "did:rooch:rooch1stu901vwx234yza567bcd890efg123hij456klm#key-1",
       "type": "Ed25519VerificationKey2020",
       "controller": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",
       "publicKeyMultibase": "z6Mk..."
     }],
     "authentication": ["did:rooch:rooch1stu901vwx234yza567bcd890efg123hij456klm#key-1"]
   }',
   0, 'pending', NULL, false, NULL)
ON CONFLICT (agent_did) DO NOTHING;

-- Insert test transactions
INSERT INTO transactions (user_id, agent_did_id, tx_hash, chain_id, operation_type, tx_data, status, block_info, confirmed_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 
   (SELECT id FROM agent_dids WHERE agent_did = 'did:rooch:rooch1xyz789abc012def345ghi678jkl901mno234pqr'),
   '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
   'rooch-testnet', 'create_did', 
   '{"method": "self_creation", "sybil_level": 2, "auth_methods": ["google", "github", "twitter"]}',
   'confirmed', '{"block_number": 1000, "gas_used": 150000, "timestamp": "2024-01-15T11:00:00Z"}', NOW()),

  ('550e8400-e29b-41d4-a716-446655440002', 
   (SELECT id FROM agent_dids WHERE agent_did = 'did:rooch:rooch1mno345pqr678stu901vwx234yza567bcd890efg'),
   '0xbcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890a',
   'rooch-testnet', 'create_did_via_cadop', 
   '{"method": "cadop", "custodian": "did:rooch:rooch1custodian123...", "sybil_level": 1}',
   'confirmed', '{"block_number": 1001, "gas_used": 200000, "timestamp": "2024-01-15T12:15:00Z"}', NOW()),

  ('550e8400-e29b-41d4-a716-446655440003', 
   (SELECT id FROM agent_dids WHERE agent_did = 'did:rooch:rooch1pqr678stu901vwx234yza567bcd890efg123hij'),
   '0xcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
   'rooch-testnet', 'create_did', 
   '{"method": "self_creation", "sybil_level": 1, "auth_methods": ["google", "apple"]}',
   'pending', '{}', NULL)
ON CONFLICT (tx_hash) DO NOTHING;

-- Insert test proof requests
INSERT INTO proof_requests (user_id, claim_type, auth_method, status, request_data, response_data, completed_at, expires_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'web2_identity', 'oauth', 'completed', 
   '{"requested_providers": ["google", "github"], "purpose": "Account verification", "requester": "app.example.com"}',
   '{"proofs": [{"provider": "google", "verified": true, "score": 30}, {"provider": "github", "verified": true, "score": 25}], "total_score": 55}',
   NOW(), NOW() + INTERVAL '30 days'),
   
  ('550e8400-e29b-41d4-a716-446655440002', 'sybil_score', 'multi_auth', 'completed',
   '{"min_score": 50, "purpose": "Platform access", "requester": "dapp.example.com"}',
   '{"sybil_level": 1, "total_contribution": 65, "verification_timestamp": "2024-01-15T12:30:00Z", "verified_methods": ["webauthn", "google", "github"]}',
   NOW(), NOW() + INTERVAL '7 days'),
   
  ('550e8400-e29b-41d4-a716-446655440003', 'web2_identity', 'oauth', 'processing',
   '{"requested_providers": ["google"], "purpose": "Identity verification", "requester": "service.example.com"}',
   '{}',
   NULL, NOW() + INTERVAL '1 day'),
   
  ('550e8400-e29b-41d4-a716-446655440004', 'device_attestation', 'webauthn', 'pending',
   '{"device_type": "security_key", "purpose": "Device verification", "requester": "test.example.com"}',
   '{}',
   NULL, NOW() + INTERVAL '2 days')
ON CONFLICT DO NOTHING;

-- Insert test verifiable credentials
INSERT INTO verifiable_credentials (issuer_did, subject_did, credential_type, claims, proof, issued_at, expires_at, status, proof_request_id) VALUES
  ('did:rooch:rooch1cadop123...', 
   'did:rooch:rooch1xyz789abc012def345ghi678jkl901mno234pqr', 
   'Web2IdentityCredential',
   '{
     "sub": "did:rooch:rooch1xyz789abc012def345ghi678jkl901mno234pqr",
     "iss": "did:rooch:rooch1cadop123...",
     "iat": 1705312800,
     "exp": 1707904800,
     "vc": {
       "type": ["VerifiableCredential", "Web2IdentityCredential"],
       "credentialSubject": {
         "id": "did:rooch:rooch1xyz789abc012def345ghi678jkl901mno234pqr",
         "web2Identities": [
           {"provider": "google", "verified": true, "score": 30},
           {"provider": "github", "verified": true, "score": 25}
         ],
         "totalScore": 55
       }
     }
   }',
   '{
     "type": "Ed25519Signature2020",
     "created": "2024-01-15T11:00:00Z",
     "verificationMethod": "did:rooch:rooch1cadop123...#key-1",
     "proofPurpose": "assertionMethod",
     "proofValue": "z5vK7..."
   }',
   NOW(), NOW() + INTERVAL '30 days', 'active',
   (SELECT id FROM proof_requests WHERE claim_type = 'web2_identity' AND user_id = '550e8400-e29b-41d4-a716-446655440001')),

  ('did:rooch:rooch1cadop123...', 
   'did:rooch:rooch1mno345pqr678stu901vwx234yza567bcd890efg', 
   'SybilResistanceCredential',
   '{
     "sub": "did:rooch:rooch1mno345pqr678stu901vwx234yza567bcd890efg",
     "iss": "did:rooch:rooch1cadop123...",
     "iat": 1705314600,
     "exp": 1705919400,
     "vc": {
       "type": ["VerifiableCredential", "SybilResistanceCredential"],
       "credentialSubject": {
         "id": "did:rooch:rooch1mno345pqr678stu901vwx234yza567bcd890efg",
         "sybilLevel": 1,
         "totalContribution": 65,
         "verifiedMethods": ["webauthn", "google", "github"]
       }
     }
   }',
   '{
     "type": "Ed25519Signature2020",
     "created": "2024-01-15T12:30:00Z",
     "verificationMethod": "did:rooch:rooch1cadop123...#key-1",
     "proofPurpose": "assertionMethod",
     "proofValue": "z8nM9..."
   }',
   NOW(), NOW() + INTERVAL '7 days', 'active',
   (SELECT id FROM proof_requests WHERE claim_type = 'sybil_score' AND user_id = '550e8400-e29b-41d4-a716-446655440002'))
ON CONFLICT DO NOTHING;

-- Insert test OAuth clients
INSERT INTO oauth_clients (client_id, client_secret_hash, name, redirect_uris, scopes, metadata) VALUES
  ('cadop_demo_app_001', '$2b$10$hashedSecret...', 'CADOP Demo Application', 
   '["http://localhost:3001/callback", "https://demo.cadop.app/callback"]',
   '["openid", "profile", "did", "web2_proof"]',
   '{"description": "Demo application for CADOP service", "website": "https://demo.cadop.app"}'),
  
  ('dapp_example_com', '$2b$10$hashedSecret...', 'Example DApp', 
   '["https://dapp.example.com/auth/callback"]',
   '["openid", "did", "sybil_score"]',
   '{"description": "Example decentralized application", "contact": "admin@dapp.example.com"}'),
   
  ('mobile_wallet_app', '$2b$10$hashedSecret...', 'Mobile Wallet App', 
   '["cadop://auth/callback", "https://wallet.mobile.com/callback"]',
   '["openid", "profile", "did"]',
   '{"description": "Mobile wallet application", "platform": "mobile"}')
ON CONFLICT (client_id) DO NOTHING;

-- Insert test sessions
INSERT INTO sessions (user_id, client_id, session_token_hash, access_token_hash, refresh_token_hash, session_data, expires_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 
   (SELECT id FROM oauth_clients WHERE client_id = 'cadop_demo_app_001'),
   '$2b$10$hashedSessionToken...', '$2b$10$hashedAccessToken...', '$2b$10$hashedRefreshToken...',
   '{"scope": "openid profile did", "auth_time": 1705312800, "user_agent": "Mozilla/5.0"}',
   NOW() + INTERVAL '24 hours'),
   
  ('550e8400-e29b-41d4-a716-446655440002', 
   (SELECT id FROM oauth_clients WHERE client_id = 'dapp_example_com'),
   '$2b$10$hashedSessionToken2...', '$2b$10$hashedAccessToken2...', NULL,
   '{"scope": "openid did sybil_score", "auth_time": 1705314600, "user_agent": "Mozilla/5.0"}',
   NOW() + INTERVAL '12 hours')
ON CONFLICT (session_token_hash) DO NOTHING; 