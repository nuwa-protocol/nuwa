import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Skeleton,
  Alert,
  AlertDescription,
  Modal,
} from '@/components/ui';
import {
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Clock,
  Globe,
} from 'lucide-react';
import { useServiceManagement } from '@/hooks/useServiceManagement';
import { ServiceForm } from './ServiceForm';
import type { ServiceWithStatus } from '@/hooks/useServiceManagement';
import { useToast } from '@/hooks/use-toast';

interface ServiceManagementProps {
  agentDid: string;
  isController: boolean;
  className?: string;
}

export function ServiceManagement({
  agentDid,
  isController,
  className = '',
}: ServiceManagementProps) {
  const { toast } = useToast();
  const { services, loading, error, refreshServices, removeService } =
    useServiceManagement(agentDid);

  const [showServiceForm, setShowServiceForm] = useState(false);
  // Editing service is no longer supported; users should remove then add
  const [deletingService, setDeletingService] = useState<ServiceWithStatus | null>(null);

  // Load services on mount
  useEffect(() => {
    if (agentDid) {
      refreshServices();
    }
  }, [agentDid, refreshServices]);

  const handleAddService = () => {
    setShowServiceForm(true);
  };

  // Edit disabled

  const handleDeleteService = async (service: ServiceWithStatus) => {
    setDeletingService(service);
  };

  const confirmDeleteService = async () => {
    if (!deletingService) return;

    try {
      await removeService(deletingService.idFragment);
      toast({
        variant: 'default',
        title: 'Service Removed',
        description: `Service "${deletingService.idFragment}" has been removed successfully.`,
      });
      setDeletingService(null);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to Remove Service',
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    }
  };

  const handleServiceFormSuccess = () => {
    toast({
      variant: 'default',
      title: 'Service Added',
      description: 'New service has been added successfully.',
    });
    setShowServiceForm(false);
    // Trigger immediate refresh and a delayed force refresh to bypass VDR cache propagation
    refreshServices();
    setTimeout(() => {
      refreshServices();
    }, 1600);
  };

  const getStatusIcon = (status: ServiceWithStatus['status']) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'offline':
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case 'checking':
        return <Clock className="h-4 w-4 text-blue-600 animate-pulse" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Globe className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: ServiceWithStatus['status']) => {
    switch (status) {
      case 'online':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'offline':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'checking':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusText = (status: ServiceWithStatus['status']) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'offline':
        return 'Offline';
      case 'checking':
        return 'Checking...';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  if (loading && services.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Services
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`border-red-200 ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <Settings className="h-5 w-5" />
            Services
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load services: {error}</AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button variant="outline" onClick={refreshServices}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Services
              {services.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {services.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={refreshServices} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {services.length > 0 ? (
            <div className="space-y-4">
              {services.map(service => (
                <div
                  key={service.idFragment}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">{getStatusIcon(service.status)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{service.idFragment}</span>
                          <Badge variant="outline">{service.type}</Badge>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">{service.serviceEndpoint}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={getStatusColor(service.status)}>
                        {getStatusText(service.status)}
                      </Badge>
                      {isController && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteService(service)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const base = service.serviceEndpoint.endsWith('/')
                            ? service.serviceEndpoint.slice(0, -1)
                            : service.serviceEndpoint;
                          const url = `${base}/.well-known/nuwa-payment/info`;
                          window.open(url, '_blank');
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Status Message */}
                  {service.statusMessage && (
                    <div className="text-sm text-gray-600 mb-2">
                      {String(service.statusMessage)}
                    </div>
                  )}

                  {/* Discovery Info */}
                  {service.discoveryInfo && (
                    <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
                      <div className="font-medium text-green-800 mb-1">Payment Service Details</div>
                      <div className="space-y-1 text-green-700">
                        <div>
                          Service ID:{' '}
                          <span className="font-mono">
                            {(service.discoveryInfo as any)?.serviceId || 'N/A'}
                          </span>
                        </div>
                        <div>
                          Service DID:{' '}
                          <span className="font-mono">
                            {(service.discoveryInfo as any)?.serviceDid || 'N/A'}
                          </span>
                        </div>
                        <div>
                          Default Asset:{' '}
                          <span className="font-mono">
                            {(service.discoveryInfo as any)?.defaultAssetId || 'N/A'}
                          </span>
                        </div>
                        {(service.discoveryInfo as any)?.supportedFeatures &&
                          (service.discoveryInfo as any).supportedFeatures.length > 0 && (
                            <div>
                              Features:{' '}
                              {(service.discoveryInfo as any).supportedFeatures.map(
                                (feature: string) => (
                                  <Badge key={feature} variant="secondary" className="ml-1 text-xs">
                                    {feature}
                                  </Badge>
                                )
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  )}

                  {/* Additional Properties */}
                  {service.additionalProperties &&
                    Object.keys(service.additionalProperties).length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-sm font-medium text-gray-700 mb-2">
                          Additional Properties
                        </div>
                        <div className="space-y-1">
                          {Object.entries(service.additionalProperties).map(([key, value]) => (
                            <div key={key} className="text-sm text-gray-600">
                              <span className="font-mono">{key}:</span> {value}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Settings className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-sm mb-2">No services configured</p>
              <p className="text-gray-400 text-xs mb-4">
                Add services to enable discovery and payment capabilities.
              </p>
              {isController && (
                <Button onClick={handleAddService}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Service
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Service Form Modal */}
      <ServiceForm
        isOpen={showServiceForm}
        onClose={() => {
          setShowServiceForm(false);
        }}
        onSuccess={handleServiceFormSuccess}
        agentDid={agentDid}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        title="Confirm Service Deletion"
        open={!!deletingService}
        onClose={() => setDeletingService(null)}
        width="sm"
      >
        <div className="space-y-4">
          <p>
            Are you sure you want to delete the service &quot;{deletingService?.idFragment}&quot;?
          </p>
          <p className="text-sm text-gray-600">
            This action cannot be undone. The service will be removed from your DID document.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeletingService(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteService}>
              Delete Service
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
