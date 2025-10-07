import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';

/**
 * Nuwa payment service discovery information
 * Retrieved from /.well-known/nuwa-payment/info endpoint
 */
export interface NuwaPaymentInfo {
  /** Service identifier */
  serviceId: string;
  /** Service DID for payment channel */
  serviceDid: string;
  /** Default asset ID for payments */
  defaultAssetId: string;
  /** Optional supported features list */
  supportedFeatures?: string[];
  /** Optional base path for payment endpoints */
  basePath?: string;
  /** Optional protocol version */
  protocolVersion?: string;
}

/**
 * MCP server type classification
 */
export enum McpServerType {
  /** Server supports Nuwa payment protocol */
  PAYMENT_ENABLED = 'payment',
  /** Standard MCP server without payment support */
  STANDARD = 'standard',
  /** Server type not yet determined */
  UNKNOWN = 'unknown',
}

/**
 * Enhanced server capabilities that extend standard MCP capabilities
 * with Nuwa payment protocol extensions
 */
export interface EnhancedServerCapabilities extends ServerCapabilities {
  /** Standard MCP capabilities */
  experimental?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  prompts?: {
    listChanged?: boolean;
    [key: string]: unknown;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
    [key: string]: unknown;
  };
  tools?: {
    listChanged?: boolean;
    [key: string]: unknown;
  };

  /** Nuwa payment protocol extensions */
  nuwa?: {
    /** Payment protocol support */
    payment?: {
      /** Whether payment protocol is supported */
      supported: boolean;
      /** Service identifier */
      serviceId?: string;
      /** Service DID for payment channel */
      serviceDid?: string;
      /** Default asset ID for payments */
      defaultAssetId?: string;
      /** Base path for payment endpoints */
      basePath?: string;
      /** Protocol version */
      protocolVersion?: string;
    };
    /** Authentication support */
    auth?: {
      /** Whether DID authentication is supported */
      supported: boolean;
      /** Supported authentication methods */
      methods?: string[];
    };
    /** Built-in tools support */
    builtinTools?: {
      /** Whether Nuwa built-in tools are supported */
      supported: boolean;
      /** List of available built-in tools */
      tools?: string[];
    };
  };
}

/**
 * Detection result containing server type and capabilities
 */
export interface ServerDetectionResult {
  /** Detected server type */
  type: McpServerType;
  /** Enhanced capabilities information */
  capabilities: EnhancedServerCapabilities;
  /** Payment info if available */
  paymentInfo?: NuwaPaymentInfo;
  /** Detection timestamp */
  detectedAt: number;
}

/**
 * Options for server detection
 */
export interface DetectionOptions {
  /** Timeout for detection requests in milliseconds */
  timeout?: number;
  /** Whether to cache detection results */
  cache?: boolean;
  /** Custom fetch implementation */
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/**
 * Options for tool listing that includes filtering
 * Note: This replaces the ListToolsOptions from PaymentChannelMcpClient for consistency
 */
export interface UniversalListToolsOptions {
  /** Whether to include nuwa built-in tools (default: false) */
  includeBuiltinTools?: boolean;
}
