import { z } from 'zod';

export const AuthProviderSchema = z.enum(['webauthn', 'bitcoin']);

export const BitcoinVerifyRequestSchema = z.object({
  address: z.string().min(1, 'Bitcoin address is required'),
  publicKeyHex: z.string().regex(/^[0-9a-fA-F]+$/, 'Invalid hex format for public key'),
  signature: z.string().min(1, 'Signature is required'),
  challenge: z.string().min(1, 'Challenge is required'),
  nonce: z.string().min(1, 'Nonce is required'),
  origin: z.string().optional(),
});

export const ChallengeRequestSchema = z.object({
  provider: AuthProviderSchema.optional().default('webauthn'),
});

export const BitcoinChallengeResponseSchema = z.object({
  challenge: z.string(),
  nonce: z.string(),
  rpId: z.string().optional(),
  messageToSign: z.string().optional(),
});

export const BitcoinVerifyResponseSchema = z.object({
  idToken: z.string(),
  isNewUser: z.boolean().optional(),
});
