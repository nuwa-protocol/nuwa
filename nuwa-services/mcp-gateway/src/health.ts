/**
 * Health Check Service for MCP Gateway
 */
import type { InstanceConfig, HealthStatus, GatewayConfig } from "./types.js";

export class HealthChecker {
  private config: GatewayConfig;
  private healthStatus: Map<string, HealthStatus>;
  private checkInterval?: NodeJS.Timeout;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.healthStatus = new Map();
  }

  /**
   * Start periodic health checks
   */
  start(instances: InstanceConfig[]) {
    // Initialize health status for all instances
    for (const instance of instances) {
      if (instance.enabled) {
        this.healthStatus.set(instance.name, {
          instance: instance.name,
          status: 'unknown',
          lastCheck: new Date(),
        });
      }
    }

    // Start periodic checks
    if (this.config.healthCheck) {
      this.checkInterval = setInterval(() => {
        this.checkAllInstances(instances);
      }, this.config.healthCheck.interval * 1000);

      // Run initial check
      this.checkAllInstances(instances);
    }
  }

  /**
   * Stop health checks
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  /**
   * Check health of all instances
   */
  private async checkAllInstances(instances: InstanceConfig[]) {
    const promises = instances
      .filter(instance => instance.enabled)
      .map(instance => this.checkInstance(instance));

    await Promise.allSettled(promises);
  }

  /**
   * Check health of a single instance
   */
  private async checkInstance(instance: InstanceConfig): Promise<void> {
    const startTime = Date.now();
    const healthPath = instance.healthPath || '/health';
    const healthUrl = `${instance.targetUrl}${healthPath}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, (this.config.healthCheck?.timeout || 10) * 1000);

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'MCP-Gateway-HealthChecker/1.0',
        },
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      const status: HealthStatus = {
        instance: instance.name,
        status: response.ok ? 'healthy' : 'unhealthy',
        lastCheck: new Date(),
        responseTime,
      };

      if (!response.ok) {
        status.error = `HTTP ${response.status}: ${response.statusText}`;
      }

      this.healthStatus.set(instance.name, status);

      if (this.config.debug) {
        console.log(`[Health] ${instance.name}: ${status.status} (${responseTime}ms)`);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const status: HealthStatus = {
        instance: instance.name,
        status: 'unhealthy',
        lastCheck: new Date(),
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.healthStatus.set(instance.name, status);

      if (this.config.debug) {
        console.log(`[Health] ${instance.name}: unhealthy - ${status.error}`);
      }
    }
  }

  /**
   * Get health status for all instances
   */
  getHealthStatus(): HealthStatus[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get health status for a specific instance
   */
  getInstanceHealth(instanceName: string): HealthStatus | undefined {
    return this.healthStatus.get(instanceName);
  }

  /**
   * Check if an instance is healthy
   */
  isInstanceHealthy(instanceName: string): boolean {
    const status = this.healthStatus.get(instanceName);
    return status?.status === 'healthy';
  }

  /**
   * Get summary of health status
   */
  getHealthSummary(): {
    total: number;
    healthy: number;
    unhealthy: number;
    unknown: number;
  } {
    const statuses = Array.from(this.healthStatus.values());
    return {
      total: statuses.length,
      healthy: statuses.filter(s => s.status === 'healthy').length,
      unhealthy: statuses.filter(s => s.status === 'unhealthy').length,
      unknown: statuses.filter(s => s.status === 'unknown').length,
    };
  }
}
