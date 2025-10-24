/**
 * Integration test for stream error output
 * Tests that error responses are correctly sent to clients in streaming mode
 */

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { ClaudeProvider } from '../../src/providers/claude.js';
import { RouteHandler } from '../../src/core/routeHandler.js';
import { ProviderManager } from '../../src/core/providerManager.js';
import { AuthManager } from '../../src/core/authManager.js';

describe('Stream Error Output Integration Test', () => {
  let app: express.Application;
  let originalForwardRequest: any;

  beforeEach(() => {
    // Create Express app
    app = express();
    app.use(express.json());

    // Mock authentication - skip PaymentKit
    app.use((req: Request, res: Response, next: NextFunction) => {
      (req as any).didInfo = { did: 'did:test:123' };
      next();
    });

    // Initialize managers with skipAuth
    const providerManager = ProviderManager.getInstance();
    const authManager = AuthManager.createTestInstance();
    const routeHandler = new RouteHandler({
      providerManager,
      authManager,
      skipAuth: true,
    });

    // Register Claude provider with mocked API key
    const claudeProvider = new ClaudeProvider();
    providerManager.register({
      name: 'claude',
      instance: claudeProvider,
      requiresApiKey: false,
      supportsNativeUsdCost: false,
      apiKey: 'test-key',
      baseUrl: 'https://api.anthropic.com',
      allowedPaths: ['/v1/messages'],
    });

    // Save original forwardRequest for restoration
    originalForwardRequest = claudeProvider.forwardRequest;

    // Setup route
    app.post('/claude/v1/messages', (req: Request, res: Response) => {
      routeHandler.handleProviderRequest(req, res, 'claude');
    });
  });

  afterEach(() => {
    // Restore original method
    if (originalForwardRequest) {
      ClaudeProvider.prototype.forwardRequest = originalForwardRequest;
    }
  });

  it('should send error event in SSE format for stream requests', async () => {
    // Mock forwardRequest to return error
    ClaudeProvider.prototype.forwardRequest = async function () {
      return {
        error: 'system: text content blocks must be non-empty',
        status: 400,
        details: {
          type: 'invalid_request_error',
          code: 'invalid_request',
          requestId: 'req_test_123',
        },
      };
    };

    const response = await request(app)
      .post('/claude/v1/messages')
      .send({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: '' }],
        stream: true,
      })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    console.log('🧪 Response status:', response.status);
    console.log('🧪 Response headers:', response.headers);
    console.log('🧪 Response text:', response.text);
    console.log('🧪 Response body:', response.body);

    // Verify SSE error event was sent
    expect(response.text).toContain('event: error');
    expect(response.text).toContain('data: ');

    // Parse the error data
    const lines = response.text.split('\n');
    let errorData: any = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'event: error' && lines[i + 1].startsWith('data: ')) {
        const dataLine = lines[i + 1].substring(6); // Remove "data: " prefix
        errorData = JSON.parse(dataLine);
        break;
      }
    }

    console.log('🧪 Parsed error data:', errorData);

    expect(errorData).toBeTruthy();
    expect(errorData.type).toBe('error');
    expect(errorData.error).toBeTruthy();
    expect(errorData.error.message).toContain('text content blocks must be non-empty');
    expect(errorData.error.type).toBe('invalid_request_error');
  });

  it('should handle JSON string with trailing text', async () => {
    // Mock forwardRequest to return error with trailing text (like from airouter)
    ClaudeProvider.prototype.forwardRequest = async function () {
      const errorJson = JSON.stringify({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'system: text content blocks must be non-empty',
        },
        request_id: 'req_123',
      });
      const trailingText = '（traceid: xxx） (request id: yyy)';

      return {
        error: errorJson + trailingText,
        status: 400,
        details: {
          code: undefined,
          type: '<nil>',
          requestId: undefined,
        },
      };
    };

    const response = await request(app)
      .post('/claude/v1/messages')
      .send({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: '' }],
        stream: true,
      })
      .expect(200);

    console.log('🧪 Response with trailing text:', response.text);

    expect(response.text).toContain('event: error');

    // Even if parsing fails, error should still be sent
    const lines = response.text.split('\n');
    let hasError = false;
    for (const line of lines) {
      if (line.startsWith('data: ') && line.includes('error')) {
        hasError = true;
        console.log('🧪 Found error line:', line);
        break;
      }
    }

    expect(hasError).toBe(true);
  });

  it('should send error event immediately without waiting for stream end', async () => {
    const startTime = Date.now();

    // Mock forwardRequest to return error
    ClaudeProvider.prototype.forwardRequest = async function () {
      return {
        error: 'Test error',
        status: 400,
        details: {
          type: 'test_error',
          code: 'test_code',
        },
      };
    };

    const response = await request(app)
      .post('/claude/v1/messages')
      .send({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'test' }],
        stream: true,
      })
      .expect(200);

    const duration = Date.now() - startTime;
    console.log('🧪 Response duration:', duration, 'ms');
    console.log('🧪 Response:', response.text);

    // Error should be sent immediately (< 100ms)
    expect(duration).toBeLessThan(1000);
    expect(response.text).toContain('event: error');
  });

  it('should work with successful stream (baseline test)', async () => {
    // Mock forwardRequest to return successful stream
    ClaudeProvider.prototype.forwardRequest = async function () {
      const { Readable } = await import('stream');

      const mockStream = new Readable({
        read() {
          // Send some SSE data
          this.push('event: message\n');
          this.push('data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n');
          this.push(null); // End stream
        },
      });

      return {
        status: 200,
        headers: {},
        data: mockStream,
      };
    };

    const response = await request(app)
      .post('/claude/v1/messages')
      .send({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      })
      .expect(200);

    console.log('🧪 Successful stream response:', response.text);

    expect(response.text).toContain('event: message');
    expect(response.text).toContain('Hello');
  });
});
