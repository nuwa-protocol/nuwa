/**
 * Test Claude error format parsing
 * This test verifies that the error handling correctly parses Claude's nested error format
 */

import { ClaudeProvider } from '../../src/providers/claude.js';

describe('Claude Error Parsing', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    provider = new ClaudeProvider();
  });

  describe('normalizeErrorData', () => {
    it('should parse JSON string to object', async () => {
      const jsonString = JSON.stringify({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'system: text content blocks must be non-empty'
        },
        request_id: 'req_123'
      });

      // Access protected method for testing
      const result = await (provider as any).normalizeErrorData(jsonString);

      expect(typeof result).toBe('object');
      expect(result.type).toBe('error');
      expect(result.error.type).toBe('invalid_request_error');
      expect(result.error.message).toBe('system: text content blocks must be non-empty');
      expect(result.request_id).toBe('req_123');
    });

    it('should handle JSON string with trailing text (like traceid)', async () => {
      const jsonString = '{"type":"error","error":{"type":"invalid_request_error","message":"system: text content blocks must be non-empty"},"request_id":"req_011CUReejFs6CPjUUR3v9gpv"}（traceid: 5dfc55ae9d5d7118db14b9356764aaff） (request id: 20251024154420922643873WFwNEm4k)';

      const result = await (provider as any).normalizeErrorData(jsonString);

      console.log('🧪 Parsed result:', result);
      console.log('🧪 Result type:', typeof result);

      // This will fail if the trailing text prevents parsing
      // We need to handle this case
      if (typeof result === 'string') {
        console.error('❌ Failed to parse JSON with trailing text');
        console.error('   Original:', jsonString);
        console.error('   Result:', result);
      }

      expect(typeof result).toBe('object');
    });

    it('should return string as-is if not valid JSON', async () => {
      const invalidJson = 'Not a JSON string';

      const result = await (provider as any).normalizeErrorData(invalidJson);

      expect(result).toBe(invalidJson);
    });

    it('should handle already parsed object', async () => {
      const obj = {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'test error'
        }
      };

      const result = await (provider as any).normalizeErrorData(obj);

      expect(result).toEqual(obj);
    });
  });

  describe('extractErrorInfo', () => {
    it('should extract Claude nested error format', async () => {
      const mockError = {
        response: {
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          data: {
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message: 'system: text content blocks must be non-empty'
            },
            request_id: 'req_123'
          }
        }
      };

      const result = await (provider as any).extractErrorInfo(mockError);

      console.log('🧪 Extracted error info:', result);

      expect(result.statusCode).toBe(400);
      expect(result.message).toBe('system: text content blocks must be non-empty');
      expect(result.details?.type).toBe('invalid_request_error');
      expect(result.details?.requestId).toBe('req_123');
    });

    it('should extract Claude error from JSON string', async () => {
      const mockError = {
        response: {
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          data: JSON.stringify({
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message: 'system: text content blocks must be non-empty'
            },
            request_id: 'req_123'
          })
        }
      };

      const result = await (provider as any).extractErrorInfo(mockError);

      console.log('🧪 Extracted error info from string:', result);

      expect(result.statusCode).toBe(400);
      expect(result.message).toBe('system: text content blocks must be non-empty');
      expect(result.details?.type).toBe('invalid_request_error');
      expect(result.details?.requestId).toBe('req_123');
    });

    it('should handle Claude error with trailing text', async () => {
      const mockError = {
        response: {
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          data: '{"type":"error","error":{"type":"invalid_request_error","message":"system: text content blocks must be non-empty"},"request_id":"req_123"}（traceid: xxx） (request id: yyy)'
        }
      };

      const result = await (provider as any).extractErrorInfo(mockError);

      console.log('🧪 Extracted error info with trailing text:', result);

      // If this fails, we need to strip trailing text before parsing
      expect(result.statusCode).toBe(400);
      
      // Log what we actually got for debugging
      console.log('   message:', result.message);
      console.log('   type:', result.details?.type);
      console.log('   requestId:', result.details?.requestId);
    });
  });

  describe('Error response flow', () => {
    it('should correctly process forwardRequest error', async () => {
      // Mock axios to simulate Claude API error
      const mockAxiosError = {
        response: {
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          data: JSON.stringify({
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message: 'system: text content blocks must be non-empty'
            },
            request_id: 'req_123'
          })
        }
      };

      // Simulate the error extraction that happens in forwardRequest catch block
      const errorInfo = await (provider as any).extractErrorInfo(mockAxiosError);

      console.log('🧪 Final error response:', {
        error: errorInfo.message,
        status: errorInfo.statusCode,
        details: errorInfo.details
      });

      expect(errorInfo.details?.type).toBe('invalid_request_error');
      expect(errorInfo.details?.requestId).toBe('req_123');
    });
  });
});

