import { z } from 'zod';

export const registrationOptionsSchema = z.object({
  email: z.string().email(),
  display_name: z.string().optional(),
  friendly_name: z.string().optional()
});

// 统一的验证 schema，支持注册和认证响应
const baseResponseSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  type: z.literal('public-key'),
  clientExtensionResults: z.record(z.any()),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
});

// 注册响应特有的字段
const registrationResponseSchema = baseResponseSchema.extend({
  response: z.object({
    attestationObject: z.string(),
    clientDataJSON: z.string(),
    transports: z.array(z.string()).optional(),
  }),
});

// 认证响应特有的字段
const authenticationResponseSchema = baseResponseSchema.extend({
  response: z.object({
    authenticatorData: z.string(),
    clientDataJSON: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
});

// 统一的验证 schema
export const verifySchema = z.object({
  response: z.union([registrationResponseSchema, authenticationResponseSchema]),
  friendly_name: z.string().min(1).max(100).optional(),
});

export const authenticationOptionsSchema = z.object({
  user_identifier: z.string().optional()
});