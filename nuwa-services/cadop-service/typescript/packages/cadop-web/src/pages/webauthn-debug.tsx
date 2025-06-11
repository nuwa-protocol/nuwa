import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, Spin, message, Input, Space, Button as AntButton } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { 
  bufferToBase64URLString, 
  base64URLStringToBuffer,
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable
} from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialParameters,
  PublicKeyCredentialDescriptorJSON,
  AuthenticatorAttestationResponseJSON,
  RegistrationResponseJSON
} from '@simplewebauthn/types';
import { decode } from 'cbor2';
import { DidKeyCodec, KeyType, KEY_TYPE, CryptoUtils, defaultCryptoProviderFactory } from 'nuwa-identity-kit';

interface DebugLog {
  type: 'info' | 'error' | 'success';
  message: string;
  data?: any;
}

interface SignatureData {
  message: string;
  signature: {
    response: {
      authenticatorData: string;
      clientDataJSON: string;
      signature: string;
    };
  };
}

interface CredentialData {
  id: string;
  response: {
    attestationObject: string;
    clientDataJSON: string;
  };
  did?: string;
}

interface RawCredentialData {
  id: string;
  response: {
    attestationObject: ArrayBuffer | string;
    clientDataJSON: ArrayBuffer | string;
  };
}

interface AttestationObject {
  fmt: string;
  authData: Uint8Array;
  attStmt: any;
}

interface COSEPublicKey {
  kty: number;
  alg: number;
  crv: number;
  x: string;
  y?: string;
}

