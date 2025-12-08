import z from 'zod';

export const CADOPMintRequestSchema = z.object({
  idToken: z.string().min(1, 'ID token is required'),
  userDid: z.string().min(1, 'User DID is required'),
});

export const DIDRecordIdSchema = z.object({
  recordId: z.string().uuid('Invalid record ID format'),
});

export const UserIdSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

export const DIDSchema = z.object({
  did: z.string().regex(/^did:/, 'Invalid Agent DID format'),
});
