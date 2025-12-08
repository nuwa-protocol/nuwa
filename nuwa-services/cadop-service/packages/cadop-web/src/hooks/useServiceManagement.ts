import { useState, useCallback } from 'react';
import type { ServiceInfo } from '@nuwa-ai/identity-kit';
import { DIDService } from '@/lib/did/DIDService';

export interface ServiceWithStatus extends ServiceInfo {
  status: 'online' | 'offline' | 'checking' | 'error';
  statusMessage?: string;
  discoveryInfo?: unknown; // Well-known endpoint info
}

export interface UseServiceManagementResult {
  services: ServiceWithStatus[];
  loading: boolean;
  error: string | null;
  refreshServices: () => Promise<void>;
  addService: (serviceInfo: ServiceInfo) => Promise<void>;
  removeService: (serviceId: string) => Promise<void>;
  checkServiceStatus: (serviceEndpoint: string) => Promise<{
    status: 'online' | 'offline' | 'error';
    message?: string;
    discoveryInfo?: unknown;
  }>;
}

/**
 * Hook for managing DID services with status checking
 */
export function useServiceManagement(agentDid: string | undefined): UseServiceManagementResult {
  const [services, setServices] = useState<ServiceWithStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get services from DID document and check their status
  const refreshServices = useCallback(async () => {
    if (!agentDid) {
      setServices([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Initialize DIDService once and reuse
      const didService = await DIDService.initialize(agentDid);
      // Force-refresh to bypass VDR cache right after writes or manual refresh
      const didDocument = await didService.getDIDDocument(true);

      const doc = didDocument as { service?: Array<Record<string, unknown>> };
      if (!doc || !doc.service) {
        setServices([]);
        return;
      }

      // Convert services to ServiceWithStatus and check their status
      const servicesWithStatus: ServiceWithStatus[] = await Promise.all(
        (doc.service as Array<Record<string, unknown>>).map(async service => {
          const serviceWithStatus: ServiceWithStatus = {
            idFragment: String((service.id as string).split('#')[1] || service.id),
            type: String(service.type),
            serviceEndpoint: String(service.serviceEndpoint),
            additionalProperties: {},
            status: 'checking',
          };

          // Copy additional properties
          Object.keys(service).forEach(key => {
            if (!['id', 'type', 'serviceEndpoint'].includes(key)) {
              serviceWithStatus.additionalProperties![key] = String(
                (service as Record<string, unknown>)[key] ?? ''
              );
            }
          });

          // Check service status
          try {
            const statusResult = await checkServiceStatus(String(service.serviceEndpoint ?? ''));
            serviceWithStatus.status = statusResult.status;
            serviceWithStatus.statusMessage = statusResult.message;
            serviceWithStatus.discoveryInfo = statusResult.discoveryInfo;
          } catch (err) {
            serviceWithStatus.status = 'error';
            serviceWithStatus.statusMessage =
              err instanceof Error ? err.message : 'Status check failed';
          }

          return serviceWithStatus;
        })
      );

      setServices(servicesWithStatus);
    } catch (err) {
      console.error('[useServiceManagement] Failed to refresh services:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh services');
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [agentDid]);

  // Add a new service
  const addService = useCallback(
    async (serviceInfo: ServiceInfo) => {
      if (!agentDid) {
        throw new Error('Agent DID is required');
      }

      try {
        setLoading(true);
        setError(null);

        const didService = await DIDService.initialize(agentDid);
        await didService.addService(serviceInfo);

        // Wait briefly for on-chain state to propagate before refreshing
        await new Promise(resolve => setTimeout(resolve, 1500));
        // Refresh services to get updated list (force refresh used inside)
        await refreshServices();
      } catch (err) {
        console.error('[useServiceManagement] Failed to add service:', err);
        const message = err instanceof Error ? err.message : 'Failed to add service';
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [agentDid, refreshServices]
  );
  // Remove a service
  const removeService = useCallback(
    async (idFragment: string) => {
      if (!agentDid) {
        throw new Error('Agent DID is required');
      }

      try {
        setLoading(true);
        setError(null);

        const didService = await DIDService.initialize(agentDid);
        const serviceId = `${agentDid}#${idFragment}`;
        await didService.removeService(serviceId);

        // Refresh services to get updated list
        await refreshServices();
      } catch (err) {
        console.error('[useServiceManagement] Failed to remove service:', err);
        const message = err instanceof Error ? err.message : 'Failed to remove service';
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [agentDid, refreshServices]
  );

  // Check service status by calling well-known endpoint
  const checkServiceStatus = useCallback(
    async (
      serviceEndpoint: string
    ): Promise<{
      status: 'online' | 'offline' | 'error';
      message?: string;
      discoveryInfo?: unknown;
    }> => {
      try {
        // Normalize endpoint URL
        const baseUrl = serviceEndpoint.endsWith('/')
          ? serviceEndpoint.slice(0, -1)
          : serviceEndpoint;
        const wellKnownUrl = `${baseUrl}/.well-known/nuwa-payment/info`;

        // Fetch with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(wellKnownUrl, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'User-Agent': 'cadop-web/1.0.0',
            },
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (response.ok) {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const discoveryInfo = await response.json();

              // Validate required fields
              if (
                discoveryInfo.serviceId &&
                discoveryInfo.serviceDid &&
                discoveryInfo.defaultAssetId
              ) {
                return {
                  status: 'online',
                  message: 'Service is online and payment-enabled',
                  discoveryInfo,
                };
              } else {
                return {
                  status: 'online',
                  message: 'Service is online but discovery info is incomplete',
                  discoveryInfo,
                };
              }
            } else {
              return {
                status: 'online',
                message: 'Service is online but does not return JSON',
              };
            }
          } else {
            return {
              status: 'offline',
              message: `Service returned ${response.status}: ${response.statusText}`,
            };
          }
        } catch (fetchError) {
          clearTimeout(timeout);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            return {
              status: 'offline',
              message: 'Service request timed out',
            };
          }
          throw fetchError;
        }
      } catch (err) {
        return {
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to check service status',
        };
      }
    },
    []
  );

  return {
    services,
    loading,
    error,
    refreshServices,
    addService,
    removeService,
    checkServiceStatus,
  };
}
