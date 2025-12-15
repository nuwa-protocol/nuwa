// Factory that creates MCP servers using either fastmcp or official SDK engine
// Supports seamless switching via MCP_ENGINE environment variable

import { FastMcpServerOptions, createFastMcpServer } from './FastMcpStarter';
import { SdkMcpServerOptions, createSdkMcpServer } from './SdkMcpStarter';
import type { IdentityEnv } from '@nuwa-ai/identity-kit';

// Common options that work for both engines
export interface McpServerCommonOptions {
  serviceId?: string;
  signer?: any;
  rpcUrl?: string;
  network?: 'main' | 'test';
  debug?: boolean;
  port?: number;
  endpoint?: `/${string}`;
  wellKnown?: {
    enabled?: boolean;
    path?: `/${string}`;
  };
  customRouteHandler?: (req: any, res: any) => Promise<boolean> | boolean;
  defaultAssetId?: string;
  defaultPricePicoUSD?: bigint;
}

export interface McpServerOptions extends McpServerCommonOptions {
  engine?: 'fastmcp' | 'sdk' | 'legacy' | 'official';
  // Allow any additional engine-specific properties
  [key: string]: any;
}

export interface McpServerFactory {
  createServer(opts: McpServerOptions): Promise<{
    addTool: (def: {
      name: string;
      description: string;
      parameters?: any;
      execute: (params: any, context?: any) => Promise<any> | any;
      options?: any;
    }) => void;
    freeTool: (def: {
      name: string;
      description: string;
      parameters?: any;
      execute: (params: any, context?: any) => Promise<any> | any;
    }) => void;
    paidTool: (def: {
      name: string;
      description: string;
      pricePicoUSD: bigint;
      parameters?: any;
      execute: (params: any, context?: any) => Promise<any> | any;
    }) => void;
    addPrompt: (def: {
      name: string;
      description: string;
      arguments?: any[];
      load: (args: any) => Promise<string> | string;
    }) => void;
    addResource: (def: {
      uri: string;
      name: string;
      mimeType: string;
      load: () => Promise<{ text?: string; blob?: any }> | { text?: string; blob?: any };
    }) => void;
    addResourceTemplate: (def: {
      uriTemplate: string;
      name: string;
      mimeType: string;
      arguments?: any[];
      load: (args: any) => Promise<{ text?: string; blob?: any }> | { text?: string; blob?: any };
    }) => void;
    start: () => Promise<any>;
    getInner: () => any;
  }>;
}

class DefaultMcpServerFactory implements McpServerFactory {
  async createServer(opts: McpServerOptions) {
    // Check explicit engine option first
    if (opts.engine === 'sdk' || opts.engine === 'official') {
      return createSdkMcpServer(opts as SdkMcpServerOptions);
    } else if (opts.engine === 'fastmcp' || opts.engine === 'legacy') {
      return createFastMcpServer(opts as FastMcpServerOptions);
    }

    // Fall back to environment variable or default
    const envEngine = this.getEngineFromEnv();
    if (envEngine === 'sdk') {
      return createSdkMcpServer(opts as SdkMcpServerOptions);
    } else {
      return createFastMcpServer(opts as FastMcpServerOptions);
    }
  }

  private getEngineFromEnv(): 'fastmcp' | 'sdk' | null {
    const envEngine = process.env.MCP_ENGINE?.toLowerCase();
    if (envEngine === 'sdk' || envEngine === 'official') {
      return 'sdk';
    }
    if (envEngine === 'fastmcp' || envEngine === 'legacy') {
      return 'fastmcp';
    }
    return null;
  }
}

const factory = new DefaultMcpServerFactory();

/**
 * Create an MCP server using the engine specified by MCP_ENGINE environment variable
 * or explicit engine option. Default: fastmcp for backwards compatibility.
 *
 * Environment variables:
 * - MCP_ENGINE=fastmcp (default) or MCP_ENGINE=legacy
 * - MCP_ENGINE=sdk or MCP_ENGINE=official
 */
export async function createMcpServer(opts: McpServerOptions) {
  return factory.createServer(opts);
}

/**
 * Convenience: start MCP server using IdentityEnv (env.keyManager + VDR chain config)
 * Engine selection follows MCP_ENGINE environment variable.
 */
export async function createMcpServerFromEnv(
  env: IdentityEnv,
  opts: Omit<McpServerOptions, 'signer' | 'rpcUrl' | 'network'>
) {
  // Check explicit engine option first
  if (opts.engine === 'sdk' || opts.engine === 'official') {
    const { createSdkMcpServerFromEnv } = await import('./SdkMcpStarter');
    return createSdkMcpServerFromEnv(env, opts as Omit<SdkMcpServerOptions, 'signer' | 'rpcUrl' | 'network'>);
  } else if (opts.engine === 'fastmcp' || opts.engine === 'legacy') {
    const { createFastMcpServerFromEnv } = await import('./FastMcpStarter');
    return createFastMcpServerFromEnv(env, opts as Omit<FastMcpServerOptions, 'signer' | 'rpcUrl' | 'network'>);
  }

  // Fall back to environment variable or default
  const envEngine = process.env.MCP_ENGINE?.toLowerCase();
  if (envEngine === 'sdk' || envEngine === 'official') {
    const { createSdkMcpServerFromEnv } = await import('./SdkMcpStarter');
    return createSdkMcpServerFromEnv(env, opts as Omit<SdkMcpServerOptions, 'signer' | 'rpcUrl' | 'network'>);
  } else {
    const { createFastMcpServerFromEnv } = await import('./FastMcpStarter');
    return createFastMcpServerFromEnv(env, opts as Omit<FastMcpServerOptions, 'signer' | 'rpcUrl' | 'network'>);
  }
}

// Export factory for testing or custom configurations
export { DefaultMcpServerFactory };
export { factory as mcpServerFactory };

// Re-export types for convenience
export type { FastMcpServerOptions, SdkMcpServerOptions };