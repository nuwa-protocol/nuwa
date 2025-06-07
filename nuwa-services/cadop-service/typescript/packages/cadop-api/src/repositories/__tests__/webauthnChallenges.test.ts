import { WebAuthnChallengesRepository } from '../webauthnChallenges.js';
import crypto from 'crypto';

describe('WebAuthnChallengesRepository', () => {
  let repo: WebAuthnChallengesRepository;
  let testUserId: string;
  let testChallenge: string;

  beforeAll(() => {
    repo = new WebAuthnChallengesRepository();
    testUserId = crypto.randomUUID();
    testChallenge = crypto.randomBytes(32).toString('base64url');
  });

  it('should create a new challenge', async () => {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    const challenge = await repo.create({
      user_id: testUserId,
      challenge: testChallenge,
      operation_type: 'registration',
      expires_at: expiresAt,
      client_data: { test: 'data' }
    });

    expect(challenge.user_id).toBe(testUserId);
    expect(challenge.challenge).toBe(testChallenge);
    expect(challenge.operation_type).toBe('registration');
    expect(challenge.created_at).toBeInstanceOf(Date);
    expect(challenge.updated_at).toBeInstanceOf(Date);
    expect(challenge.expires_at.getTime()).toBe(expiresAt.getTime());
  });

  it('should find challenge by challenge string', async () => {
    const challenge = await repo.getByChallenge(testChallenge);
    expect(challenge).not.toBeNull();
    expect(challenge?.challenge).toBe(testChallenge);
  });

  it('should mark challenge as used', async () => {
    const challenge = await repo.getByChallenge(testChallenge);
    if (!challenge) {
      throw new Error('Challenge not found');
    }

    const updatedChallenge = await repo.markAsUsed(challenge.id);
    expect(updatedChallenge.used_at).toBeInstanceOf(Date);
  });

  it('should get active challenges by user ID', async () => {
    const challenges = await repo.getActiveByUserId(testUserId);
    expect(Array.isArray(challenges)).toBe(true);
    
    // 由于我们刚才标记了之前的 challenge 为已使用，所以不应该出现在活跃列表中
    expect(challenges.find(c => c.challenge === testChallenge)).toBeUndefined();
  });

  it('should cleanup expired challenges', async () => {
    const deletedCount = await repo.cleanupExpired();
    expect(typeof deletedCount).toBe('number');
  });
}); 