import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

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

  return out;
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
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(jsonSchema);

  const schema = {
    ['~standard']: {
      version: 1 as 1,
      vendor: 'nuwa',
      validate: async (input: any) => {
        const ok = validate(input);
        if (ok) return { value: input, issues: undefined };
        return { value: undefined, issues: mapAjvErrors(validate.errors) };
      },
    },
  } as any;
  return schema;
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
