import { AuthenticatorRepository } from '../authenticators.js';
import crypto from 'crypto';

describe('AuthenticatorRepository', () => {
  let repo: AuthenticatorRepository;
  let testUserId: string;
  let testAuthenticatorId: string;
  let testCredentialId: string;

  beforeAll(() => {
    repo = new AuthenticatorRepository();
    testUserId = crypto.randomUUID();
    testAuthenticatorId = crypto.randomUUID();
    testCredentialId = crypto.randomBytes(32).toString('base64url');
  });

  it('should create a new authenticator', async () => {
    const publicKey = crypto.randomBytes(32);
    const authenticator = await repo.create({
      id: testAuthenticatorId,
      user_id: testUserId,
      credential_id: testCredentialId,
      credential_public_key: publicKey.toString('base64'),
      counter: 0,
      credential_device_type: 'platform',
      credential_backed_up: true,
      transports: ['internal'],
      friendly_name: 'Test Device'
    });

    expect(authenticator.id).toBe(testAuthenticatorId);
    expect(authenticator.user_id).toBe(testUserId);
    expect(authenticator.credential_id).toBe(testCredentialId);
    expect(authenticator.created_at).toBeInstanceOf(Date);
    expect(authenticator.updated_at).toBeInstanceOf(Date);
  });

  it('should find authenticator by ID', async () => {
    const authenticator = await repo.findById(testAuthenticatorId);
    expect(authenticator).not.toBeNull();
    expect(authenticator?.id).toBe(testAuthenticatorId);
  });

  it('should find authenticator by credential ID', async () => {
    const authenticator = await repo.findByCredentialId(testCredentialId);
    expect(authenticator).not.toBeNull();
    expect(authenticator?.credential_id).toBe(testCredentialId);
  });

  it('should find authenticators by user ID', async () => {
    const authenticators = await repo.findByUserId(testUserId);
    expect(Array.isArray(authenticators)).toBe(true);
    expect(authenticators.length).toBeGreaterThan(0);
    expect(authenticators[0].user_id).toBe(testUserId);
  });

  it('should update authenticator counter', async () => {
    const newCounter = 1;
    const authenticator = await repo.update(testAuthenticatorId, {
      counter: newCounter,
      last_used_at: new Date()
    });

    expect(authenticator.counter).toBe(newCounter);
    expect(authenticator.last_used_at).toBeInstanceOf(Date);
  });

  it('should update authenticator friendly name', async () => {
    const newName = 'Updated Test Device';
    const authenticator = await repo.update(testAuthenticatorId, {
      friendly_name: newName
    });

    expect(authenticator.friendly_name).toBe(newName);
  });

  it('should handle non-existent authenticator', async () => {
    const authenticator = await repo.findById(crypto.randomUUID());
    expect(authenticator).toBeNull();
  });

  it('should delete authenticator', async () => {
    await repo.delete(testAuthenticatorId);
    const authenticator = await repo.findById(testAuthenticatorId);
    expect(authenticator).toBeNull();
  });
}); 