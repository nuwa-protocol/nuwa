import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticEngine } from '../core/diagnostic-engine.js';
import { CapValidator } from '../utils/validation.js';
import type { DiagnosticConfig, Cap } from '../types/diagnostic.js';
import sampleCap from './fixtures/sample-cap.json';

describe('DiagnosticEngine', () => {
  let config: DiagnosticConfig;
  let engine: DiagnosticEngine;

  beforeEach(() => {
    config = {
      llm: {
        provider: 'openrouter',
        apiKey: 'test-key',
        baseURL: 'https://openrouter.ai/api/v1',
        timeout: 5000,
      },
      mcp: {
        timeout: 5000,
        retries: 1,
      },
      diagnostic: {
        testMessages: ['Hello, test message'],
        maxSteps: 1,
        maxRetries: 1,
      },
    };
    engine = new DiagnosticEngine(config);
  });

  describe('diagnoseCap', () => {
    it('should validate CAP structure', async () => {
      const result = await engine.diagnoseCap(sampleCap as Cap);
      
      expect(result).toBeDefined();
      expect(result.capId).toBe('sample-cap-001');
      expect(result.capName).toBe('Sample CAP');
      expect(result.tests).toHaveLength(5);
      expect(result.summary.totalTests).toBe(5);
    });

    it('should handle invalid CAP gracefully', async () => {
      const invalidCap = {
        id: 'invalid-cap',
        metadata: { name: 'Invalid CAP' },
        core: {
          prompt: { value: '' }, // Invalid: empty prompt
          model: { id: '' }, // Invalid: empty model
        },
      } as Cap;

      const result = await engine.diagnoseCap(invalidCap);
      
      expect(result.success).toBe(false);
      expect(result.summary.criticalIssues.length).toBeGreaterThan(0);
    });
  });
});

describe('CapValidator', () => {
  describe('validate', () => {
    it('should validate a correct CAP', () => {
      const result = CapValidator.validate(sampleCap as Cap);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing CAP ID', () => {
      const invalidCap = { ...sampleCap, id: undefined } as Cap;
      const result = CapValidator.validate(invalidCap);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('CAP ID is required');
    });

    it('should detect missing prompt', () => {
      const invalidCap = {
        ...sampleCap,
        core: { ...sampleCap.core, prompt: { value: '' } },
      } as Cap;
      const result = CapValidator.validate(invalidCap);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('CAP prompt is required');
    });

    it('should detect invalid MCP server URL', () => {
      const invalidCap = {
        ...sampleCap,
        core: {
          ...sampleCap.core,
          mcpServers: {
            test: {
              url: 'invalid-url',
              transport: 'httpStream',
            },
          },
        },
      } as Cap;
      const result = CapValidator.validate(invalidCap);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid URL'))).toBe(true);
    });
  });

  describe('validatePrompt', () => {
    it('should validate a correct prompt', () => {
      const result = CapValidator.validatePrompt('This is a valid prompt');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect empty prompt', () => {
      const result = CapValidator.validatePrompt('');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Prompt cannot be empty');
    });

    it('should detect overly long prompt', () => {
      const longPrompt = 'a'.repeat(10001);
      const result = CapValidator.validatePrompt(longPrompt);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Prompt is too long');
    });
  });

  describe('validateModel', () => {
    it('should validate a correct model ID', () => {
      const result = CapValidator.validateModel('openai/gpt-4o');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect empty model ID', () => {
      const result = CapValidator.validateModel('');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Model ID cannot be empty');
    });

    it('should detect invalid model ID format', () => {
      const result = CapValidator.validateModel('invalid-model-id');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Model ID format is invalid');
    });
  });
});
