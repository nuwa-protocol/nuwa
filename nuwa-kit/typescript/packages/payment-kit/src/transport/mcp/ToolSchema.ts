import { z } from 'zod';

// -----------------------------
// Zod schemas for reserved parameters (for MCP zod-based parameters)
// -----------------------------

export const SerializableSubRAVSchema = z.object({
  version: z.string(),
  chainId: z.string(),
  channelId: z.string(),
  channelEpoch: z.string(),
  vmIdFragment: z.string(),
  accumulatedAmount: z.string(),
  nonce: z.string(),
});

export const SerializableSignedSubRAVSchema = z.object({
  subRav: SerializableSubRAVSchema,
  signature: z.string(),
});

// SerializableResponsePayload (Zod) – mirrors SerializableResponsePayloadSchema
export const SerializableResponsePayloadSchema = z.object({
  version: z.number(),
  clientTxRef: z.string().optional(),
  serviceTxRef: z.string().optional(),
  subRav: SerializableSubRAVSchema.optional(),
  cost: z.string().optional(),
  costUsd: z.string().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string().optional(),
    })
    .optional(),
});


/**
 * Extend a Zod object schema with Nuwa reserved fields used in MCP calls.
 * - __nuwa_auth: DIDAuth header (string), optional
 * - __nuwa_payment: structured payment payload, optional
 */
export function extendZodWithNuwaReserved<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<any> {
  return (schema as any).extend({
    __nuwa_auth: z.string().optional(),
    __nuwa_payment: SerializableResponsePayloadSchema.optional(),
  });
}

/**
 * Best-effort normalization: accept either a Zod object schema, or a plain
 * Zod raw shape (e.g., { name: z.string() }) and convert it to z.object(...).
 * Returns undefined if input cannot be recognized as zod-based schema.
 */
export function normalizeToZodObject(schema: any): z.ZodObject<any> | undefined {
  try {
    // Case 1: already a Zod object
    if (schema && typeof (schema as any).extend === 'function' && (schema as any)._def?.typeName) {
      return schema as z.ZodObject<any>;
    }
    // Case 2: plain object raw shape with zod types as values
    if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
      const entries = Object.entries(schema);
      if (entries.length === 0) return z.object({});
      const isAllZod = entries.every(([, v]) => !!(v as any)?._def);
      if (isAllZod) {
        return z.object(schema as z.ZodRawShape);
      }
    }
  } catch {}
  return undefined;
}
