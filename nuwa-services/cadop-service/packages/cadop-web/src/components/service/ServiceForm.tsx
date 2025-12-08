import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Alert,
  AlertDescription,
} from '@/components/ui';
import { Plus, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { ServiceInfo } from '@nuwa-ai/identity-kit';
import { useServiceManagement } from '@/hooks/useServiceManagement';

interface DiscoveryInfo {
  serviceId?: string;
  serviceDid?: string;
  defaultAssetId?: string;
  supportedFeatures?: string[];
}

interface ServiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  agentDid: string;
}

interface ServiceFormData {
  idFragment: string;
  type: string;
  serviceEndpoint: string;
  additionalProperties: Record<string, string>;
}

const SERVICE_TYPES = [
  { value: 'mcp', label: 'MCP Server' },
  { value: 'llm-gateway', label: 'LLM Gateway' },
];

export function ServiceForm({ isOpen, onClose, onSuccess, agentDid }: ServiceFormProps) {
  const { addService, checkServiceStatus } = useServiceManagement(agentDid);

  const [formData, setFormData] = useState<ServiceFormData>({
    idFragment: '',
    type: 'mcp',
    serviceEndpoint: '',
    additionalProperties: {},
  });
  const [newPropertyKey, setNewPropertyKey] = useState('');
  const [newPropertyValue, setNewPropertyValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Service status checking
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<{
    status: 'online' | 'offline' | 'error';
    message?: string;
    discoveryInfo?: DiscoveryInfo;
  } | null>(null);

  // Reset form data when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        idFragment: '',
        type: 'mcp',
        serviceEndpoint: '',
        additionalProperties: {},
      });
      setError(null);
      setValidationErrors({});
      setServiceStatus(null);
    }
  }, [isOpen]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.idFragment.trim()) {
      errors.idFragment = 'Service ID is required';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.idFragment)) {
      errors.idFragment = 'Service ID can only contain letters, numbers, hyphens, and underscores';
    }

    if (!formData.serviceEndpoint.trim()) {
      errors.serviceEndpoint = 'Service endpoint is required';
    } else {
      try {
        new URL(formData.serviceEndpoint);
      } catch {
        errors.serviceEndpoint = 'Service endpoint must be a valid URL';
      }
    }

    const serviceType = formData.type;
    if (!serviceType.trim()) {
      errors.type = 'Service type is required';
    } else if (!SERVICE_TYPES.some(t => t.value === serviceType)) {
      errors.type = 'Invalid service type';
    }

    // Validate detected service DID matches current agent DID (when available)
    const detectedDid = serviceStatus?.discoveryInfo?.serviceDid;
    if (detectedDid && agentDid && detectedDid !== agentDid) {
      errors.serviceEndpoint = 'Service DID does not match current agent DID';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCheckStatus = async () => {
    if (!formData.serviceEndpoint) return;

    setCheckingStatus(true);
    setServiceStatus(null);

    try {
      const status = await checkServiceStatus(formData.serviceEndpoint);
      setServiceStatus({
        ...status,
        discoveryInfo: status.discoveryInfo as DiscoveryInfo | undefined,
      });

      // Auto-fill Service ID from discovery info or endpoint host if empty
      try {
        if (!formData.idFragment) {
          const discovery = status.discoveryInfo as DiscoveryInfo | undefined;
          const discoveredId = discovery?.serviceId ?? '';
          let nextId = discoveredId;
          if (!nextId) {
            const url = new URL(formData.serviceEndpoint);
            const host = url.hostname;
            const base = host.includes('.') ? host.split('.')[0] : host;
            nextId = base;
          }
          nextId = nextId
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9_-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
          if (nextId) {
            setFormData(prev => ({ ...prev, idFragment: nextId }));
          }
        }
      } catch {
        // ignore autofill errors
      }
    } catch (err) {
      setServiceStatus({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to check service status',
      });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleAddProperty = () => {
    if (!newPropertyKey.trim() || !newPropertyValue.trim()) return;

    setFormData(prev => ({
      ...prev,
      additionalProperties: {
        ...prev.additionalProperties,
        [newPropertyKey]: newPropertyValue,
      },
    }));

    setNewPropertyKey('');
    setNewPropertyValue('');
  };

  const handleRemoveProperty = (key: string) => {
    setFormData(prev => {
      const { [key]: removed, ...rest } = prev.additionalProperties;
      return {
        ...prev,
        additionalProperties: rest,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      const serviceInfo: ServiceInfo = {
        idFragment: formData.idFragment,
        type: formData.type,
        serviceEndpoint: formData.serviceEndpoint,
        additionalProperties:
          Object.keys(formData.additionalProperties).length > 0
            ? formData.additionalProperties
            : undefined,
      };

      await addService(serviceInfo);

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save service');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = () => {
    if (checkingStatus) {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    }

    switch (serviceStatus?.status) {
      case 'online':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'offline':
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (serviceStatus?.status) {
      case 'online':
        return 'text-green-600';
      case 'offline':
        return 'text-orange-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Service</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Service ID <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.idFragment}
                  onChange={e => setFormData(prev => ({ ...prev, idFragment: e.target.value }))}
                  placeholder="e.g., payment-service"
                  className={validationErrors.idFragment ? 'border-red-500' : ''}
                />
                {validationErrors.idFragment && (
                  <p className="text-red-500 text-sm mt-1">{validationErrors.idFragment}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Service Type <span className="text-red-500">*</span>
                </label>
                <Select
                  value={formData.type}
                  onValueChange={(value: string) => setFormData(prev => ({ ...prev, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select service type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {validationErrors.type && (
                  <p className="text-red-500 text-sm mt-1">{validationErrors.type}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Service Endpoint <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    value={formData.serviceEndpoint}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, serviceEndpoint: e.target.value }))
                    }
                    placeholder="https://example.com/api"
                    className={`flex-1 ${validationErrors.serviceEndpoint ? 'border-red-500' : ''}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCheckStatus}
                    disabled={!formData.serviceEndpoint || checkingStatus}
                  >
                    {checkingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
                  </Button>
                </div>
                {validationErrors.serviceEndpoint && (
                  <p className="text-red-500 text-sm mt-1">{validationErrors.serviceEndpoint}</p>
                )}

                {serviceStatus && (
                  <div className={`flex items-center gap-2 mt-2 text-sm ${getStatusColor()}`}>
                    {getStatusIcon()}
                    <span>{serviceStatus.message}</span>
                  </div>
                )}

                {serviceStatus?.discoveryInfo && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-800 mb-2">
                      Payment Service Detected
                    </p>
                    <div className="space-y-1 text-xs text-green-700">
                      <div>Service ID: {serviceStatus.discoveryInfo?.serviceId ?? ''}</div>
                      <div>Service DID: {serviceStatus.discoveryInfo?.serviceDid ?? ''}</div>
                      <div>Default Asset: {serviceStatus.discoveryInfo?.defaultAssetId ?? ''}</div>
                      {serviceStatus.discoveryInfo?.supportedFeatures && (
                        <div>
                          Features: {serviceStatus.discoveryInfo.supportedFeatures.join(', ')}
                        </div>
                      )}
                    </div>
                    {serviceStatus.discoveryInfo?.serviceDid &&
                      agentDid &&
                      serviceStatus.discoveryInfo.serviceDid !== agentDid && (
                        <div className="mt-2 text-xs text-red-600">
                          Service DID does not match current agent DID. Please verify endpoint.
                        </div>
                      )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Additional Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(formData.additionalProperties).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(formData.additionalProperties).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <span className="font-mono text-sm flex-1">
                        {key}: {value}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveProperty(key)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={newPropertyKey}
                  onChange={e => setNewPropertyKey(e.target.value)}
                  placeholder="Property name"
                  className="flex-1"
                />
                <Input
                  value={newPropertyValue}
                  onChange={e => setNewPropertyValue(e.target.value)}
                  placeholder="Property value"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddProperty}
                  disabled={!newPropertyKey.trim() || !newPropertyValue.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                !!validationErrors.serviceEndpoint ||
                !!(
                  serviceStatus?.discoveryInfo?.serviceDid &&
                  agentDid &&
                  serviceStatus.discoveryInfo.serviceDid !== agentDid
                )
              }
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Service'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
