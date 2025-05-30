import React, { useState, useEffect } from 'react';
import { Card, Button, Form, Input, Alert, Typography, Space, List, Modal } from 'antd';
import { SafetyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface WebAuthnDevice {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
  transports: string[];
  device_type: string;
  backed_up: boolean;
}

interface WebAuthnTestPageProps {
  user: {
    id: string;
    email: string;
    access_token: string;
  } | null;
}

const WebAuthnTestPage: React.FC<WebAuthnTestPageProps> = ({ user }) => {
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<WebAuthnDevice[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [form] = Form.useForm();

  // Check WebAuthn support
  const isWebAuthnSupported = () => {
    return window.PublicKeyCredential !== undefined;
  };

  // Load user's devices
  const loadDevices = async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/webauthn/devices', {
        headers: {
          'Authorization': `Bearer ${user.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  useEffect(() => {
    if (user) {
      loadDevices();
    }
  }, [user]);

  // Register new WebAuthn device
  const handleRegister = async (values: { friendly_name?: string }) => {
    if (!user) {
      setMessage({ type: 'error', text: 'Please log in first' });
      return;
    }

    if (!isWebAuthnSupported()) {
      setMessage({ type: 'error', text: 'WebAuthn is not supported in this browser' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Step 1: Get registration options
      const optionsResponse = await fetch('/api/webauthn/registration/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.access_token}`,
        },
        body: JSON.stringify({
          friendly_name: values.friendly_name,
        }),
      });

      if (!optionsResponse.ok) {
        throw new Error('Failed to get registration options');
      }

      const { options } = await optionsResponse.json();

      // Convert base64url to Uint8Array for challenge and user ID
      const challenge = base64urlToUint8Array(options.challenge);
      const userId = base64urlToUint8Array(options.user.id);

      // Convert excludeCredentials if present
      let excludeCredentials;
      if (options.excludeCredentials) {
        excludeCredentials = options.excludeCredentials.map((cred: any) => ({
          ...cred,
          id: base64urlToUint8Array(cred.id),
        }));
      }

      // Step 2: Create credential
      const credential = await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge,
          user: {
            ...options.user,
            id: userId,
          },
          excludeCredentials,
        },
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create credential');
      }

      // Step 3: Prepare response for server
      const response = credential.response as AuthenticatorAttestationResponse;
      const registrationResponse = {
        id: credential.id,
        rawId: uint8ArrayToBase64url(new Uint8Array(credential.rawId)),
        response: {
          attestationObject: uint8ArrayToBase64url(new Uint8Array(response.attestationObject)),
          clientDataJSON: uint8ArrayToBase64url(new Uint8Array(response.clientDataJSON)),
          transports: response.getTransports?.() || [],
        },
        type: credential.type,
        clientExtensionResults: credential.getClientExtensionResults(),
        authenticatorAttachment: (credential as any).authenticatorAttachment,
      };

      // Step 4: Verify registration
      const verifyResponse = await fetch('/api/webauthn/registration/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.access_token}`,
        },
        body: JSON.stringify({
          response: registrationResponse,
          friendly_name: values.friendly_name,
        }),
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.error || 'Registration verification failed');
      }

      const result = await verifyResponse.json();
      
      setMessage({ type: 'success', text: 'WebAuthn device registered successfully!' });
      form.resetFields();
      await loadDevices();

    } catch (error: any) {
      console.error('WebAuthn registration failed:', error);
      setMessage({ type: 'error', text: error.message || 'Registration failed' });
    } finally {
      setLoading(false);
    }
  };

  // Authenticate with WebAuthn
  const handleAuthenticate = async () => {
    if (!isWebAuthnSupported()) {
      setMessage({ type: 'error', text: 'WebAuthn is not supported in this browser' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Step 1: Get authentication options
      const optionsResponse = await fetch('/api/webauthn/authentication/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_identifier: user?.email,
        }),
      });

      if (!optionsResponse.ok) {
        throw new Error('Failed to get authentication options');
      }

      const { options } = await optionsResponse.json();

      // Convert base64url to Uint8Array
      const challenge = base64urlToUint8Array(options.challenge);
      let allowCredentials;
      if (options.allowCredentials) {
        allowCredentials = options.allowCredentials.map((cred: any) => ({
          ...cred,
          id: base64urlToUint8Array(cred.id),
        }));
      }

      // Step 2: Get assertion
      const credential = await navigator.credentials.get({
        publicKey: {
          ...options,
          challenge,
          allowCredentials,
        },
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to get credential');
      }

      // Step 3: Prepare response for server
      const response = credential.response as AuthenticatorAssertionResponse;
      const authenticationResponse = {
        id: credential.id,
        rawId: uint8ArrayToBase64url(new Uint8Array(credential.rawId)),
        response: {
          authenticatorData: uint8ArrayToBase64url(new Uint8Array(response.authenticatorData)),
          clientDataJSON: uint8ArrayToBase64url(new Uint8Array(response.clientDataJSON)),
          signature: uint8ArrayToBase64url(new Uint8Array(response.signature)),
          userHandle: response.userHandle ? uint8ArrayToBase64url(new Uint8Array(response.userHandle)) : undefined,
        },
        type: credential.type,
        clientExtensionResults: credential.getClientExtensionResults(),
        authenticatorAttachment: (credential as any).authenticatorAttachment,
      };

      // Step 4: Verify authentication
      const verifyResponse = await fetch('/api/webauthn/authentication/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          response: authenticationResponse,
        }),
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.error || 'Authentication verification failed');
      }

      const result = await verifyResponse.json();
      setMessage({ type: 'success', text: 'WebAuthn authentication successful!' });

    } catch (error: any) {
      console.error('WebAuthn authentication failed:', error);
      setMessage({ type: 'error', text: error.message || 'Authentication failed' });
    } finally {
      setLoading(false);
    }
  };

  // Remove device
  const handleRemoveDevice = async (deviceId: string) => {
    if (!user) return;

    Modal.confirm({
      title: 'Remove WebAuthn Device',
      content: 'Are you sure you want to remove this device? This action cannot be undone.',
      okText: 'Remove',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await fetch(`/api/webauthn/devices/${deviceId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${user.access_token}`,
            },
          });

          if (response.ok) {
            setMessage({ type: 'success', text: 'Device removed successfully' });
            await loadDevices();
          } else {
            throw new Error('Failed to remove device');
          }
        } catch (error) {
          setMessage({ type: 'error', text: 'Failed to remove device' });
        }
      },
    });
  };

  // Utility functions for base64url conversion
  function base64urlToUint8Array(base64url: string): Uint8Array {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
    const binary = window.atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function uint8ArrayToBase64url(array: Uint8Array): string {
    const base64 = window.btoa(String.fromCharCode(...array));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  if (!isWebAuthnSupported()) {
    return (
      <Card>
        <Alert
          type="error"
          message="WebAuthn Not Supported"
          description="Your browser does not support WebAuthn. Please use a modern browser like Chrome, Firefox, Safari, or Edge."
        />
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <Title level={2}>
        <SafetyOutlined /> WebAuthn Test Page
      </Title>

      {message && (
        <Alert
          type={message.type}
          message={message.text}
          closable
          onClose={() => setMessage(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {!user && (
        <Alert
          type="info"
          message="Please log in to test WebAuthn registration"
          style={{ marginBottom: 16 }}
        />
      )}

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Registration Section */}
        <Card title="Register New WebAuthn Device" size="small">
          <Form
            form={form}
            layout="vertical"
            onFinish={handleRegister}
            disabled={!user || loading}
          >
            <Form.Item
              name="friendly_name"
              label="Device Name (Optional)"
              help="Give your device a friendly name like 'iPhone Touch ID' or 'YubiKey'"
            >
              <Input placeholder="My Security Key" />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                icon={<PlusOutlined />}
                disabled={!user}
              >
                Register Device
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* Authentication Section */}
        <Card title="Test Authentication" size="small">
          <Space>
            <Button
              type="default"
              onClick={handleAuthenticate}
              loading={loading}
              icon={<SafetyOutlined />}
            >
              Authenticate with WebAuthn
            </Button>
          </Space>
        </Card>

        {/* Devices List */}
        {user && (
          <Card title="Your WebAuthn Devices" size="small">
            {devices.length === 0 ? (
              <Text type="secondary">No WebAuthn devices registered</Text>
            ) : (
              <List
                dataSource={devices}
                renderItem={(device) => (
                  <List.Item
                    actions={[
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveDevice(device.id)}
                        size="small"
                      >
                        Remove
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={device.friendly_name || 'Unnamed Device'}
                      description={
                        <Space direction="vertical" size="small">
                          <Text type="secondary">
                            Type: {device.device_type}, Backed up: {device.backed_up ? 'Yes' : 'No'}
                          </Text>
                          <Text type="secondary">
                            Created: {new Date(device.created_at).toLocaleDateString()}
                          </Text>
                          {device.last_used_at && (
                            <Text type="secondary">
                              Last used: {new Date(device.last_used_at).toLocaleDateString()}
                            </Text>
                          )}
                          <Text type="secondary">
                            Transports: {device.transports.join(', ') || 'Unknown'}
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        )}
      </Space>
    </div>
  );
};

export default WebAuthnTestPage; 