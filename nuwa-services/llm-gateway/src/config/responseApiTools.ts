/**
 * OpenAI Response API Tools Configuration
 *
 * This file provides configuration for known OpenAI Response API tools.
 * The system uses dynamic detection by default, but this configuration
 * can be used for validation, documentation, or specific handling.
 */

export interface ToolTypeConfig {
  name: string;
  description: string;
  configKey: string; // The key used in the tool object (usually same as name)
  introduced?: string; // Version or date when introduced
  deprecated?: boolean;
}

/**
 * Known OpenAI Response API tool types
 * This list can be updated when OpenAI introduces new tools
 */
export const KNOWN_RESPONSE_API_TOOLS: ToolTypeConfig[] = [
  {
    name: 'web_search',
    description: 'Built-in web search capability',
    configKey: 'web_search',
    introduced: '2024-12',
  },
  {
    name: 'file_search',
    description: 'Built-in file search capability',
    configKey: 'file_search',
    introduced: '2024-12',
  },
  {
    name: 'computer_use',
    description: 'Built-in computer interaction capability',
    configKey: 'computer_use',
    introduced: '2024-12',
  },
];

/**
 * Get tool configuration by name
 */
export function getToolConfig(toolType: string): ToolTypeConfig | undefined {
  return KNOWN_RESPONSE_API_TOOLS.find(tool => tool.name === toolType);
}

/**
 * Check if a tool type is known
 */
export function isKnownToolType(toolType: string): boolean {
  return KNOWN_RESPONSE_API_TOOLS.some(tool => tool.name === toolType);
}

/**
 * Get all known tool types
 */
export function getKnownToolTypes(): string[] {
  return KNOWN_RESPONSE_API_TOOLS.map(tool => tool.name);
}

/**
 * Validate tool configuration
 */
export function validateToolConfig(tool: any): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (!tool || typeof tool !== 'object') {
    return { valid: false, warnings: ['Tool must be an object'] };
  }

  if (!tool.type || typeof tool.type !== 'string') {
    return { valid: false, warnings: ['Tool must have a valid type'] };
  }

  // Check if it's a known tool type
  const config = getToolConfig(tool.type);
  if (!config && tool.type !== 'function') {
    warnings.push(`Unknown tool type '${tool.type}' - this may be a new tool type`);
  }

  // Check if deprecated
  if (config?.deprecated) {
    warnings.push(`Tool type '${tool.type}' is deprecated`);
  }

  return { valid: true, warnings };
}
