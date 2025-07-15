import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BillingEngine } from '../engine';
import { FileConfigLoader } from '../config/fileLoader';
import { BillingContext } from '../types';

describe('BillingEngine Integration Tests', () => {
  const testConfigDir = path.join(__dirname, 'engine-test-configs');
  let engine: BillingEngine;

  beforeEach(async () => {
    // Create test config directory
    await fs.mkdir(testConfigDir, { recursive: true });
    const loader = new FileConfigLoader(testConfigDir);
    engine = new BillingEngine(loader);
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
serviceId: test-api
rules:
  - id: default-pricing
    default: true
    strategy:
      type: PerRequest
      price: "1500"
`;

    await fs.writeFile(
      path.join(testConfigDir, 'test-api.yaml'),
      yamlContent,
      'utf-8'
    );

    const ctx: BillingContext = {
      serviceId: 'test-api',
      operation: 'upload',
      meta: { path: '/upload', method: 'POST' }
    };

    const cost = await engine.calcCost(ctx);
    expect(cost).toBe(BigInt(1500));
  });

  it('should match rules by path', async () => {
    const yamlContent = `
version: 1
serviceId: web-api
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
      path.join(testConfigDir, 'web-api.yaml'),
      yamlContent,
      'utf-8'
    );

    // Test upload path
    const uploadCtx: BillingContext = {
      serviceId: 'web-api',
      operation: 'upload',
      meta: { path: '/upload', method: 'POST' }
    };

    const uploadCost = await engine.calcCost(uploadCtx);
    expect(uploadCost).toBe(BigInt(2000));

    // Test download path
    const downloadCtx: BillingContext = {
      serviceId: 'web-api',
      operation: 'download',
      meta: { path: '/download', method: 'GET' }
    };

    const downloadCost = await engine.calcCost(downloadCtx);
    expect(downloadCost).toBe(BigInt(500));

    // Test default path
    const defaultCtx: BillingContext = {
      serviceId: 'web-api',
      operation: 'other',
      meta: { path: '/other', method: 'GET' }
    };

    const defaultCost = await engine.calcCost(defaultCtx);
    expect(defaultCost).toBe(BigInt(1000));
  });

  it('should match rules by method', async () => {
    const yamlContent = `
version: 1
serviceId: rest-api
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
      path.join(testConfigDir, 'rest-api.yaml'),
      yamlContent,
      'utf-8'
    );

    // Test POST method
    const postCtx: BillingContext = {
      serviceId: 'rest-api',
      operation: 'create',
      meta: { method: 'POST', path: '/api/users' }
    };

    const postCost = await engine.calcCost(postCtx);
    expect(postCost).toBe(BigInt(3000));

    // Test GET method
    const getCtx: BillingContext = {
      serviceId: 'rest-api',
      operation: 'read',
      meta: { method: 'GET', path: '/api/users' }
    };

    const getCost = await engine.calcCost(getCtx);
    expect(getCost).toBe(BigInt(1000));
  });

  it('should cache strategies for repeated calls', async () => {
    const yamlContent = `
version: 1
serviceId: cached-service
rules:
  - id: default
    default: true
    strategy:
      type: PerRequest
      price: "1000"
`;

    await fs.writeFile(
      path.join(testConfigDir, 'cached-service.yaml'),
      yamlContent,
      'utf-8'
    );

    const ctx: BillingContext = {
      serviceId: 'cached-service',
      operation: 'test',
      meta: {}
    };

    // First call
    const cost1 = await engine.calcCost(ctx);
    
    // Second call should use cached strategy
    const cost2 = await engine.calcCost(ctx);

    expect(cost1).toBe(BigInt(1000));
    expect(cost2).toBe(BigInt(1000));
    expect(engine.getCachedServices()).toContain('cached-service');
  });

  it('should clear cache when requested', async () => {
    const yamlContent = `
version: 1
serviceId: cache-clear-test
rules:
  - id: default
    default: true
    strategy:
      type: PerRequest
      price: "1000"
`;

    await fs.writeFile(
      path.join(testConfigDir, 'cache-clear-test.yaml'),
      yamlContent,
      'utf-8'
    );

    const ctx: BillingContext = {
      serviceId: 'cache-clear-test',
      operation: 'test',
      meta: {}
    };

    // Load and cache
    await engine.calcCost(ctx);
    expect(engine.getCachedServices()).toContain('cache-clear-test');

    // Clear cache
    engine.clearCache('cache-clear-test');
    expect(engine.getCachedServices()).not.toContain('cache-clear-test');
  });

  it('should preload strategies', async () => {
    const yamlContent = `
version: 1
serviceId: preload-test
rules:
  - id: default
    default: true
    strategy:
      type: PerRequest
      price: "1000"
`;

    await fs.writeFile(
      path.join(testConfigDir, 'preload-test.yaml'),
      yamlContent,
      'utf-8'
    );

    // Preload strategy
    await engine.preloadStrategy('preload-test');
    expect(engine.getCachedServices()).toContain('preload-test');

    // Should work without loading again
    const ctx: BillingContext = {
      serviceId: 'preload-test',
      operation: 'test',
      meta: {}
    };

    const cost = await engine.calcCost(ctx);
    expect(cost).toBe(BigInt(1000));
  });
}); 