import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '../lib/auth/AuthContext';
import { custodianClient } from '../lib/api/client';
import { DIDService } from '../lib/did/DIDService';
import { WebAuthnSigner } from '../lib/auth/WebAuthnSigner';
import { Spin, Alert, Form, Space, Typography, Select, Radio } from 'antd';
import { ArrowLeftOutlined, KeyOutlined } from '@ant-design/icons';
import {
  MultibaseCodec,
  type OperationalKeyInfo,
  type VerificationRelationship,
} from '@nuwa-ai/identity-kit';
import { VerificationMethodForm, VerificationMethodFormValues } from '@/components/did/VerificationMethodForm';
import { useDIDService } from '@/hooks/useDIDService';

const { Title, Text } = Typography;
const { Option } = Select;

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
            <ArrowLeftOutlined className="mr-2" />
            {t('common.back')}
          </Button>

          <Title level={2}>Add Authentication Method</Title>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Authentication Method</CardTitle>
          </CardHeader>
          <CardContent>
            {(error || serviceError) && (
              <Alert
                message={t('common.error')}
                description={error || serviceError}
                type="error"
                showIcon
                className="mb-4"
              />
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
