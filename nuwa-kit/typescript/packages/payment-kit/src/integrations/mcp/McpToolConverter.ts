import type { Tool, ToolCallOptions } from 'ai';
import { dynamicTool, jsonSchema } from 'ai';

/**
 * Common utility for converting MCP tool definitions to AI SDK compatible format
 */
export class McpToolConverter {
  /**
   * Convert MCP tool definition to AI SDK compatible format
   * @param tool - MCP tool definition
   * @param executeFunction - Function to execute the tool
   * @returns AI SDK compatible tool with proper typing
   */
  static convertToAiSdkFormat(
    tool: {
      name: string;
      description?: string;
      inputSchema?: any;
      parameters?: any;
      input_schema?: any;
    },
    executeFunction: (args: any, options?: ToolCallOptions) => Promise<{ content: any }>
  ): Tool<unknown, unknown> & { type: 'dynamic' } {
    // Extract schema from various possible locations
    // Note: tool should already be sanitized by listTools() -> sanitizeTools()
    let rawSchema = tool.inputSchema || tool.parameters || tool.input_schema || {};

    // Handle nested jsonSchema structure - this is the key fix!
    // Many MCP servers return { inputSchema: { jsonSchema: { ... } } }
    // But AI SDK expects the actual schema object
    if (rawSchema && typeof rawSchema === 'object' && rawSchema.jsonSchema) {
      rawSchema = rawSchema.jsonSchema;
    }

    // Convert JSON Schema to AI SDK schema format, following the same pattern as AI SDK's built-in MCP client
    const processedSchema = {
      ...rawSchema,
      properties: rawSchema.properties ?? {},
      additionalProperties: false,
    };

    return dynamicTool({
      description: tool.description || `Tool: ${tool.name}`,
      inputSchema: jsonSchema(processedSchema),
      execute: executeFunction,
    });
  }
}
