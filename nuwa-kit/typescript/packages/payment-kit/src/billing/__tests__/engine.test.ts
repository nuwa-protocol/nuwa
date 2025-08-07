import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BillingEngine } from '../engine/billingEngine';
import { FileConfigLoader } from '../config/fileLoader';
import { BillingContext, BillingRule } from '../core/types';
import { RuleProvider } from '../core/types';
// Import strategies to trigger registration
import '../strategies';

// Test RuleProvider that adapts FileConfigLoader for a specific service
class TestRuleProvider implements RuleProvider {
  constructor(
    private readonly configLoader: FileConfigLoader,
    private readonly serviceId: string
  ) {}

  getRules(): BillingRule[] {
    // This is a synchronous version for testing - in real usage you'd cache the loaded config
    return this.rules || [];
  }

  private rules: BillingRule[] = [];

  async loadRules(): Promise<void> {
    const config = await this.configLoader.load(this.serviceId);
    this.rules = config.rules;
  }
}

describe('BillingEngine Integration Tests', () => {
  const testConfigDir = path.join(__dirname, 'engine-test-configs');
  let engine: BillingEngine;
  let ruleProvider: TestRuleProvider;

  beforeEach(async () => {
    // Create test config directory
    await fs.mkdir(testConfigDir, { recursive: true });
    const loader = new FileConfigLoader(testConfigDir);
    ruleProvider = new TestRuleProvider(loader, 'test-service');
    engine = new BillingEngine(ruleProvider);
  });

  afterEach(async () => {
    // Clean up test config directory
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should calculate cost using PerRequest strategy', async () => {
    // Create test configuration
    const yamlContent = `
version: 1
serviceId: test-service
rules:
  - id: default-pricing
    default: true
    strategy:
      type: PerRequest
      price: "1500"
`;

    await fs.writeFile(
      path.join(testConfigDir, 'test-service.yaml'),
      yamlContent,
      'utf-8'
    );

    // Load rules into the provider
    await ruleProvider.loadRules();

    const ctx: BillingContext = {
      serviceId: 'test-service',
      meta: { operation: 'upload', path: '/upload', method: 'POST' }
    };

    const cost = await engine.calcCost(ctx);
    expect(cost).toBe(BigInt(1500));
  });

  it('should match rules by path', async () => {
    const yamlContent = `
version: 1
serviceId: test-service
rules:
  - id: upload-pricing
    when:
      path: "/upload"
    strategy:
      type: PerRequest
      price: "2000"
  - id: download-pricing
    when:
      path: "/download"
    strategy:
      type: PerRequest
      price: "500"
  - id: default-pricing
    default: true
    strategy:
      type: PerRequest
      price: "1000"
`;

    await fs.writeFile(
      path.join(testConfigDir, 'test-service.yaml'),
      yamlContent,
      'utf-8'
    );

    // Load rules into the provider
    await ruleProvider.loadRules();

    // Test upload path
    const uploadCtx: BillingContext = {
      serviceId: 'test-service',
      meta: { operation: 'upload', path: '/upload', method: 'POST' }
    };

    const uploadCost = await engine.calcCost(uploadCtx);
    expect(uploadCost).toBe(BigInt(2000));

    // Test download path
    const downloadCtx: BillingContext = {
      serviceId: 'test-service',
      meta: { operation: 'download', path: '/download', method: 'GET' }
    };

    const downloadCost = await engine.calcCost(downloadCtx);
    expect(downloadCost).toBe(BigInt(500));

    // Test default path
    const defaultCtx: BillingContext = {
      serviceId: 'test-service',
      meta: { operation: 'other', path: '/other', method: 'GET' }
    };

    const defaultCost = await engine.calcCost(defaultCtx);
    expect(defaultCost).toBe(BigInt(1000));
  });

  it('should match rules by method', async () => {
    const yamlContent = `
version: 1
serviceId: test-service
rules:
  - id: post-pricing
    when:
      method: "POST"
    strategy:
      type: PerRequest
      price: "3000"
  - id: get-pricing
    when:
      method: "GET"
    strategy:
      type: PerRequest
      price: "1000"
  - id: default-pricing
    default: true
    strategy:
      type: PerRequest
      price: "2000"
`;

    await fs.writeFile(
      path.join(testConfigDir, 'test-service.yaml'),
      yamlContent,
      'utf-8'
    );

    // Load rules into the provider
    await ruleProvider.loadRules();

    // Test POST method
    const postCtx: BillingContext = {
      serviceId: 'test-service',
      meta: { operation: 'create', method: 'POST', path: '/api/users' }
    };

    const postCost = await engine.calcCost(postCtx);
    expect(postCost).toBe(BigInt(3000));

    // Test GET method
    const getCtx: BillingContext = {
      serviceId: 'test-service',
      meta: { operation: 'read', method: 'GET', path: '/api/users' }
    };

    const getCost = await engine.calcCost(getCtx);
    expect(getCost).toBe(BigInt(1000));
  });

}); 