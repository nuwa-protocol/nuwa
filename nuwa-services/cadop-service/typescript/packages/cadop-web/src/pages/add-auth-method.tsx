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
import { BaseMultibaseCodec, type OperationalKeyInfo, type VerificationRelationship } from 'nuwa-identity-kit';

const { Title, Text } = Typography;
const { Option } = Select;

export function AddAuthMethodPage() {
  const { t } = useTranslation();
  const { did } = useParams<{ did: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [didService, setDidService] = useState<DIDService | null>(null);

  useEffect(() => {
    if (did) {
      loadDIDService();
    }
  }, [did, session]);


  const loadDIDService = async () => {
    if (!did || !session) return;
    
    try {
      const service = await DIDService.initialize(did, session);
      setDidService(service);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message);
    }
  };

  const handleSubmit = async (values: any) => {
    if (!did || !didService) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const keyInfo: OperationalKeyInfo = {
        type: values.type,
        publicKeyMaterial: BaseMultibaseCodec.decodeBase58btc(values.publicKey),
        idFragment: `key-${Date.now()}`,
        controller: did
      };

      const keyId = await didService.addVerificationMethod(
        keyInfo,
        values.capabilities as VerificationRelationship[]
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
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-4"
          >
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
            {error && (
              <Alert
                message={t('common.error')}
                description={error}
                type="error"
                showIcon
                className="mb-4"
              />
            )}

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              className="space-y-6"
            >
              <Form.Item
                name="type"
                label="Method Type"
                rules={[{ required: true, message: 'Please select a method type' }]}
              >
                <Select>
                  <Option value="Ed25519VerificationKey2020">Ed25519VerificationKey2020</Option>
                  {/* <Option value="X25519KeyAgreementKey2020">X25519KeyAgreementKey2020</Option> */}
                  <Option value="EcdsaSecp256k1VerificationKey2019">EcdsaSecp256k1VerificationKey2019</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="publicKey"
                label="Public Key"
                rules={[{ required: true, message: 'Please enter the public key' }]}
              >
                <Input placeholder="Enter the public key in base58 format" />
              </Form.Item>

              <Form.Item
                name="capabilities"
                label="Capabilities"
                rules={[{ required: true, message: 'Please select at least one capability' }]}
              >
                <Select mode="multiple">
                  <Option value="authentication">Authentication</Option>
                  <Option value="assertionMethod">Assertion Method</Option>
                  {/* <Option value="keyAgreement">Key Agreement</Option> */}
                  <Option value="capabilityInvocation">Capability Invocation</Option>
                  <Option value="capabilityDelegation">Capability Delegation</Option>
                </Select>
              </Form.Item>

              <div className="flex justify-end space-x-4">
                <Button
                  variant="outline"
                  onClick={() => navigate(-1)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                >
                  {loading ? <Spin size="small" /> : 'Add Method'}
                </Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 