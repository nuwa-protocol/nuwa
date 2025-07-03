/**
 * MCP Server Proxy - Type Definitions
 */
import { FastifyRequest } from 'fastify';
import { ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';

// Configuration Types
export interface ServerConfig {
  host: string;
  port: number;
  cors: {
    origin: string | string[];
    methods: string[];
  };
  logger: {
    level: string;
    prettyPrint: boolean;
  };
}

export interface DIDAuthConfig {
  required: boolean;
  allowedDidMethods: string[];
}

export interface HeaderAuthConfig {
  scheme: 'header';
  header: string;
  value: string;
}

export interface BasicAuthConfig {
  scheme: 'basic';
  username: string;
  password: string;
}

export interface BearerAuthConfig {
  scheme: 'bearer';
  token: string;
}

export type AuthConfig = HeaderAuthConfig | BasicAuthConfig | BearerAuthConfig;

export interface HttpStreamUpstreamConfig {
  type: 'httpStream'|'http';
  baseURL: string;
  auth?: AuthConfig;
}

export interface StdioUpstreamConfig {
  type: 'stdio';
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export type UpstreamConfig = HttpStreamUpstreamConfig | StdioUpstreamConfig;

export interface RouteConfig {
  matchHostname?: string;
  upstream: string;
}

export interface ProxyConfig {
  server: ServerConfig;
  defaultUpstream: string;
  upstreams: Record<string, UpstreamConfig>;
  routes: RouteConfig[];
  didAuth: DIDAuthConfig;
}

// Runtime Types
export interface Upstream {
  type: string;
  client: any;
  config: UpstreamConfig;
  capabilities: ServerCapabilities;
}

export interface UpstreamRegistry {
  [key: string]: Upstream;
}

// Auth Types
export interface DIDAuthResult {
  did: string;
  isValid: boolean;
  error?: string;
}

// Request Context
export interface RequestContext {
  callerDid?: string;
  upstream: string;
  startTime: number;
}

// Billing Types
export interface UsageRecord {
  callerDid: string;
  upstream: string;
  toolName: string;
  timestamp: number;
  duration: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
}

// Extend Fastify Request
declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext;
  }
} 