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

export const AgentDIDSubsidySchema = z.object({
  attempted: z.boolean(),
  status: z.enum(['success', 'failed', 'skipped']),
  amountRaw: z.string().optional(),
  txHash: z.string().optional(),
  reason: z.string().optional(),
});

export const AgentDIDCreationStatusSchema = z.object({
  id: z.string().uuid().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  userDid: z.string().min(1, 'User DID is required'),
  agentDid: z.string().optional(),
  transactionHash: z.string().optional(),
  subsidy: AgentDIDSubsidySchema.optional(),
  error: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
