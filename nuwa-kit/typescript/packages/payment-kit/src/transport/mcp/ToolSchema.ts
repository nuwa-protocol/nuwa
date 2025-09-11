import { z } from 'zod';
import { SerializableRequestPayloadSchema } from '../../schema/core';

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
    __nuwa_payment: SerializableRequestPayloadSchema.optional(),
  });
}

/**
 * Convert JSON Schema property to Zod schema
 */
function jsonSchemaPropertyToZod(property: any): z.ZodTypeAny {
  if (!property || typeof property !== 'object') {
    return z.any();
  }

  const { type, description, enum: enumValues, items, properties, required = [] } = property;

  switch (type) {
    case 'string':
      if (enumValues && Array.isArray(enumValues)) {
        return z.enum(enumValues as [string, ...string[]]);
      }
      return z.string();

    case 'number':
      return z.number();

    case 'integer':
      return z.number().int();

    case 'boolean':
      return z.boolean();

    case 'array':
      if (items) {
        const itemSchema = jsonSchemaPropertyToZod(items);
        return z.array(itemSchema);
      }
      return z.array(z.any());

    case 'object':
      if (properties && typeof properties === 'object') {
        const zodShape: z.ZodRawShape = {};
        for (const [key, prop] of Object.entries(properties)) {
          let propSchema = jsonSchemaPropertyToZod(prop);
          // Make optional if not in required array
          if (!required.includes(key)) {
            propSchema = propSchema.optional();
          }
          zodShape[key] = propSchema;
        }
        return z.object(zodShape);
      }
      return z.object({}).passthrough();

    default:
      return z.any();
  }
}

/**
 * Convert JSON Schema to Zod object schema
 */
export function jsonSchemaToZodObject(jsonSchema: any): z.ZodObject<any> | undefined {
  try {
    if (!jsonSchema || typeof jsonSchema !== 'object') {
      return undefined;
    }

    // Handle MCP tool inputSchema format
    if (jsonSchema.type === 'object') {
      const { properties = {}, required = [] } = jsonSchema;
      const zodShape: z.ZodRawShape = {};

      for (const [key, prop] of Object.entries(properties)) {
        let propSchema = jsonSchemaPropertyToZod(prop);
        // Make optional if not in required array
        if (!required.includes(key)) {
          propSchema = propSchema.optional();
        }
        zodShape[key] = propSchema;
      }

      return z.object(zodShape);
    }

    return undefined;
  } catch (error) {
    console.warn('Failed to convert JSON Schema to Zod:', error);
    return undefined;
  }
}

/**
 * Best-effort normalization: accept either a Zod object schema, a plain
 * Zod raw shape (e.g., { name: z.string() }), or a JSON Schema and convert it to z.object(...).
 * Returns undefined if input cannot be recognized as a valid schema.
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

    // Case 3: JSON Schema (MCP tool inputSchema format)
    const zodFromJson = jsonSchemaToZodObject(schema);
    if (zodFromJson) {
      return zodFromJson;
    }
  } catch {}
  return undefined;
}
