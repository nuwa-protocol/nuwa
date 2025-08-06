import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ConfigLoader, BillingConfig } from '../core/types';

/**
 * File-based configuration loader for YAML billing configurations
 */
export class FileConfigLoader implements ConfigLoader {
  private readonly configDir: string;
  private readonly cache = new Map<string, BillingConfig>();

  /**
   * @param configDir Directory containing YAML configuration files
   */
  constructor(configDir: string = './config/billing') {
    this.configDir = configDir;
  }

  /**
   * Load billing configuration from YAML file
   * Files should be named as {serviceId}.yaml or {serviceId}.yml
   */
  async load(serviceId: string): Promise<BillingConfig> {
    // Check cache first
    if (this.cache.has(serviceId)) {
      return this.cache.get(serviceId)!;
    }

    // Try different file extensions
    const possibleFiles = [
      `${serviceId}.yaml`,
      `${serviceId}.yml`
    ];

    for (const fileName of possibleFiles) {
      const filePath = path.join(this.configDir, fileName);
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const config = yaml.load(content) as BillingConfig;
        
        // Validate basic structure
        this.validateConfig(config, serviceId);
        
        // Cache and return
        this.cache.set(serviceId, config);
        return config;
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          // File doesn't exist, try next extension
          continue;
        }
        throw new Error(`Error loading config for service ${serviceId}: ${error}`);
      }
    }

    throw new Error(`No configuration file found for service: ${serviceId} in directory: ${this.configDir}`);
  }

  /**
   * Clear cache for a specific service or all services
   */
  clearCache(serviceId?: string): void {
    if (serviceId) {
      this.cache.delete(serviceId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Validate the loaded configuration
   */
  private validateConfig(config: any, serviceId: string): void {
    if (!config) {
      throw new Error(`Invalid configuration: config is null or undefined for service ${serviceId}`);
    }

    if (typeof config.version !== 'number') {
      throw new Error(`Invalid configuration: version must be a number for service ${serviceId}`);
    }

    if (typeof config.serviceId !== 'string') {
      throw new Error(`Invalid configuration: serviceId must be a string for service ${serviceId}`);
    }

    if (config.serviceId !== serviceId) {
      throw new Error(`Invalid configuration: serviceId "${config.serviceId}" does not match requested service "${serviceId}"`);
    }

    if (!Array.isArray(config.rules)) {
      throw new Error(`Invalid configuration: rules must be an array for service ${serviceId}`);
    }

    if (config.rules.length === 0) {
      throw new Error(`Invalid configuration: at least one rule is required for service ${serviceId}`);
    }

    // Validate each rule
    for (let i = 0; i < config.rules.length; i++) {
      const rule = config.rules[i];
      
      if (!rule.id || typeof rule.id !== 'string') {
        throw new Error(`Invalid configuration: rule[${i}].id must be a non-empty string for service ${serviceId}`);
      }

      if (!rule.strategy || typeof rule.strategy !== 'object') {
        throw new Error(`Invalid configuration: rule[${i}].strategy must be an object for service ${serviceId}`);
      }

      if (!rule.strategy.type || typeof rule.strategy.type !== 'string') {
        throw new Error(`Invalid configuration: rule[${i}].strategy.type must be a string for service ${serviceId}`);
      }
    }

    // Ensure there's at least one default rule or all rules have when conditions
    const hasDefault = config.rules.some((rule: any) => rule.default === true);
    const allHaveConditions = config.rules.every((rule: any) => rule.when || rule.default);
    
    if (!hasDefault && !allHaveConditions) {
      throw new Error(`Invalid configuration: must have either a default rule or all rules must have 'when' conditions for service ${serviceId}`);
    }
  }
} 