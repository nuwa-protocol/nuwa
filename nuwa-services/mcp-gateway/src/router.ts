/**
 * MCP Gateway Router - Handles subdomain-based routing
 */
import type { FastifyRequest } from "fastify";
import type { GatewayConfig, InstanceConfig } from "./types.js";

export class GatewayRouter {
  private config: GatewayConfig;
  private instanceMap: Map<string, InstanceConfig>;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.instanceMap = new Map();
    this.updateInstances(config.instances);
  }

  /**
   * Update the instance configuration
   */
  updateInstances(instances: InstanceConfig[]) {
    this.instanceMap.clear();
    for (const instance of instances) {
      if (instance.enabled) {
        this.instanceMap.set(instance.subdomain, instance);
      }
    }
  }

  /**
   * Extract subdomain from request
   */
  private extractSubdomain(request: FastifyRequest): string | null {
    const host = request.headers.host;
    if (!host) return null;

    // Remove port if present
    const hostname = host.split(':')[0];
    
    // Check if it's the base domain
    if (hostname === this.config.baseDomain) {
      return null; // Root domain
    }

    // Extract subdomain
    const baseDomainParts = this.config.baseDomain.split('.');
    const hostParts = hostname.split('.');
    
    // Validate that it's a subdomain of our base domain
    if (hostParts.length <= baseDomainParts.length) {
      return null;
    }

    // Check if the suffix matches our base domain
    const hostSuffix = hostParts.slice(-baseDomainParts.length).join('.');
    if (hostSuffix !== this.config.baseDomain) {
      return null;
    }

    // Extract the subdomain part
    const subdomainParts = hostParts.slice(0, -baseDomainParts.length);
    return subdomainParts.join('.');
  }

  /**
   * Route request to appropriate instance
   */
  routeRequest(request: FastifyRequest): {
    targetUrl?: string;
    instance?: InstanceConfig;
    error?: string;
  } {
    const subdomain = this.extractSubdomain(request);

    if (this.config.debug) {
      console.log(`[Router] Host: ${request.headers.host}, Subdomain: ${subdomain}`);
    }

    // Handle root domain
    if (!subdomain) {
      if (this.config.defaultTarget) {
        return { targetUrl: this.config.defaultTarget };
      }
      return { error: "No default target configured for root domain" };
    }

    // Find matching instance
    const instance = this.instanceMap.get(subdomain);
    if (!instance) {
      return { error: `No instance configured for subdomain: ${subdomain}` };
    }

    return { targetUrl: instance.targetUrl, instance };
  }

  /**
   * Get all configured instances
   */
  getInstances(): InstanceConfig[] {
    return Array.from(this.instanceMap.values());
  }

  /**
   * Get instance by subdomain
   */
  getInstance(subdomain: string): InstanceConfig | undefined {
    return this.instanceMap.get(subdomain);
  }

  /**
   * Check if subdomain is configured
   */
  hasSubdomain(subdomain: string): boolean {
    return this.instanceMap.has(subdomain);
  }
}
