import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Button, 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  Alert, 
  AlertTitle, 
  AlertDescription,
  Spinner,
  SpinnerContainer,
  Tag 
} from '@/components/ui';
import { useAuth } from '../lib/auth/AuthContext';
import { useDIDService } from '@/hooks/useDIDService';
import { ArrowLeft, Key, AlertTriangle, ShieldCheck, RotateCcw } from 'lucide-react';
import {
  MultibaseCodec,
  AddKeyRequestPayloadV1,
  type OperationalKeyInfo,
  type VerificationRelationship,
} from '@nuwa-ai/identity-kit';
import { AgentSelector } from '../components/AgentSelector';
import { PasskeyService } from '../lib/passkey/PasskeyService';

export function AddKeyPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userDid, isAuthenticated, signInWithDid } = useAuth();
  const [, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AddKeyRequestPayloadV1 | null>(null);
  const [selectedAgentDid, setSelectedAgentDid] = useState<string | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [manualSelectMode, setManualSelectMode] = useState<boolean>(false);

  // Parse payload parameter
  useEffect(() => {
    const payloadParam = searchParams.get('payload');
    if (!payloadParam) {
      setError('Missing payload parameter');
      return;
    }

    try {
      // Base64URL decode
      const decodedPayload = MultibaseCodec.decodeBase64urlToString(payloadParam);
      const parsedPayload = JSON.parse(decodedPayload) as AddKeyRequestPayloadV1;

      // Validate required fields
      if (
        !parsedPayload.version ||
        !parsedPayload.verificationMethod ||
        !parsedPayload.redirectUri ||
        !parsedPayload.state
      ) {
        throw new Error('Invalid payload: missing required fields');
      }

      setPayload(parsedPayload);

      // If agentDid is specified, set it directly
      if (parsedPayload.agentDid) {
        setSelectedAgentDid(parsedPayload.agentDid);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse payload';
      setError(`Invalid payload format: ${message}`);
    }
  }, [searchParams]);

  // Obtain didService via the shared hook once agent DID has been chosen
  const { didService, error: didServiceError } = useDIDService(selectedAgentDid);

  // Authenticate user if not already authenticated
  useEffect(() => {
    const authenticateUser = async () => {
      if (payload && !isAuthenticated) {
        try {
          setLoading(true);
          const passkeyService = new PasskeyService();
          const userDidResult = await passkeyService.login();
          if (userDidResult) {
            signInWithDid(userDidResult);
          } else {
            throw new Error('Authentication failed');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Authentication failed';
          setError(`Login error: ${message}`);
        } finally {
          setLoading(false);
        }
      }
    };

    authenticateUser();
  }, [payload, isAuthenticated, signInWithDid]);

  const handleAgentSelect = (did: string) => {
    setSelectedAgentDid(did);
    setManualSelectMode(false);
  };

  const handleChangeAgent = () => {
    setSelectedAgentDid(null);
    setManualSelectMode(true);
  };

  const handleConfirm = async () => {
    if (!didService || !payload || !selectedAgentDid) return;

    setProcessing(true);
    setError(null);

    try {
      const keyInfo: OperationalKeyInfo = {
        type: payload.verificationMethod.type,
        controller: selectedAgentDid,
        idFragment: payload.verificationMethod.idFragment || `key-${Date.now()}`,
        publicKeyMaterial: MultibaseCodec.decodeBase58btc(
          payload.verificationMethod.publicKeyMultibase || ''
        ),
      };

      const keyId = await didService.addVerificationMethod(
        keyInfo,
        payload.verificationRelationships as VerificationRelationship[]
      );

      const redirectUrl = new URL(payload.redirectUri);
      redirectUrl.searchParams.append('success', '1');
      redirectUrl.searchParams.append('key_id', keyId);
      redirectUrl.searchParams.append('agent', selectedAgentDid);
      redirectUrl.searchParams.append('state', payload.state);

      if (payload.redirectUri.startsWith(window.location.origin) && window.opener) {
        window.opener.postMessage(
          {
            success: 1,
            key_id: keyId,
            agent: selectedAgentDid,
            state: payload.state,
          },
          new URL(payload.redirectUri).origin
        );
        window.close();
      } else {
        window.location.href = redirectUrl.toString();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message);

      try {
        const redirectUrl = new URL(payload.redirectUri);
        redirectUrl.searchParams.append('success', '0');
        redirectUrl.searchParams.append('error', encodeURIComponent(message));
        redirectUrl.searchParams.append('state', payload.state);
        window.location.href = redirectUrl.toString();
      } catch (redirectErr) {
        console.error('Failed to redirect with error:', redirectErr);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    if (payload) {
      try {
        const redirectUrl = new URL(payload.redirectUri);
        redirectUrl.searchParams.append('success', '0');
        redirectUrl.searchParams.append('error', 'User canceled');
        redirectUrl.searchParams.append('state', payload.state);
        window.location.href = redirectUrl.toString();
      } catch (err) {
        // If redirect fails, go back to home
        navigate('/');
      }
    } else {
      navigate('/');
    }
  };

  // Check if high risk permissions are requested (from payload initial relationships)
  const hasHighRiskPermission = payload?.verificationRelationships.includes('capabilityDelegation');

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={handleCancel} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.cancel')}
          </Button>

          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Key className="h-6 w-6" />
            {t('Add Authentication Key')}
          </h2>
        </div>

        {(error || didServiceError) && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>{t('common.error')}</AlertTitle>
            <AlertDescription>{error || didServiceError}</AlertDescription>
          </Alert>
        )}

        {payload && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                {t('Authorization Request')}
                {hasHighRiskPermission && (
                  <Tag variant="danger" className="ml-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> High Risk
                  </Tag>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isAuthenticated ? (
                <div className="text-center py-8">
                  <SpinnerContainer loading={true} />
                  <p className="mt-4">{t('Waiting for authentication...')}</p>
                </div>
              ) : (
                <>
                  <div className="border rounded-md p-4 mb-4">
                    <h3 className="font-medium mb-2">Key Details</h3>
                    <dl className="grid grid-cols-[1fr_2fr] gap-2">
                      <dt className="text-sm font-medium text-gray-500">Key Type</dt>
                      <dd>{payload.verificationMethod.type}</dd>
                      
                      <dt className="text-sm font-medium text-gray-500">Key ID</dt>
                      <dd>{payload.verificationMethod.idFragment || 'Auto-generated'}</dd>
                      
                      <dt className="text-sm font-medium text-gray-500">Permissions</dt>
                      <dd className="flex flex-wrap gap-1">
                        {payload.verificationRelationships.map(rel => (
                          <Tag 
                            key={rel} 
                            variant={rel === 'capabilityDelegation' ? 'danger' : 'default'}
                            className="flex items-center gap-1"
                          >
                            {rel === 'capabilityDelegation' && <AlertTriangle className="h-3 w-3" />} {rel}
                          </Tag>
                        ))}
                      </dd>
                      
                      <dt className="text-sm font-medium text-gray-500">Redirect URI</dt>
                      <dd className="break-all">{payload.redirectUri}</dd>
                    </dl>
                  </div>

                  {hasHighRiskPermission && (
                    <Alert variant="destructive" className="my-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>High Risk Permission</AlertTitle>
                      <AlertDescription>
                        This key is requesting capability delegation permission, which allows it to manage other keys and modify your DID document. Only grant this to highly trusted devices/environments.
                      </AlertDescription>
                    </Alert>
                  )}

                  {!selectedAgentDid ? (
                    <div className="mt-6">
                      <h4 className="text-lg font-medium mb-2">Select Agent DID</h4>
                      <AgentSelector onSelect={handleAgentSelect} autoSelectFirst={!manualSelectMode} />
                    </div>
                  ) : (
                    <div className="mt-6 border rounded-md p-4">
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        Selected Agent
                        <button type="button" onClick={handleChangeAgent} className="text-sm text-primary-600 hover:underline inline-flex items-center gap-1">
                          <RotateCcw className="h-3 w-3" /> Change
                        </button>
                      </h4>
                      <div className="text-sm break-all">{selectedAgentDid}</div>
                    </div>
                  )}

                  <div className="flex justify-end space-x-4 mt-6">
                    <Button variant="outline" onClick={handleCancel} disabled={processing}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      onClick={handleConfirm}
                      disabled={!selectedAgentDid || processing}
                    >
                      {processing ? (
                        <SpinnerContainer loading={true} size="small" />
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          {t('Authorize')}
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
