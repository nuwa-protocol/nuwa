-- Insert test users
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'test1@example.com', NOW()),
  ('00000000-0000-0000-0000-000000000002', 'test2@example.com', NOW());

-- Insert user profiles
INSERT INTO public.user_profiles (id, user_did, display_name)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', 'Test User 1'),
  ('00000000-0000-0000-0000-000000000002', 'did:key:z6MkhGwM3SrQgJ1fK4WNfX6RYkMKKGu1pdqQtFGrHCEz1vwS', 'Test User 2');

-- Insert auth methods
INSERT INTO public.auth_methods (user_id, provider, provider_user_id, sybil_contribution, verified_at)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'email', 'test1@example.com', 50, NOW()),
  ('00000000-0000-0000-0000-000000000002', 'email', 'test2@example.com', 50, NOW());

-- Insert agent DIDs
INSERT INTO public.agent_dids (
  user_id, 
  agent_did, 
  controller_did, 
  rooch_address, 
  did_document, 
  status, 
  blockchain_confirmed
)
VALUES 
  (
    '00000000-0000-0000-0000-000000000001',
    'did:rooch:0x1234567890abcdef',
    'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    '0x1234567890abcdef',
    '{"id": "did:rooch:0x1234567890abcdef"}',
    'confirmed',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'did:rooch:0xabcdef1234567890',
    'did:key:z6MkhGwM3SrQgJ1fK4WNfX6RYkMKKGu1pdqQtFGrHCEz1vwS',
    '0xabcdef1234567890',
    '{"id": "did:rooch:0xabcdef1234567890"}',
    'confirmed',
    true
  );

-- Update user profiles with primary agent DIDs
UPDATE public.user_profiles 
SET primary_agent_did = 'did:rooch:0x1234567890abcdef'
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE public.user_profiles 
SET primary_agent_did = 'did:rooch:0xabcdef1234567890'
WHERE id = '00000000-0000-0000-0000-000000000002'; 