import type { z } from 'zod';

export type McpTransportType = 'httpStream' | 'sse';

export interface MCPError {
  message: string;
  code?: string | number;
  detail?: string;
}

export interface PromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface ResourceDefinition {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceTemplateDefinition {
  uriTemplate: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface PromptMessagesResult {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: {
      type: 'text';
      text: string;
    };
  }>;
}

export interface NuwaMCPClient {
  raw: any;
  prompts(): Promise<Record<string, PromptDefinition>>;
  prompt(name: string): Promise<PromptDefinition | undefined>;
  getPrompt(name: string, args?: Record<string, unknown>): Promise<PromptMessagesResult>;
  tools(): Promise<Record<string, any>>;
  resources(): Promise<Record<string, ResourceDefinition | ResourceTemplateDefinition>>;
  readResource<T = unknown>(uri: string): Promise<T>;
  readResourceTemplate<T = unknown>(uriTemplate: string, args: Record<string, unknown>): Promise<T>;
  close(): Promise<void>;
}

// Schema definitions (simplified versions)
export const PromptSchema = {
  parse: (data: any): PromptDefinition => {
    if (!data.name || typeof data.name !== 'string') {
      throw new Error('Invalid prompt: missing or invalid name');
    }
    return data as PromptDefinition;
  },
};

export const ResourceSchema = {
  parse: (data: any): ResourceDefinition => {
    if (!data.uri || typeof data.uri !== 'string') {
      throw new Error('Invalid resource: missing or invalid uri');
    }
    return data as ResourceDefinition;
  },
};

export const ResourceTemplateSchema = {
  parse: (data: any): ResourceTemplateDefinition => {
    if (!data.uriTemplate || typeof data.uriTemplate !== 'string') {
      throw new Error('Invalid resource template: missing or invalid uriTemplate');
    }
    return data as ResourceTemplateDefinition;
  },
};

export const PromptMessagesResultSchema = {
  parse: (data: any): PromptMessagesResult => {
    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error('Invalid prompt messages result: missing or invalid messages array');
    }
    return data as PromptMessagesResult;
  },
};
