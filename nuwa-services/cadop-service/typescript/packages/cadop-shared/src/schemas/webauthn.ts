import { z } from 'zod'

export const authenticationOptionsSchema = z.object({
  user_did: z.string().optional().nullable(),
  name: z.string().optional(),
  display_name: z.string().optional(),
  existing_credential: z.object({
    id: z.string(),
    type: z.literal('public-key'),
    transports: z.array(z.string()).optional()
  }).optional()
})

export const verifySchema = z.object({
  response: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string().optional(),
      signature: z.string().optional(),
      userHandle: z.string().optional(),
      attestationObject: z.string().optional(),
      transports: z.array(z.string()).optional()
    }),
    authenticatorAttachment: z.string().optional(),
    clientExtensionResults: z.record(z.any()).optional()
  })
})

export const credentialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().optional()
}) 