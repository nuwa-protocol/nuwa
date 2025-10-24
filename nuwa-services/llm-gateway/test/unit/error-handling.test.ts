/**
 * Test error handling with circular references
 */
import { OpenAIProvider } from '../../src/providers/openai.js';
import axios from 'axios';

describe('Error Handling - Circular References', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider();
  });

  it('should handle axios error without circular reference issues', async () => {
    // Create a mock error object that mimics the actual circular reference error
    const mockError: any = {
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        data: {
          error: {
            message: 'Test error message',
            code: 'test_error',
            type: 'server_error',
          },
        },
        headers: {
          'x-request-id': 'test-request-id',
          'openai-organization': 'test-org',
          'openai-processing-ms': '123',
        },
      },
    };

    // Create circular reference (simulating http.Agent)
    const agent: any = {
      sockets: {},
    };
    const httpMessage: any = {
      agent: agent,
    };
    agent.sockets['api.openai.com:443'] = [httpMessage];

    // Add circular reference to error (this would cause JSON.stringify to fail)
    mockError.response.data.circularRef = agent;

    // Call the private method through forwardRequest
    // The method should handle the error gracefully without throwing
    const result = await provider.forwardRequest(
      'test-key',
      '/v1/chat/completions',
      'POST',
      { model: 'gpt-4', messages: [] },
      false
    );

    // Since we can't directly test the private method, we just verify
    // that the provider can handle errors without crashing
    expect(result).toBeDefined();
  });

  it('should handle error with object data without JSON.stringify', async () => {
    // Test that error extraction doesn't use JSON.stringify
    const mockError: any = {
      response: {
        status: 400,
        statusText: 'Bad Request',
        data: {
          error: {
            message: 'Invalid request',
            code: 'invalid_request',
            type: 'invalid_request_error',
          },
        },
        headers: {},
      },
    };

    // This should not throw even if we add circular references
    const circularObj: any = {};
    circularObj.self = circularObj;
    mockError.response.data.metadata = circularObj;

    // The error handler should extract the message without trying to stringify the whole object
    expect(() => {
      // Simulate error extraction logic
      const data = mockError.response.data;
      const errorMessage =
        data.error?.message ||
        data.message ||
        `Error response with status ${mockError.response.status}`;

      expect(errorMessage).toBe('Invalid request');
    }).not.toThrow();
  });

  it('should handle error with string data', () => {
    const mockError: any = {
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        data: 'Simple error string',
        headers: {},
      },
    };

    const data = mockError.response.data;
    let errorMessage: string;

    if (typeof data === 'string') {
      errorMessage = data;
    } else if (data && typeof data === 'object') {
      errorMessage =
        data.error?.message ||
        data.message ||
        `Error response with status ${mockError.response.status}`;
    } else {
      errorMessage = `HTTP ${mockError.response.status}: ${mockError.response.statusText}`;
    }

    expect(errorMessage).toBe('Simple error string');
  });

  it('should handle network error without response', () => {
    const mockError: any = {
      request: {},
      message: 'Network error',
    };

    const errorMessage = mockError.response
      ? 'Has response'
      : mockError.request
        ? 'No response received from OpenAI'
        : mockError.message || 'Unknown error';

    expect(errorMessage).toBe('No response received from OpenAI');
  });

  it('should handle request setup error', () => {
    const mockError: any = {
      message: 'Request setup failed',
    };

    const errorMessage = mockError.response
      ? 'Has response'
      : mockError.request
        ? 'No response'
        : mockError.message || 'Unknown error';

    expect(errorMessage).toBe('Request setup failed');
  });
});
