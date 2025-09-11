// Jest is used in this project
import { z } from 'zod';
import { normalizeToZodObject, jsonSchemaToZodObject } from '../../../src/transport/mcp/ToolSchema';

describe('ToolSchema', () => {
  describe('jsonSchemaToZodObject', () => {
    it('should convert basic JSON Schema to Zod object', () => {
      const jsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          active: { type: 'boolean' }
        },
        required: ['name']
      };

      const zodSchema = jsonSchemaToZodObject(jsonSchema);
      expect(zodSchema).toBeDefined();

      // Test validation
      const validData = { name: 'John', age: 30, active: true };
      const result = zodSchema!.safeParse(validData);
      expect(result.success).toBe(true);

      // Test required field
      const invalidData = { age: 30 };
      const invalidResult = zodSchema!.safeParse(invalidData);
      expect(invalidResult.success).toBe(false);
    });

    it('should handle optional properties correctly', () => {
      const jsonSchema = {
        type: 'object',
        properties: {
          required_field: { type: 'string' },
          optional_field: { type: 'string' }
        },
        required: ['required_field']
      };

      const zodSchema = jsonSchemaToZodObject(jsonSchema);
      expect(zodSchema).toBeDefined();

      // Should pass with only required field
      const result1 = zodSchema!.safeParse({ required_field: 'test' });
      expect(result1.success).toBe(true);

      // Should pass with both fields
      const result2 = zodSchema!.safeParse({ 
        required_field: 'test', 
        optional_field: 'optional' 
      });
      expect(result2.success).toBe(true);
    });

    it('should handle nested objects', () => {
      const jsonSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' }
            },
            required: ['name']
          }
        },
        required: ['user']
      };

      const zodSchema = jsonSchemaToZodObject(jsonSchema);
      expect(zodSchema).toBeDefined();

      const validData = {
        user: {
          name: 'John',
          email: 'john@example.com'
        }
      };
      const result = zodSchema!.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should handle arrays', () => {
      const jsonSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' }
          },
          numbers: {
            type: 'array',
            items: { type: 'number' }
          }
        }
      };

      const zodSchema = jsonSchemaToZodObject(jsonSchema);
      expect(zodSchema).toBeDefined();

      const validData = {
        tags: ['tag1', 'tag2'],
        numbers: [1, 2, 3]
      };
      const result = zodSchema!.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should handle enums', () => {
      const jsonSchema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'pending']
          }
        }
      };

      const zodSchema = jsonSchemaToZodObject(jsonSchema);
      expect(zodSchema).toBeDefined();

      // Valid enum value
      const validResult = zodSchema!.safeParse({ status: 'active' });
      expect(validResult.success).toBe(true);

      // Invalid enum value
      const invalidResult = zodSchema!.safeParse({ status: 'invalid' });
      expect(invalidResult.success).toBe(false);
    });

    it('should return undefined for invalid schemas', () => {
      expect(jsonSchemaToZodObject(null)).toBeUndefined();
      expect(jsonSchemaToZodObject(undefined)).toBeUndefined();
      expect(jsonSchemaToZodObject('string')).toBeUndefined();
      expect(jsonSchemaToZodObject({ type: 'string' })).toBeUndefined(); // Not an object type
    });
  });

  describe('normalizeToZodObject', () => {
    it('should handle existing Zod schemas', () => {
      const existingZodSchema = z.object({
        name: z.string(),
        age: z.number()
      });

      const result = normalizeToZodObject(existingZodSchema);
      expect(result).toBe(existingZodSchema);
    });

    it('should handle Zod raw shapes', () => {
      const zodRawShape = {
        name: z.string(),
        age: z.number().optional()
      };

      const result = normalizeToZodObject(zodRawShape);
      expect(result).toBeDefined();
      expect(typeof result!.parse).toBe('function');

      // Test the resulting schema
      const validData = { name: 'John' };
      expect(() => result!.parse(validData)).not.toThrow();
    });

    it('should handle JSON Schema (MCP tool inputSchema format)', () => {
      const mcpToolSchema = {
        type: 'object',
        properties: {
          text: { type: 'string' },
          count: { type: 'integer' }
        },
        required: ['text']
      };

      const result = normalizeToZodObject(mcpToolSchema);
      expect(result).toBeDefined();

      // Test validation
      const validData = { text: 'hello', count: 5 };
      const parseResult = result!.safeParse(validData);
      expect(parseResult.success).toBe(true);
    });

    it('should return undefined for unrecognized schemas', () => {
      expect(normalizeToZodObject('invalid')).toBeUndefined();
      expect(normalizeToZodObject(123)).toBeUndefined();
      expect(normalizeToZodObject([])).toBeUndefined();
    });
  });

  describe('MCP tool schema examples', () => {
    it('should handle typical Amap tool schema', () => {
      // Example schema from Amap MCP tools
      const amapGeoSchema = {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: '待解析的结构化地址信息'
          },
          city: {
            type: 'string',
            description: '指定查询的城市'
          }
        },
        required: ['address']
      };

      const zodSchema = normalizeToZodObject(amapGeoSchema);
      expect(zodSchema).toBeDefined();

      // Test with valid Amap geo request
      const validRequest = {
        address: '北京市朝阳区望京SOHO',
        city: '北京'
      };
      const result = zodSchema!.safeParse(validRequest);
      expect(result.success).toBe(true);

      // Test with missing required field
      const invalidRequest = { city: '北京' };
      const invalidResult = zodSchema!.safeParse(invalidRequest);
      expect(invalidResult.success).toBe(false);
    });

    it('should handle complex nested tool schema', () => {
      // Example of a more complex tool schema
      const complexSchema = {
        type: 'object',
        properties: {
          origin: { type: 'string' },
          destination: { type: 'string' },
          options: {
            type: 'object',
            properties: {
              avoid_tolls: { type: 'boolean' },
              vehicle_type: {
                type: 'string',
                enum: ['car', 'truck', 'motorcycle']
              }
            }
          }
        },
        required: ['origin', 'destination']
      };

      const zodSchema = normalizeToZodObject(complexSchema);
      expect(zodSchema).toBeDefined();

      const validRequest = {
        origin: '116.397428,39.90923',
        destination: '116.507428,39.99923',
        options: {
          avoid_tolls: true,
          vehicle_type: 'car'
        }
      };
      const result = zodSchema!.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });
});
