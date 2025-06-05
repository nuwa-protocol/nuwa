import { UserRepository } from '../users.js';
import crypto from 'crypto';

describe('UserRepository', () => {
  let repo: UserRepository;
  let testUserId: string;
  let testUserDid: string;

  beforeAll(() => {
    repo = new UserRepository();
    testUserId = crypto.randomUUID();
    testUserDid = `did:key:${crypto.randomUUID()}`;
  });

  it('should create a new user', async () => {
    const user = await repo.create({
      id: testUserId,
      user_did: testUserDid,
      email: `test-${testUserId}@example.com`,
      display_name: 'Test User',
    });

    expect(user.id).toBe(testUserId);
    expect(user.user_did).toBe(testUserDid);
    expect(user.created_at).toBeInstanceOf(Date);
    expect(user.updated_at).toBeInstanceOf(Date);
  });

  it('should find user by ID', async () => {
    const user = await repo.findById(testUserId);
    expect(user).not.toBeNull();
    expect(user?.id).toBe(testUserId);
  });

  it('should find user by DID', async () => {
    const user = await repo.findByDID(testUserDid);
    expect(user).not.toBeNull();
    expect(user?.user_did).toBe(testUserDid);
  });

  it('should update user', async () => {
    const newDisplayName = 'Updated Test User';
    const user = await repo.update(testUserId, {
      display_name: newDisplayName
    });

    expect(user.display_name).toBe(newDisplayName);
  });

  it('should handle non-existent user', async () => {
    const user = await repo.findById(crypto.randomUUID());
    expect(user).toBeNull();
  });
}); 