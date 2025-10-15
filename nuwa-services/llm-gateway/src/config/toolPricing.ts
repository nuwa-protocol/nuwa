/**
 * OpenAI Response API Tools Pricing Configuration
 * 
 * This file contains the official pricing information for OpenAI Response API tools.
 * Prices are based on OpenAI's official pricing as of 2024-12.
 * 
 * Note: These are separate from model token costs and are charged per usage.
 */

export interface ToolPricingConfig {
  name: string;
  description: string;
  pricing: {
    type: 'per_call' | 'per_session' | 'per_storage';
    rate: number; // USD
    unit: string;  // e.g., '1000 calls', 'session', 'GB/day'
  };
  // Some tools have free token allowances
  freeTokens?: {
    condition: string;
    description: string;
  };
}

/**
 * Official OpenAI Response API tool pricing
 * Source: https://openai.com/api/pricing/
 */
export const OPENAI_TOOL_PRICING: ToolPricingConfig[] = [
  {
    name: 'web_search',
    description: 'Web search tool calls',
    pricing: {
      type: 'per_call',
      rate: 10.00,
      unit: '1000 calls'
    },
    freeTokens: {
      condition: 'GPT-4o and GPT-4.1 models',
      description: 'Search content tokens are free for GPT-4o and GPT-4.1 models'
    }
  },
  {
    name: 'file_search',
    description: 'File search tool calls',
    pricing: {
      type: 'per_call',
      rate: 2.50,
      unit: '1000 calls'
    }
  },
  {
    name: 'computer_use',
    description: 'Computer use sessions',
    pricing: {
      type: 'per_session',
      rate: 0.03,
      unit: 'session'
    }
  },
  {
    name: 'code_interpreter',
    description: 'Code interpreter sessions',
    pricing: {
      type: 'per_session',
      rate: 0.03,
      unit: 'session'
    }
  }
];

/**
 * File search storage pricing (separate from tool calls)
 */
export const FILE_SEARCH_STORAGE_PRICING = {
  rate: 0.10, // USD per GB per day
  freeAllowance: 1.0 // First 1 GB is free
};

/**
 * Get tool pricing configuration by name
 */
export function getToolPricing(toolName: string): ToolPricingConfig | undefined {
  return OPENAI_TOOL_PRICING.find(tool => tool.name === toolName);
}

/**
 * Calculate tool call cost
 */
export function calculateToolCallCost(toolName: string, callCount: number): number {
  const config = getToolPricing(toolName);
  if (!config) {
    console.warn(`Unknown tool pricing for: ${toolName}`);
    return 0;
  }

  switch (config.pricing.type) {
    case 'per_call':
      // Rate is per 1000 calls
      return (callCount / 1000) * config.pricing.rate;
    
    case 'per_session':
      // Rate is per session, callCount represents session count
      return callCount * config.pricing.rate;
    
    default:
      console.warn(`Unsupported pricing type: ${config.pricing.type}`);
      return 0;
  }
}

/**
 * Calculate file search storage cost
 */
export function calculateStorageCost(storageGB: number, days: number): number {
  const billableGB = Math.max(0, storageGB - FILE_SEARCH_STORAGE_PRICING.freeAllowance);
  return billableGB * FILE_SEARCH_STORAGE_PRICING.rate * days;
}

/**
 * Check if model has free tool tokens
 */
export function hasToolTokenDiscount(model: string, toolName: string): boolean {
  const config = getToolPricing(toolName);
  if (!config?.freeTokens) {
    return false;
  }

  // Check for GPT-4o and GPT-4.1 models for web search
  if (toolName === 'web_search') {
    return model.includes('gpt-4o') || model.includes('gpt-4.1');
  }

  return false;
}
