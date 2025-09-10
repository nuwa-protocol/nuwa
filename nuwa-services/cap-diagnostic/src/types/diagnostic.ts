import type { Cap } from './cap.js';

export interface DiagnosticConfig {
  llm: {
    provider: 'openrouter' | 'litellm';
    apiKey?: string;
    baseURL?: string;
    timeout?: number;
  };
  mcp: {
    timeout: number;
    retries: number;
  };
  diagnostic: {
    testMessages: string[];
    maxSteps?: number;
    maxRetries?: number;
  };
}

export interface DiagnosticResult {
  capId: string;
  capName: string;
  success: boolean;
  timestamp: number;
  duration: number;
  tests: TestResult[];
  summary: DiagnosticSummary;
}

export interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
  details?: Record<string, any>;
}

export interface DiagnosticSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
}

export interface CapTestContext {
  cap: Cap;
  config: DiagnosticConfig;
  logger: any;
}

export interface LLMTestResult {
  modelId: string;
  success: boolean;
  response?: string;
  error?: string;
  duration: number;
}

export interface MCPTestResult {
  serverName: string;
  url: string;
  success: boolean;
  toolsCount: number;
  error?: string;
  duration: number;
}

export interface CapValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
