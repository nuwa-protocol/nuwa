import { z } from 'zod';

export const registrationOptionsSchema = z.object({
  email: z.string().email(),
  display_name: z.string().optional(),
  friendly_name: z.string().optional()
});

export const registrationVerificationSchema = z.object({
  response: z.any(), // WebAuthn response is too complex for Zod validation
  friendly_name: z.string().optional()
});

export const authenticationOptionsSchema = z.object({
  user_identifier: z.string().optional()
});

export const authenticationResponseSchema = z.object({
  response: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      authenticatorData: z.string(),
      clientDataJSON: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
    type: z.literal('public-key'),
    clientExtensionResults: z.record(z.any()),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  }),
});

export const registrationResponseSchema = z.object({
    response: z.object({
        id: z.string(),
        rawId: z.string(),
        response: z.object({
            attestationObject: z.string(),
            clientDataJSON: z.string(),
            transports: z.array(z.string()).optional(),
        }),
        type: z.literal('public-key'),
        clientExtensionResults: z.record(z.any()),
        authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
    }),
    friendly_name: z.string().min(1).max(100).optional(),
});