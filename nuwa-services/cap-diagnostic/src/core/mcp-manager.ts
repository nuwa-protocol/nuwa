import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import type { Cap } from '../types/cap.js';
import type { McpTransportType, NuwaMCPClient, MCPError } from '../types/mcp.js';
import { logger } from '../utils/logger.js';

interface MCPInstance {
  clients: Map<string, NuwaMCPClient>;
  tools: Record<string, any>;
  initialized: boolean;
}

export class MCPManager {
  private static instance: MCPManager;
  private currentMCPInstance: MCPInstance | null = null;
  private currentCapId: string | null = null;

  private constructor() {}

  static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  async initializeForCap(cap: Cap): Promise<Record<string, any>> {
    // If already initialized for this cap, return existing tools
    if (
      this.currentMCPInstance &&
      this.currentCapId === cap.id &&
      this.currentMCPInstance.initialized
    ) {
      return this.currentMCPInstance.tools;
    }

    // Clean up existing instance if switching caps
    if (this.currentMCPInstance && this.currentCapId !== cap.id) {
      await this.cleanup();
    }

    // Initialize new MCP instance for the cap
    const clients = new Map<string, NuwaMCPClient>();
    const mcpServers = cap.core.mcpServers || {};

    logger.info('Initializing MCP servers', { 
      capId: cap.id, 
      serverCount: Object.keys(mcpServers).length 
    });

    // Initialize all MCP clients
    for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
      try {
        const client = await this.createNuwaMCPClient(
          serverConfig.url,
          serverConfig.transport,
        );
        clients.set(serverName, client);
        logger.info('MCP server connected', { serverName, url: serverConfig.url });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to connect to MCP server', { 
          serverName, 
          url: serverConfig.url, 
          error: errorMessage 
        });
        throw new Error(
          `Failed to connect to MCP server ${serverName} at ${serverConfig.url}: ${errorMessage}`,
        );
      }
    }

    // Get all tools from initialized clients
    const allTools: Record<string, any> = {};
    for (const [serverName, client] of clients.entries()) {
      try {
        const serverTools = await client.tools();
        for (const [toolName, toolDefinition] of Object.entries(serverTools)) {
          const prefixedToolName = `${serverName}_${toolName}`;
          allTools[prefixedToolName] = {
            ...(toolDefinition as Record<string, any>),
            _serverName: serverName,
            _originalName: toolName,
          };
        }
        logger.info('MCP tools loaded', { 
          serverName, 
          toolCount: Object.keys(serverTools).length 
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn('Failed to get tools from MCP server', {
          serverName,
          error: errorMessage,
        });
      }
    }

    this.currentMCPInstance = {
      clients,
      tools: allTools,
      initialized: true,
    };
    this.currentCapId = cap.id;

    logger.info('MCP initialization complete', { 
      capId: cap.id,
      totalTools: Object.keys(allTools).length 
    });

    return allTools;
  }

  async cleanup(): Promise<void> {
    if (this.currentMCPInstance?.initialized) {
      logger.info('Cleaning up MCP connections');
      try {
        for (const [serverName, client] of this.currentMCPInstance.clients.entries()) {
          try {
            await client.close();
            logger.debug('MCP client closed', { serverName });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to close MCP client', { serverName, error: errorMessage });
            throw new Error(
              `Failed to close MCP client ${serverName}: ${errorMessage}`,
            );
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error closing MCP connections', { error: errorMessage });
        throw new Error(`Error closing MCP connections: ${errorMessage}`);
      }
    }

    this.currentMCPInstance = null;
    this.currentCapId = null;
  }

  getCurrentTools(): Record<string, any> {
    return this.currentMCPInstance?.tools || {};
  }

  isInitialized(): boolean {
    return this.currentMCPInstance?.initialized || false;
  }

  /**
   * Test MCP server connectivity
   */
  async testMCPServer(url: string, transportType?: McpTransportType): Promise<{
    success: boolean;
    error?: string;
    duration: number;
    toolsCount?: number;
  }> {
    const startTime = Date.now();
    
    try {
      const client = await this.createNuwaMCPClient(url, transportType);
      const tools = await client.tools();
      await client.close();
      
      const duration = Date.now() - startTime;
      logger.info('MCP server test successful', { url, duration, toolsCount: Object.keys(tools).length });
      
      return {
        success: true,
        duration,
        toolsCount: Object.keys(tools).length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('MCP server test failed', { url, error: errorMessage, duration });
      
      return {
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  private async createNuwaMCPClient(
    url: string,
    transportType?: McpTransportType,
  ): Promise<NuwaMCPClient> {
    const buildTransport = async (): Promise<any> => {
      if (transportType === 'httpStream') {
        return new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers: {} },
        } as any);
      }
      if (transportType === 'sse') {
        return new SSEClientTransport(new URL(url), {
          requestInit: { headers: {} },
        });
      }
      
      // auto-detect
      try {
        await fetch(url, {
          method: 'HEAD',
          headers: {},
        });
        return new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers: {} },
        } as any);
      } catch {
        return new SSEClientTransport(new URL(url), {
          requestInit: { headers: {} },
        });
      }
    };

    const finalTransport = await buildTransport();

    // Create the base client instance
    const rawClient = await createMCPClient({ transport: finalTransport });

    // Disable capability whitelist so we can use experimental methods like prompts/list
    if (typeof (rawClient as any).assertCapability === 'function') {
      (rawClient as any).assertCapability = () => {
        /* no-op */
      };
    }

    // Create the enhanced client
    const client: NuwaMCPClient = {
      raw: rawClient,

      // Prompts API
      async prompts() {
        const passThroughSchema = { parse: (v: any) => v } as const;
        try {
          const result = await (rawClient as any).request({
            request: { method: 'prompts/list', params: {} },
            resultSchema: passThroughSchema,
          });

          const promptsMap: Record<string, any> = {};
          if (Array.isArray(result?.prompts)) {
            for (const promptData of result.prompts) {
              try {
                promptsMap[promptData.name] = promptData;
              } catch (err) {
                logger.warn('Failed to parse prompt', { promptData, error: err });
              }
            }
          }
          return promptsMap;
        } catch (err: any) {
          throw new Error(`Failed to list prompts: ${err.message}`);
        }
      },

      async prompt(name: string) {
        const allPrompts = await client.prompts();
        return allPrompts[name];
      },

      async getPrompt(name: string, args?: Record<string, unknown>) {
        const passThroughSchema = { parse: (v: any) => v } as const;
        try {
          const result = await (rawClient as any).request({
            request: {
              method: 'prompts/get',
              params: {
                name,
                arguments: args || {},
              },
            },
            resultSchema: passThroughSchema,
          });

          return result;
        } catch (err: any) {
          throw new Error(`Failed to get prompt "${name}": ${err.message}`);
        }
      },

      // Tools API
      async tools() {
        try {
          if (rawClient && typeof rawClient.tools === 'function') {
            return await rawClient.tools();
          }
          return {};
        } catch (err: any) {
          throw new Error(`Failed to list tools: ${err.message}`);
        }
      },

      // Resources API
      async resources() {
        const passThroughSchema = { parse: (v: any) => v } as const;
        try {
          const result = await (rawClient as any).request({
            request: { method: 'resources/list', params: {} },
            resultSchema: passThroughSchema,
          });

          const resourcesMap: Record<string, any> = {};
          if (Array.isArray(result?.resources)) {
            for (const resourceData of result.resources) {
              try {
                if (typeof resourceData === 'string') {
                  resourcesMap[resourceData] = { uri: resourceData };
                } else if (resourceData?.uri) {
                  resourcesMap[resourceData.uri] = resourceData;
                } else if (resourceData?.uriTemplate) {
                  resourcesMap[resourceData.uriTemplate] = resourceData;
                }
              } catch (err) {
                logger.warn('Failed to parse resource', { resourceData, error: err });
              }
            }
          }
          return resourcesMap;
        } catch (err: any) {
          throw new Error(`Failed to list resources: ${err.message}`);
        }
      },

      async readResource<T = unknown>(uri: string): Promise<T> {
        const passThroughSchema = { parse: (v: any) => v } as const;
        try {
          const result = await (rawClient as any).request({
            request: { method: 'resources/read', params: { uri } },
            resultSchema: passThroughSchema,
          });
          return result as T;
        } catch (err: any) {
          throw new Error(`Failed to read resource "${uri}": ${err.message}`);
        }
      },

      async readResourceTemplate<T = unknown>(
        uriTemplate: string,
        args: Record<string, unknown>,
      ): Promise<T> {
        const passThroughSchema = { parse: (v: any) => v } as const;
        try {
          const result = await (rawClient as any).request({
            request: {
              method: 'resources/read',
              params: {
                uri: uriTemplate,
                arguments: args,
              },
            },
            resultSchema: passThroughSchema,
          });
          return result as T;
        } catch (err: any) {
          throw new Error(`Failed to read resource template "${uriTemplate}": ${err.message}`);
        }
      },

      // Utility methods
      async close() {
        await rawClient.close();
      },
    };

    return client;
  }
}
