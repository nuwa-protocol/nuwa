import { SessionRepository } from '../sessions.js';
import crypto from 'crypto';

describe('SessionRepository', () => {
  let repo: SessionRepository;
  let testUserId: string;
  let testAuthenticatorId: string;
  let testSessionId: string;
  let testAccessToken: string;
  let testRefreshToken: string;

  beforeAll(() => {
    repo = new SessionRepository();
    testUserId = crypto.randomUUID();
    testAuthenticatorId = crypto.randomUUID();
    testSessionId = crypto.randomUUID();
    testAccessToken = crypto.randomBytes(32).toString('base64url');
    testRefreshToken = crypto.randomBytes(32).toString('base64url');
  });

  it('should create a new session', async () => {
    const accessTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = await repo.create({
      id: testSessionId,
      user_id: testUserId,
      authenticator_id: testAuthenticatorId,
      access_token: testAccessToken,
      refresh_token: testRefreshToken,
      access_token_expires_at: accessTokenExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      metadata: { test: 'data' }
    });

    expect(session.id).toBe(testSessionId);
    expect(session.user_id).toBe(testUserId);
    expect(session.authenticator_id).toBe(testAuthenticatorId);
    expect(session.access_token).toBe(testAccessToken);
    expect(session.refresh_token).toBe(testRefreshToken);
    expect(session.created_at).toBeInstanceOf(Date);
    expect(session.updated_at).toBeInstanceOf(Date);
  });

  it('should find valid session by access token', async () => {
    const session = await repo.findByAccessToken(testAccessToken);
    expect(session).not.toBeNull();
    expect(session?.access_token).toBe(testAccessToken);
  });

  it('should not find session with expired access token', async () => {
    // create a expired access token session
    const expiredAccessTokenSession = await repo.create({
      user_id: testUserId,
      authenticator_id: testAuthenticatorId,
      access_token: crypto.randomBytes(32).toString('base64url'),
      refresh_token: crypto.randomBytes(32).toString('base64url'),
      access_token_expires_at: new Date(Date.now() + 1000), // expires in 1 second
      refresh_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // valid for 24 hours
    });

    // Wait for access token to expire
    await new Promise(resolve => setTimeout(resolve, 1100));

    const session = await repo.findByAccessToken(expiredAccessTokenSession.access_token);
    expect(session).toBeNull();
  });

  it('should find valid session by refresh token', async () => {
    const session = await repo.findByRefreshToken(testRefreshToken);
    expect(session).not.toBeNull();
    expect(session?.refresh_token).toBe(testRefreshToken);
  });

  it('should not find session with expired refresh token', async () => {
    // create a expired refresh token session
    const expiredRefreshTokenSession = await repo.create({
      user_id: testUserId,
      authenticator_id: testAuthenticatorId,
      access_token: crypto.randomBytes(32).toString('base64url'),
      refresh_token: crypto.randomBytes(32).toString('base64url'),
      access_token_expires_at: new Date(Date.now() + 1000), // expires in 1 second
      refresh_token_expires_at: new Date(Date.now() + 2000) // expires in 2 seconds
    });

    // Wait for refresh token to expire
    await new Promise(resolve => setTimeout(resolve, 2100));

    const session = await repo.findByRefreshToken(expiredRefreshTokenSession.refresh_token);
    expect(session).toBeNull();
  });

  it('should find sessions by user ID', async () => {
    const sessions = await repo.findByUserId(testUserId);
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].user_id).toBe(testUserId);
  });

  it('should find sessions by authenticator ID', async () => {
    const sessions = await repo.findByAuthenticatorId(testAuthenticatorId);
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].authenticator_id).toBe(testAuthenticatorId);
  });

  it('should update access token expiry', async () => {
    const newExpiryTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    await repo.updateAccessTokenExpiry(testSessionId, newExpiryTime);

    const session = await repo.findById(testSessionId);
    expect(session?.access_token_expires_at.getTime()).toBe(newExpiryTime.getTime());
  });

  it('should update refresh token expiry', async () => {
    const newExpiryTime = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
    await repo.updateRefreshTokenExpiry(testSessionId, newExpiryTime);

    const session = await repo.findById(testSessionId);
    expect(session?.refresh_token_expires_at.getTime()).toBe(newExpiryTime.getTime());
  });

  describe('session cleanup', () => {
    let expiredSessionId: string;

    beforeAll(async () => {
      // create a expired session
      const session = await repo.create({
        user_id: testUserId,
        authenticator_id: testAuthenticatorId,
        access_token: crypto.randomBytes(32).toString('base64url'),
        refresh_token: crypto.randomBytes(32).toString('base64url'),
        access_token_expires_at: new Date(Date.now() + 1000), // expires in 1 second
        refresh_token_expires_at: new Date(Date.now() + 2000) // expires in 2 seconds
      });
      expiredSessionId = session.id;

      // Wait for tokens to expire
      await new Promise(resolve => setTimeout(resolve, 2100));
    });

    it('should delete sessions with expired refresh tokens', async () => {
      const deletedCount = await repo.deleteExpired();
      expect(deletedCount).toBeGreaterThan(0);

      // verify the expired session is deleted
      const expiredSession = await repo.findById(expiredSessionId);
      expect(expiredSession).toBeNull();

      // verify the valid session is still exists
      const validSession = await repo.findById(testSessionId);
      expect(validSession).not.toBeNull();
    });
  });

  it('should delete sessions by user ID', async () => {
    await repo.deleteByUserId(testUserId);
    const sessions = await repo.findByUserId(testUserId);
    expect(sessions.length).toBe(0);
  });
}); 