-- Insert test users
INSERT INTO public.users (
  id,
  user_did,
  email,
  display_name,
  metadata
)
VALUES 
  (
    '00000000-0000-0000-0000-000000000001',
    'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    'test1@example.com',
    'Test User 1',
    '{}'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'did:key:z6MkhGwM3SrQgJ1fK4WNfX6RYkMKKGu1pdqQtFGrHCEz1vwS',
    'test2@example.com',
    'Test User 2',
    '{}'
  );

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

-- -- Update user profiles with primary agent DIDs
-- UPDATE public.user 
-- SET primary_agent_did = 'did:rooch:0x1234567890abcdef'
-- WHERE id = '00000000-0000-0000-0000-000000000001';

-- UPDATE public.users 
-- SET primary_agent_did = 'did:rooch:0xabcdef1234567890'
-- WHERE id = '00000000-0000-0000-0000-000000000002'; 