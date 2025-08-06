import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileConfigLoader } from '../config/fileLoader';
import { BillingConfig } from '../core/types';

describe('FileConfigLoader', () => {
  const testConfigDir = path.join(__dirname, 'test-configs');
  let loader: FileConfigLoader;

  beforeEach(async () => {
    // Create test config directory
    await fs.mkdir(testConfigDir, { recursive: true });
    loader = new FileConfigLoader(testConfigDir);
  });

  afterEach(async () => {
    // Clean up test config directory
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should load valid YAML configuration', async () => {
    const config: BillingConfig = {
      version: 1,
      serviceId: 'test-service',
      rules: [
        {
          id: 'fixed-price',
          strategy: {
            type: 'PerRequest',
            price: '1000'
          },
          default: true
        }
      ]
    };

    const configPath = path.join(testConfigDir, 'test-service.yaml');
    const yamlContent = `
version: 1
serviceId: test-service
rules:
  - id: fixed-price
    default: true
    strategy:
      type: PerRequest
      price: "1000"
`;

    await fs.writeFile(configPath, yamlContent, 'utf-8');

    const loadedConfig = await loader.load('test-service');
    expect(loadedConfig.version).toBe(1);
    expect(loadedConfig.serviceId).toBe('test-service');
    expect(loadedConfig.rules).toHaveLength(1);
    expect(loadedConfig.rules[0].id).toBe('fixed-price');
    expect(loadedConfig.rules[0].strategy.type).toBe('PerRequest');
    expect(loadedConfig.rules[0].strategy.price).toBe('1000');
  });

  it('should try .yml extension if .yaml not found', async () => {
    const configPath = path.join(testConfigDir, 'test-service.yml');
    const yamlContent = `
version: 1
serviceId: test-service
rules:
  - id: default-rule
    default: true
    strategy:
      type: PerRequest
      price: "500"
`;

    await fs.writeFile(configPath, yamlContent, 'utf-8');

    const loadedConfig = await loader.load('test-service');
    expect(loadedConfig.serviceId).toBe('test-service');
  });

  it('should throw error for non-existent service', async () => {
    await expect(loader.load('non-existent-service')).rejects.toThrow(
      'No configuration file found for service: non-existent-service'
    );
  });

  it('should validate service ID matches', async () => {
    const configPath = path.join(testConfigDir, 'test-service.yaml');
    const yamlContent = `
version: 1
serviceId: different-service
rules:
  - id: rule1
    default: true
    strategy:
      type: PerRequest
      price: "1000"
`;

    await fs.writeFile(configPath, yamlContent, 'utf-8');

    await expect(loader.load('test-service')).rejects.toThrow(
      'serviceId "different-service" does not match requested service "test-service"'
    );
  });

  it('should cache loaded configurations', async () => {
    const configPath = path.join(testConfigDir, 'cached-service.yaml');
    const yamlContent = `
version: 1
serviceId: cached-service
rules:
  - id: rule1
    default: true
    strategy:
      type: PerRequest
      price: "1000"
`;

    await fs.writeFile(configPath, yamlContent, 'utf-8');

    // Load first time
    const config1 = await loader.load('cached-service');
    
    // Delete the file
    await fs.unlink(configPath);
    
    // Should still load from cache
    const config2 = await loader.load('cached-service');
    
    expect(config1).toEqual(config2);
  });

  it('should clear cache when requested', async () => {
    const configPath = path.join(testConfigDir, 'cache-test.yaml');
    const yamlContent = `
version: 1
serviceId: cache-test
rules:
  - id: rule1
    default: true
    strategy:
      type: PerRequest
      price: "1000"
`;

    await fs.writeFile(configPath, yamlContent, 'utf-8');

    // Load and cache
    await loader.load('cache-test');
    
    // Clear cache
    loader.clearCache('cache-test');
    
    // Delete file
    await fs.unlink(configPath);
    
    // Should fail now since cache is cleared and file is gone
    await expect(loader.load('cache-test')).rejects.toThrow(
      'No configuration file found for service: cache-test'
    );
  });
}); 