// 添加 PEM 公钥解析函数
function parsePEMPublicKey(pemKey: string): { x: string; y: string } {
  // 移除 PEM 头部和尾部
  const base64Key = pemKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  // 添加 padding
  const padding = base64Key.length % 4;
  const paddedKey = padding ? base64Key + '='.repeat(4 - padding) : base64Key;
  
  // 解码 base64
  const binaryString = atob(paddedKey);
  const keyBuffer = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    keyBuffer[i] = binaryString.charCodeAt(i);
  }
  
  // 跳过 ASN.1 头部 (通常是 26 字节)
  const keyData = keyBuffer.slice(26);
  
  // 提取 X 和 Y 坐标
  const x = btoa(String.fromCharCode(...keyData.slice(1, 33)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  const y = btoa(String.fromCharCode(...keyData.slice(33, 65)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return { x, y };
}

export function WebAuthnDebugPage() {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageToSign, setMessageToSign] = useState('');
  const [lastSignature, setLastSignature] = useState<SignatureData | null>(null);
  const [verifyMessage, setVerifyMessage] = useState('');
  const [verifySignature, setVerifySignature] = useState('');
  const [credentialData, setCredentialData] = useState<string>('');
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState<boolean | null>(null);
  const [isPlatformAuthenticatorAvailable, setIsPlatformAuthenticatorAvailable] = useState<boolean | null>(null);
  const [did, setDid] = useState<string>('');

  // 从 localStorage 加载 did
  useEffect(() => {
    const savedDid = localStorage.getItem('webauthn_did');
    if (savedDid) {
      setDid(savedDid);
    }
  }, []);

  // 保存 did 到 localStorage
  const saveDid = (newDid: string) => {
    localStorage.setItem('webauthn_did', newDid);
    setDid(newDid);
  };

  const addLog = (type: DebugLog['type'], message: string, data?: any) => {
    setLogs(prev => [...prev, { type, message, data }]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const generateRandomMessage = () => {
    const randomBytes = new Uint8Array(32);
    window.crypto.getRandomValues(randomBytes);
    const randomMessage = btoa(String.fromCharCode(...randomBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    setMessageToSign(randomMessage);
  };

  const checkWebAuthnSupport = async () => {
    try {
      const supported = await browserSupportsWebAuthn();
      setIsWebAuthnSupported(supported);
      
      if (supported) {
        const platformAvailable = await platformAuthenticatorIsAvailable();
        setIsPlatformAuthenticatorAvailable(platformAvailable);
        addLog('info', 'WebAuthn Support Check', { 
          supported,
          platformAuthenticatorAvailable: platformAvailable
        });
      } else {
        addLog('error', 'WebAuthn is not supported in this browser');
      }
    } catch (error) {
      addLog('error', 'Support check failed', error);
    }
  };

  const handleCreateCredential = async () => {
    setLoading(true);
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      
      const options: PublicKeyCredentialCreationOptionsJSON = {
        challenge: bufferToBase64URLString(challenge),
        rp: {
          name: 'WebAuthn Debug',
          id: window.location.hostname
        },
        user: {
          id: bufferToBase64URLString(new Uint8Array(32)),
          name: 'test@example.com',
          displayName: 'Test User'
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -8 }, // Ed25519
          { type: 'public-key', alg: -7 }, // ES256
        ] as PublicKeyCredentialParameters[],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred',
          requireResidentKey: true
        }
      };

      addLog('info', 'Requesting credential creation', options);

      const credential = await startRegistration(options);
      addLog('info', 'Registration result', credential);

      try {
        // 检查是否有 PEM 格式的公钥
        if (credential.response.publicKey) {
          const { x, y } = parsePEMPublicKey(credential.response.publicKey);
          
          addLog('info', 'Public Key from Response:', {
            algorithm: credential.response.publicKeyAlgorithm,
            x,
            y
          });

          // 根据算法类型生成 did:key
          let keyType: KeyType;
          let rawPublicKey: Uint8Array;

          if (credential.response.publicKeyAlgorithm === -8) { // Ed25519
            keyType = KEY_TYPE.ED25519;
            const paddedX = x + '='.repeat((4 - x.length % 4) % 4);
            const binaryString = atob(paddedX.replace(/-/g, '+').replace(/_/g, '/'));
            rawPublicKey = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              rawPublicKey[i] = binaryString.charCodeAt(i);
            }
          } else if (credential.response.publicKeyAlgorithm === -7) { // ES256
            keyType = KEY_TYPE.ECDSAR1;
            const paddedX = x + '='.repeat((4 - x.length % 4) % 4);
            const paddedY = y + '='.repeat((4 - y.length % 4) % 4);
            const xBinaryString = atob(paddedX.replace(/-/g, '+').replace(/_/g, '/'));
            const yBinaryString = atob(paddedY.replace(/-/g, '+').replace(/_/g, '/'));
            const xBuffer = new Uint8Array(xBinaryString.length);
            const yBuffer = new Uint8Array(yBinaryString.length);
            for (let i = 0; i < xBinaryString.length; i++) {
              xBuffer[i] = xBinaryString.charCodeAt(i);
            }
            for (let i = 0; i < yBinaryString.length; i++) {
              yBuffer[i] = yBinaryString.charCodeAt(i);
            }
            
            // 使用压缩格式的公钥 (33 字节)
            rawPublicKey = new Uint8Array(33);
            // 根据 Y 坐标的奇偶性设置压缩标志
            const isYEven = (yBuffer[yBuffer.length - 1] & 1) === 0;
            rawPublicKey[0] = isYEven ? 0x02 : 0x03; // 0x02 表示 Y 是偶数，0x03 表示 Y 是奇数
            rawPublicKey.set(xBuffer, 1);
          } else {
            throw new Error(`Unsupported public key algorithm: ${credential.response.publicKeyAlgorithm}`);
          }

          addLog('info', 'Extracted Public Key:', {
            keyType,
            length: rawPublicKey.length,
            hex: Array.from(rawPublicKey).map(b => b.toString(16).padStart(2, '0')).join('')
          });
          
          // 生成 did:key
          const newDid = DidKeyCodec.generateDidKey(rawPublicKey, keyType);
          addLog('info', 'Generated did:key', newDid);

          // 保存 did
          saveDid(newDid);

          const credentialData: CredentialData = {
            id: credential.id,
            response: {
              attestationObject: credential.response.attestationObject as string,
              clientDataJSON: credential.response.clientDataJSON as string
            }
          };

          addLog('info', 'Saving credential data', credentialData);
          setCredentialData(JSON.stringify(credentialData, null, 2));
          addLog('success', 'Credential created successfully', credentialData);
        } else {
          throw new Error('No public key found in credential response');
        }
      } catch (error) {
        addLog('error', 'Failed to process public key', {
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : error,
          credential: credential
        });
        throw error;
      }
    } catch (error) {
      addLog('error', 'Credential creation failed', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAuthenticate = async () => {
    if (!did) {
      message.error('Please create credential first');
      return;
    }

    setLoading(true);
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const options: PublicKeyCredentialRequestOptionsJSON = {
        challenge: bufferToBase64URLString(challenge),
        rpId: window.location.hostname,
        allowCredentials: [],
        userVerification: 'preferred',
        timeout: 60000
      };

      addLog('info', 'Requesting authentication', options);
      const assertion = await startAuthentication(options);
      
      const result = {
        id: assertion.id,
        rawId: assertion.rawId,
        response: {
          clientDataJSON: assertion.response.clientDataJSON,
          authenticatorData: assertion.response.authenticatorData,
          signature: assertion.response.signature,
          userHandle: assertion.response.userHandle
        },
        type: assertion.type,
        clientExtensionResults: assertion.clientExtensionResults
      };

      addLog('success', 'Authentication successful', result);
      return result;
    } catch (error) {
      addLog('error', 'Authentication failed', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    try {
      if (!did) {
        message.error('Please register first');
        return;
      }

      setLoading(true);
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      // 从 DID 中提取凭证 ID
      const { publicKey } = DidKeyCodec.parseDidKey(did);
      const credentialId = bufferToBase64URLString(publicKey);

      const options: PublicKeyCredentialRequestOptionsJSON = {
        challenge: bufferToBase64URLString(challenge),
        rpId: window.location.hostname,
        // allowCredentials: [{
        //   id: credentialId,
        //   type: 'public-key',
        //   transports: ['internal']
        // }],
        userVerification: 'preferred',
        timeout: 60000
      };

      addLog('info', 'Authentication options', options);

      const credential = await startAuthentication(options);
      addLog('info', 'Authentication response', credential);

      // 保存签名结果
      const signatureData: SignatureData = {
        message: bufferToBase64URLString(challenge),
        signature: {
          response: {
            authenticatorData: credential.response.authenticatorData,
            clientDataJSON: credential.response.clientDataJSON,
            signature: credential.response.signature
          }
        }
      };

      setLastSignature(signatureData);
      setVerifyMessage(JSON.stringify(signatureData, null, 2));
      setVerifySignature(JSON.stringify(signatureData, null, 2));

      addLog('success', 'Sign successful', {
        challenge: bufferToBase64URLString(challenge),
        signatureData
      });
    } catch (error) {
      console.error('Sign failed', { error });
      message.error('Sign failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    try {
      if (!verifyMessage || !verifySignature) {
        message.error('Please provide both message and signature');
        return;
      }

      setLoading(true);
      const signatureData = JSON.parse(verifySignature) as SignatureData;
      const { keyType, publicKey } = DidKeyCodec.parseDidKey(did);

      // 从 clientDataJSON 中提取 challenge
      const clientData = JSON.parse(atob(signatureData.signature.response.clientDataJSON));
      const challenge = clientData.challenge;

      addLog('info', 'Verification data', {
        providedMessage: signatureData.message,
        signedChallenge: challenge
      });

      const authenticatorData = base64URLStringToBuffer(signatureData.signature.response.authenticatorData);
      const clientDataJSON = base64URLStringToBuffer(signatureData.signature.response.clientDataJSON);
      const signature = base64URLStringToBuffer(signatureData.signature.response.signature);

      // 计算 clientDataHash
      const clientDataHash = await crypto.subtle.digest('SHA-256', clientDataJSON);

      // 合并 authenticatorData 和 clientDataHash
      const verificationData = new Uint8Array(authenticatorData.byteLength + clientDataHash.byteLength);
      verificationData.set(new Uint8Array(authenticatorData));
      verificationData.set(new Uint8Array(clientDataHash), authenticatorData.byteLength);

      addLog('info', 'Verification data', {
        authenticatorDataLength: authenticatorData.byteLength,
        clientDataHashLength: clientDataHash.byteLength,
        totalLength: verificationData.length,
        authenticatorDataHex: Array.from(new Uint8Array(authenticatorData)).map(b => b.toString(16).padStart(2, '0')).join(''),
        clientDataHashHex: Array.from(new Uint8Array(clientDataHash)).map(b => b.toString(16).padStart(2, '0')).join('')
      });

      addLog('info', 'Signature data', {
        signatureLength: signature.byteLength,
        signatureHex: Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
      });

      let isSupport = defaultCryptoProviderFactory.supports(keyType);
      addLog('info', 'isSupport keyType', {keyType:keyType, isSupport:isSupport});

      // 使用 CryptoUtils 验证签名
      const isValid = await CryptoUtils.verify(
        verificationData,
        new Uint8Array(signature),
        publicKey,
        keyType
      );

      if (isValid) {
        message.success('Signature verification successful');
      } else {
        message.error('Signature verification failed');
      }
    } catch (error) {
      console.error('Verify failed', { error });
      message.error('Verify failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">WebAuthn Debug Page</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex space-x-2">
                <Button onClick={checkWebAuthnSupport}>
                  Check WebAuthn Support
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">DID:</label>
                  <Input
                    placeholder="Enter your DID"
                    value={did}
                    onChange={(e) => setDid(e.target.value)}
                    readOnly
                  />
                </div>
                {!did ? (
                  <Button onClick={handleCreateCredential} disabled={loading}>
                    Create Credential
                  </Button>
                ) : (
                  <Button onClick={handleAuthenticate} disabled={loading}>
                    Authenticate
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">Message to Sign:</label>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      placeholder="Enter message to sign"
                      value={messageToSign}
                      onChange={(e) => setMessageToSign(e.target.value)}
                    />
                    <AntButton 
                      icon={<ReloadOutlined />} 
                      onClick={generateRandomMessage}
                    />
                  </Space.Compact>
                </div>
                <Button onClick={handleSign} disabled={loading || !messageToSign || !did}>
                  Sign
                </Button>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium">Message to Verify:</label>
                  <Input.TextArea
                    placeholder="Enter message to verify"
                    value={verifyMessage}
                    onChange={(e) => setVerifyMessage(e.target.value)}
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Signature to Verify:</label>
                  <Input.TextArea
                    placeholder="Enter signature to verify"
                    value={verifySignature}
                    onChange={(e) => setVerifySignature(e.target.value)}
                    rows={6}
                  />
                </div>
                <Button 
                  onClick={handleVerify} 
                  disabled={loading || !verifyMessage || !verifySignature || !did}
                  variant="outline"
                >
                  Verify
                </Button>
              </div>

              <Button onClick={clearLogs} variant="outline">
                Clear Logs
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Debug Logs</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex justify-center mb-4">
                <Spin />
              </div>
            )}
            
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {logs.map((log, index) => (
                <Alert
                  key={index}
                  type={log.type === 'error' ? 'error' : log.type === 'success' ? 'success' : 'info'}
                  message={log.message}
                  description={log.data && (
                    <pre className="mt-2 text-xs overflow-x-auto">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                  showIcon
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// 辅助函数：比较两个 ArrayBuffer 是否相等
function arrayBufferEquals(a: ArrayBuffer | Uint8Array, b: ArrayBuffer | Uint8Array): boolean {
  const aArray = new Uint8Array(a);
  const bArray = new Uint8Array(b);
  if (aArray.length !== bArray.length) return false;
  return aArray.every((value, index) => value === bArray[index]);
}
