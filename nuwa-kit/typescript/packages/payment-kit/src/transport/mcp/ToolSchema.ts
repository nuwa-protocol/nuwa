import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { jsonSchema as xsJsonSchema } from 'xsschema';
import { z } from 'zod';

// -----------------------------
// Reserved parameter schema
// -----------------------------

export const ReservedParamsSchema: any = {
  type: 'object',
  properties: {
    __nuwa_auth: { type: 'string' },
    __nuwa_payment: {
      type: 'object',
      properties: {
        version: { type: 'number' },
        clientTxRef: { type: 'string' },
        maxAmount: { type: 'string' },
        signedSubRav: {
          type: 'object',
          properties: {
            subRav: {
              type: 'object',
              properties: {
                version: { type: 'string' },
                chainId: { type: 'string' },
                channelId: { type: 'string' },
                channelEpoch: { type: 'string' },
                vmIdFragment: { type: 'string' },
                accumulatedAmount: { type: 'string' },
                nonce: { type: 'string' },
              },
              required: [
                'version',
                'chainId',
                'channelId',
                'channelEpoch',
                'vmIdFragment',
                'accumulatedAmount',
                'nonce',
              ],
              additionalProperties: false,
            },
            signature: { type: 'string' },
          },
          required: ['subRav', 'signature'],
          additionalProperties: false,
        },
      },
      required: ['version', 'clientTxRef'],
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};

// -----------------------------
// SerializableResponsePayload schema
// -----------------------------

export const SerializableSubRAVSchema: any = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    chainId: { type: 'string' },
    channelId: { type: 'string' },
    channelEpoch: { type: 'string' },
    vmIdFragment: { type: 'string' },
    accumulatedAmount: { type: 'string' },
    nonce: { type: 'string' },
  },
  required: [
    'version',
    'chainId',
    'channelId',
    'channelEpoch',
    'vmIdFragment',
    'accumulatedAmount',
    'nonce',
  ],
  additionalProperties: false,
};

export const SerializableResponsePayloadSchema: any = {
  type: 'object',
  properties: {
    version: { type: 'number' },
    clientTxRef: { type: 'string' },
    serviceTxRef: { type: 'string' },
    subRav: SerializableSubRAVSchema,
    cost: { type: 'string' },
    costUsd: { type: 'string' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  required: ['version'],
  additionalProperties: false,
};

// -----------------------------
// Builders
// -----------------------------

export function buildParametersSchema(
  userSchema?: any,
  options?: { mergeReserved?: boolean; additionalProperties?: boolean }
): any {
  const mergeReserved = options?.mergeReserved !== false;
  const additional = options?.additionalProperties ?? true;

  const base: any = {
    type: 'object',
    properties: {},
    additionalProperties: additional,
  };

  const target = userSchema && typeof userSchema === 'object' ? userSchema : base;
  const out: any = {
    type: 'object',
    properties: { ...(target.properties || {}) },
    required: Array.isArray(target.required) ? [...target.required] : [],
    additionalProperties:
      typeof target.additionalProperties === 'boolean' ? target.additionalProperties : additional,
  };

  if (mergeReserved) {
    out.properties = { ...out.properties, ...ReservedParamsSchema.properties };
    // reserved keys are optional; do not push to required
  }

  // Wrap as xsSchema JsonSchema so FastMCP/xsschema code paths can safely access ~standard fields
  return xsJsonSchema(out) as any;
}

// -----------------------------
// Compiler to StandardSchemaV1
// -----------------------------

function pathStringToArray(instancePath: string | undefined): (string | number)[] {
  if (!instancePath) return [];
  // Ajv uses JSON Pointer, e.g., "/data/0/name"
  const parts = instancePath.split('/').filter(Boolean);
  return parts.map(p => (p.match(/^\d+$/) ? Number(p) : p));
}

function mapAjvErrors(errors: ErrorObject[] | null | undefined) {
  if (!errors) return undefined;
  return errors.map(e => ({
    path: pathStringToArray(e.instancePath),
    message: e.message || 'Invalid value',
    keyword: e.keyword,
    params: e.params,
  }));
}

export function compileStandardSchema(jsonSchema: any) {
  // Also wrap output to satisfy FastMCP expectations
  return xsJsonSchema(jsonSchema) as any;
}

// -----------------------------
// Validator helpers
// -----------------------------

const ajvForResponse = new Ajv({ allErrors: true, strict: false });
addFormats(ajvForResponse);
const validateResponse = ajvForResponse.compile(SerializableResponsePayloadSchema);

export function validateSerializableResponsePayload(payload: any): string[] | null {
  const ok = validateResponse(payload);
  if (ok) return null;
  return (validateResponse.errors || []).map(e => `${e.instancePath} ${e.message}`.trim());
}

// -----------------------------
// Zod schemas for reserved parameters (for MCP zod-based parameters)
// -----------------------------

export const ZodSubRAVSchema = z.object({
  version: z.string(),
  chainId: z.string(),
  channelId: z.string(),
  channelEpoch: z.string(),
  vmIdFragment: z.string(),
  accumulatedAmount: z.string(),
  nonce: z.string(),
});

export const ZodSignedSubRAVSchema = z.object({
  subRav: ZodSubRAVSchema,
  signature: z.string(),
});

export const ZodNuwaPaymentSchema = z.object({
  version: z.number(),
  clientTxRef: z.string(),
  maxAmount: z.string().optional(),
  signedSubRav: ZodSignedSubRAVSchema.optional(),
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
    __nuwa_payment: ZodNuwaPaymentSchema.optional(),
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
