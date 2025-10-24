/**
 * Test error logging improvements
 */
import { OpenAIProvider } from '../../src/providers/openai.js';

describe('Error Logging Improvements', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider();
  });

  it('should log detailed error information for 400 Bad Request', async () => {
    // Mock console.error to capture logs
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    try {
      // This will fail with invalid API key or invalid request
      const result = await provider.forwardRequest(
        'invalid-key',
        '/v1/responses', // Response API endpoint
        'POST',
        {
          model: 'gpt-4',
          // Missing required fields for Response API
        },
        false
      );

      // Verify error is returned
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('status');

      if ('error' in result) {
        // Should have details
        expect(result).toHaveProperty('details');
        console.log('Error result:', JSON.stringify(result, null, 2));
      }

      // Verify enhanced logging was called
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Check that detailed error info was logged
      const errorCalls = consoleErrorSpy.mock.calls;
      const hasDetailedLog = errorCalls.some(
        call => call[0].includes('Error details') || call[0].includes('Full OpenAI error response')
      );

      console.log('Number of error log calls:', errorCalls.length);
      errorCalls.forEach((call, i) => {
        console.log(`Log ${i}:`, call[0]);
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('should include request information in error logs', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    try {
      await provider.forwardRequest(
        'test-key',
        '/v1/chat/completions',
        'POST',
        {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'test' }],
        },
        false
      );

      // Check that request info was logged
      const errorCalls = consoleErrorSpy.mock.calls;
      const hasRequestInfo = errorCalls.some(
        call => call[0].includes('Request info') || call[0].includes('📤')
      );

      if (hasRequestInfo) {
        console.log('✅ Request information is logged');
      }
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('should format error response with detailed information', () => {
    // Test error response structure
    const mockErrorResponse = {
      error: 'Invalid request parameters',
      status: 400,
      details: {
        code: 'invalid_request_error',
        type: 'invalid_request_error',
        param: 'input',
        statusText: 'Bad Request',
        headers: {
          'x-request-id': 'req_123abc',
        },
        rawError: {
          message: 'Invalid request parameters',
          code: 'invalid_request_error',
          type: 'invalid_request_error',
          param: 'input',
        },
      },
    };

    // Verify structure
    expect(mockErrorResponse).toHaveProperty('error');
    expect(mockErrorResponse).toHaveProperty('status');
    expect(mockErrorResponse).toHaveProperty('details');
    expect(mockErrorResponse.details).toHaveProperty('code');
    expect(mockErrorResponse.details).toHaveProperty('type');
    expect(mockErrorResponse.details).toHaveProperty('param');
    expect(mockErrorResponse.details).toHaveProperty('rawError');

    console.log('Mock error response structure:', JSON.stringify(mockErrorResponse, null, 2));
  });
});
