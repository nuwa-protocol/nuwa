/**
 * MCP Server Proxy - Type Definitions (Single Upstream)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";

export interface HeaderAuthConfig {
  scheme: "header";
  header: string;
  value: string;
}

export interface BasicAuthConfig {
  scheme: "basic";
  username: string;
  password: string;
}

export interface BearerAuthConfig {
  scheme: "bearer";
  token: string;
}

export type AuthConfig = HeaderAuthConfig | BasicAuthConfig | BearerAuthConfig;

export interface HttpStreamUpstreamConfig {
  type: "httpStream" | "http";
  /**
   * Base URL of the upstream MCP server.
   * Renamed from `baseURL` to `url` for simplicity.
   */
  url: string;
  auth?: AuthConfig;
}

export interface StdioUpstreamConfig {
  type: "stdio";
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** 
   * Configure stderr handling for the child process.
   * - 'inherit': stderr goes to parent process stderr (default, good for debugging)
   * - 'ignore': suppress stderr output
   * - 'pipe': capture stderr (not currently supported)
   */
  stderr?: 'inherit' | 'ignore' | 'pipe';
}

export type UpstreamConfig = HttpStreamUpstreamConfig | StdioUpstreamConfig;

// Runtime Types for Single Upstream
export interface Upstream {
  type: string;
  client: any;
  config: UpstreamConfig;
  capabilities: ServerCapabilities;
}
