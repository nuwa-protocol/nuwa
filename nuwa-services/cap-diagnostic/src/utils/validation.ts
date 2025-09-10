import type { Cap } from '../types/cap.js';
import type { CapValidationResult } from '../types/diagnostic.js';

export class CapValidator {
  static validate(cap: Cap): CapValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate basic structure
    if (!cap.id) {
      errors.push('CAP ID is required');
    }

    if (!cap.metadata?.displayName) {
      errors.push('CAP name is required');
    }

    if (!cap.core) {
      errors.push('CAP core configuration is required');
    } else {
      // Validate core configuration
      if (!cap.core.prompt?.value) {
        errors.push('CAP prompt is required');
      }

      if (!cap.core.model?.id) {
        errors.push('CAP model ID is required');
      }

      // Validate MCP servers
      if (cap.core.mcpServers) {
        for (const [serverName, serverConfig] of Object.entries(cap.core.mcpServers)) {
          const config = serverConfig as any; // Type assertion for MCP server config
          if (!config.url) {
            errors.push(`MCP server ${serverName} is missing URL`);
          }

          if (!config.transport) {
            warnings.push(`MCP server ${serverName} is missing transport type, will auto-detect`);
          }

          // Validate URL format
          try {
            new URL(config.url);
          } catch {
            errors.push(`MCP server ${serverName} has invalid URL: ${config.url}`);
          }
        }
      }
    }

    // Validate metadata
    if (cap.metadata) {
      if (!cap.metadata.description) {
        warnings.push('CAP description is missing');
      }

      // Version is not required in the current schema
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  static validatePrompt(prompt: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!prompt || prompt.trim().length === 0) {
      errors.push('Prompt cannot be empty');
    }

    if (prompt.length > 10000) {
      errors.push('Prompt is too long (max 10,000 characters)');
    }

    // Check for common issues
    if (prompt.includes('{{user_geo}}') && !prompt.includes('geolocation')) {
      errors.push('Prompt uses {{user_geo}} but may not handle geolocation properly');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateModel(modelId: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!modelId || modelId.trim().length === 0) {
      errors.push('Model ID cannot be empty');
    }

    // Check for valid model ID format
    if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(modelId)) {
      errors.push('Model ID format is invalid (expected: provider/model-name)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
