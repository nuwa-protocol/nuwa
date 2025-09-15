/**
 * MCP Gateway - Type Definitions
 */

export interface InstanceConfig {
  /** Instance name (e.g., 'amap-proxy') */
  name: string;
  /** Subdomain (e.g., 'amap') */
  subdomain: string;
  /** Target URL where the instance is deployed */
  targetUrl: string;
  /** Health check path (default: /health) */
  healthPath?: string;
  /** Whether the instance is enabled */
  enabled: boolean;
  /** Optional description */
  description?: string;
}

export interface GatewayConfig {
  /** Gateway server port */
  port: number;
  /** Base domain (e.g., 'mcpproxy.xyz') */
  baseDomain: string;
  /** Default target for root domain requests */
  defaultTarget?: string;
  /** List of MCP instances */
  instances: InstanceConfig[];
  /** CORS configuration */
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
  /** Health check configuration */
  healthCheck?: {
    interval: number; // seconds
    timeout: number; // seconds
  };
  /** Debug mode */
  debug?: boolean;
}

export interface HealthStatus {
  instance: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: Date;
  responseTime?: number;
  error?: string;
}
