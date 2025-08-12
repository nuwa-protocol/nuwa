import {
  type AddKeyRequestPayloadV1,
  MultibaseCodec,
  type OperationalKeyInfo,
  type VerificationRelationship,
} from '@nuwa-ai/identity-kit';
import { AlertTriangle, ArrowLeft, Key, RotateCcw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  FixedCardActionButton,
  FixedCardActions,
  FixedCardLayout,
  FixedCardLoading,
  Tag,
} from '@/components/ui';
import { useDIDService } from '@/hooks/useDIDService';
import { AgentSelector } from '../components/AgentSelector';
import { useAuth } from '../lib/auth/AuthContext';
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

  if (!payload) {
    return (
      <FixedCardLayout
        icon={<Key className="h-12 w-12 text-gray-400" />}
        title="Add Authentication Key"
        subtitle="Invalid or missing payload parameter"
      >
        <div />
      </FixedCardLayout>
    );
  }

  if (!isAuthenticated) {
    return <FixedCardLoading title="Authenticating" message="Waiting for authentication..." />;
  }

  return (
    <FixedCardLayout
      icon={<Key className="h-12 w-12 text-primary-600" />}
      title={t('Authorization Request')}
      actions={
        <FixedCardActions>
          <FixedCardActionButton
            onClick={handleConfirm}
            disabled={!selectedAgentDid || processing}
            loading={processing}
            size="lg"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {t('Authorize')}
          </FixedCardActionButton>
          <FixedCardActionButton variant="outline" onClick={handleCancel} disabled={processing}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.cancel')}
          </FixedCardActionButton>
        </FixedCardActions>
      }
    >
      {/* High Risk Badge */}
      {hasHighRiskPermission && (
        <div className="mb-4 flex justify-center">
          <Tag variant="danger" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> High Risk Permission
          </Tag>
        </div>
      )}

      {(error || didServiceError) && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>{t('common.error')}</AlertTitle>
          <AlertDescription>{error || didServiceError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        {/* Key Details Section */}
        <div className="space-y-4">
          <h3 className="text-base font-medium text-gray-900">Key Details</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Key Type</span>
              <span className="text-gray-900 font-medium">{payload.verificationMethod.type}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Key ID</span>
              <span className="text-gray-900">
                {payload.verificationMethod.idFragment || 'Auto-generated'}
              </span>
            </div>

            <div>
              <div className="text-gray-500 mb-2">Permissions</div>
              <div className="flex flex-wrap gap-1">
                {payload.verificationRelationships.map(rel => (
                  <Tag
                    key={rel}
                    variant={rel === 'capabilityDelegation' ? 'danger' : 'default'}
                    className="flex items-center gap-1 text-xs"
                  >
                    {rel === 'capabilityDelegation' && <AlertTriangle className="h-3 w-3" />}
                    <span>{rel}</span>
                  </Tag>
                ))}
              </div>
            </div>

            <div>
              <div className="text-gray-500 mb-1">Redirect URI</div>
              <div className="text-xs text-gray-900 break-all bg-gray-50 p-2 rounded">
                {payload.redirectUri}
              </div>
            </div>
          </div>
        </div>

        {/* High Risk Warning */}
        {hasHighRiskPermission && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>High Risk Permission</AlertTitle>
            <AlertDescription>
              This key request permission delegation allows it to manage other keys and modify your
              DID document. Only granted to highly trusted devices/environments.
            </AlertDescription>
          </Alert>
        )}

        {/* Agent Selection */}
        {!selectedAgentDid ? (
          <div className="space-y-3">
            <h4 className="text-base font-medium text-gray-900">Select Agent DID</h4>
            <AgentSelector onSelect={handleAgentSelect} autoSelectFirst={!manualSelectMode} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-medium text-gray-900">Selected Agent</h4>
              <button
                type="button"
                onClick={handleChangeAgent}
                className="text-sm text-primary-600 hover:text-primary-700 hover:underline inline-flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Change
              </button>
            </div>
            <div className="text-sm text-gray-600 break-all bg-gray-50 p-3 rounded">
              {selectedAgentDid}
            </div>
          </div>
        )}
      </div>
    </FixedCardLayout>
  );
}
