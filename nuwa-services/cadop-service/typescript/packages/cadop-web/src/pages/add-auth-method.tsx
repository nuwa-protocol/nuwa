import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
import { useAuth } from '../lib/auth/AuthContext';
import { custodianClient } from '../lib/api/client';
import { DIDService } from '../lib/did/DIDService';
import { WebAuthnSigner } from '../lib/auth/WebAuthnSigner';
import { ArrowLeft, Key } from 'lucide-react';
import {
  MultibaseCodec,
  type OperationalKeyInfo,
  type VerificationRelationship,
} from '@nuwa-ai/identity-kit';
import { VerificationMethodForm, VerificationMethodFormValues } from '@/components/did/VerificationMethodForm';
import { useDIDService } from '@/hooks/useDIDService';
import { Alert, AlertTitle, AlertDescription, Spinner, SpinnerContainer } from '@/components/ui';

export function AddAuthMethodPage() {
  const { t } = useTranslation();
  const { did } = useParams<{ did: string }>();
  const navigate = useNavigate();
  const { userDid } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { didService, isLoading: serviceLoading, error: serviceError } = useDIDService(did);

  useEffect(() => {
    if (did) {
      loadDIDService();
    }
  }, [did, userDid]);

  const loadDIDService = async () => {
    if (!did || !userDid) return;

    try {
      const service = await DIDService.initialize(did);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message);
    }
  };

  const handleSubmit = async (values: VerificationMethodFormValues) => {
    if (!did || !didService) return;

    setLoading(true);
    setError(null);

    try {
      const keyInfo = {
        type: values.type,
        publicKeyMaterial: MultibaseCodec.decodeBase58btc(values.publicKeyMultibase),
        idFragment: values.idFragment || `key-${Date.now()}`,
        controller: did,
      };

      const keyId = await didService.addVerificationMethod(
        keyInfo,
        values.relationships as VerificationRelationship[]
      );

      console.log('Added verification method:', keyId);
      navigate(`/agent/${did}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>

          <h2 className="text-3xl font-bold tracking-tight">Add Authentication Method</h2>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Authentication Method</CardTitle>
          </CardHeader>
          <CardContent>
            {(error || serviceError) && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>{t('common.error')}</AlertTitle>
                <AlertDescription>{error || serviceError}</AlertDescription>
              </Alert>
            )}

            <VerificationMethodForm
              submitting={loading}
              submitText="Add Method"
              onSubmit={handleSubmit}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
