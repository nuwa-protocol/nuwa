import type { LanguageModelV1 } from '@ai-sdk/provider';
import type { Cap } from '../types/cap.js';
import type { DiagnosticConfig } from '../types/diagnostic.js';
import { MCPManager } from './mcp-manager.js';
import { LLMProvider } from './llm-provider.js';
import { logger } from '../utils/logger.js';

export class CapResolver {
  private cap: Cap;
  private config: DiagnosticConfig;
  private mcpManager: MCPManager;
  private llmProvider: LLMProvider;
  private hasMCPServers: boolean;

  constructor(cap: Cap, config: DiagnosticConfig) {
    this.cap = cap;
    this.config = config;
    this.mcpManager = MCPManager.getInstance();
    this.llmProvider = new LLMProvider(config.llm);
    this.hasMCPServers = Object.keys(this.cap.core.mcpServers || {}).length > 0;
  }

  /**
   * Get user location (server-side version)
   * For server-side, we'll use a default location or environment variable
   */
  private async getUserLocation(): Promise<string> {
    // Check if location is provided via environment variable
    const envLocation = process.env.USER_LOCATION;
    if (envLocation) {
      return envLocation;
    }

    // Check if timezone is available
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return timezone.split('/').pop() || 'UTC';
    } catch {
      return 'UTC';
    }
  }

  /**
   * Resolve variables in the prompt
   */
  private async resolveVariables(prompt: string): Promise<string> {
    let resolvedPrompt = prompt;

    // Resolve {{user_geo}} variable
    if (resolvedPrompt.includes('{{user_geo}}')) {
      const userLocation = await this.getUserLocation();
      resolvedPrompt = resolvedPrompt.replace(
        /\{\{user_geo\}\}/g,
        userLocation,
      );
      logger.debug('Resolved user_geo variable', { userLocation });
    }

    // Add more variable resolvers as needed
    // For example: {{timestamp}}, {{date}}, etc.

    return resolvedPrompt;
  }

  /**
   * Get the resolved prompt with variables substituted
   */
  async getResolvedPrompt(): Promise<string> {
    const prompt = this.cap.core.prompt.value;
    return await this.resolveVariables(prompt);
  }

  /**
   * Get the resolved model instance
   */
  getResolvedModel(): LanguageModelV1 {
    const modelId = this.cap.core.model.id;
    logger.debug('Resolving model', { modelId });
    return this.llmProvider.chat(modelId);
  }

  /**
   * Get the resolved tools from MCP servers
   */
  async getResolvedTools(): Promise<Record<string, any>> {
    if (this.hasMCPServers) {
      try {
        logger.debug('Resolving MCP tools', { capId: this.cap.id });
        const tools = await this.mcpManager.initializeForCap(this.cap);
        logger.info('MCP tools resolved', { 
          capId: this.cap.id, 
          toolCount: Object.keys(tools).length 
        });
        return tools;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to resolve MCP tools', { 
          capId: this.cap.id, 
          error: errorMessage 
        });
        throw new Error(`Failed to resolve MCP tools: ${errorMessage}`);
      }
    } else {
      logger.debug('No MCP servers configured', { capId: this.cap.id });
      return {};
    }
  }

  /**
   * Get the complete resolved configuration
   */
  async getResolvedConfig(): Promise<{
    prompt: string;
    model: LanguageModelV1;
    tools: Record<string, any>;
  }> {
    logger.info('Resolving CAP configuration', { capId: this.cap.id });
    
    const [prompt, tools] = await Promise.all([
      this.getResolvedPrompt(),
      this.getResolvedTools(),
    ]);

    const model = this.getResolvedModel();

    logger.info('CAP configuration resolved', { 
      capId: this.cap.id,
      promptLength: prompt.length,
      toolCount: Object.keys(tools).length,
      modelId: this.cap.core.model.id
    });

    return {
      prompt,
      model,
      tools,
    };
  }

  /**
   * Test the CAP configuration without full execution
   */
  async testConfiguration(): Promise<{
    success: boolean;
    errors: string[];
    warnings: string[];
    details: {
      promptResolved: boolean;
      modelAccessible: boolean;
      mcpServersConnected: boolean;
      toolsAvailable: number;
    };
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details = {
      promptResolved: false,
      modelAccessible: false,
      mcpServersConnected: false,
      toolsAvailable: 0,
    };

    try {
      // Test prompt resolution
      try {
        await this.getResolvedPrompt();
        details.promptResolved = true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Prompt resolution failed: ${errorMessage}`);
      }

      // Test model accessibility
      try {
        const modelTest = await this.llmProvider.testModel(this.cap.core.model.id);
        if (modelTest.success) {
          details.modelAccessible = true;
        } else {
          errors.push(`Model test failed: ${modelTest.error}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Model accessibility test failed: ${errorMessage}`);
      }

      // Test MCP servers
      if (this.hasMCPServers) {
        try {
          const tools = await this.getResolvedTools();
          details.toolsAvailable = Object.keys(tools).length;
          details.mcpServersConnected = true;
          
          if (details.toolsAvailable === 0) {
            warnings.push('MCP servers connected but no tools available');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`MCP server connection failed: ${errorMessage}`);
        }
      } else {
        details.mcpServersConnected = true; // No MCP servers to test
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Configuration test failed: ${errorMessage}`);
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.mcpManager.cleanup();
      logger.debug('CAP resolver cleanup completed', { capId: this.cap.id });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('CAP resolver cleanup failed', { 
        capId: this.cap.id, 
        error: errorMessage 
      });
    }
  }
}
