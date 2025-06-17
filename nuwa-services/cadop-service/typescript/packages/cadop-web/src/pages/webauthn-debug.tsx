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
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialParameters,
  PublicKeyCredentialDescriptorJSON,
  AuthenticatorAttestationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';
import { decode } from 'cbor2';
import {
  DidKeyCodec,
  KeyType,
  KEY_TYPE,
  CryptoUtils,
  defaultCryptoProviderFactory,
  algorithmToKeyType,
} from '@nuwa-ai/identity-kit';
import { PublicKeyUtils, SignatureUtils } from '@/lib/crypto/PublicKeyUtils';
import { Base64 } from 'js-base64';
import { p256 } from '@noble/curves/p256';

/**
 * WebAuthn Debug Page - Updated to use PublicKeyUtils
 *
 * Changes made:
 * 1. Replaced custom parsePEMPublicKey logic with PublicKeyUtils.extractRawPublicKeyFromSPKI
 * 2. Updated verification to use PublicKeyUtils.verify for comparison with CryptoUtils
 * 3. Uses mature cryptographic libraries for better reliability
 */

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

export function WebAuthnDebugPage() {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageToSign, setMessageToSign] = useState('');
  const [lastSignature, setLastSignature] = useState<SignatureData | null>(null);
  const [verifyMessage, setVerifyMessage] = useState('');
  const [verifySignature, setVerifySignature] = useState('');
  const [credentialData, setCredentialData] = useState<string>('');
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState<boolean | null>(null);
  const [isPlatformAuthenticatorAvailable, setIsPlatformAuthenticatorAvailable] = useState<
    boolean | null
  >(null);
  const [did, setDid] = useState<string>('');
  const [credentialId, setCredentialId] = useState<string>('');

  const DID_STORAGE_KEY = 'userDid';
  const CREDENTIAL_ID_STORAGE_KEY = 'credentialId';

  // 从 localStorage 加载 did 和 credentialId
  useEffect(() => {
    const savedDid = localStorage.getItem(DID_STORAGE_KEY);
    const savedCredentialId = localStorage.getItem(CREDENTIAL_ID_STORAGE_KEY);
    if (savedDid) {
      setDid(savedDid);
    }
    if (savedCredentialId) {
      setCredentialId(savedCredentialId);
    }
  }, []);

  // 保存 did 和 credentialId 到 localStorage
  const saveDid = (newDid: string) => {
    localStorage.setItem(DID_STORAGE_KEY, newDid);
    setDid(newDid);
  };

  const saveCredentialId = (newCredentialId: string) => {
    localStorage.setItem(CREDENTIAL_ID_STORAGE_KEY, newCredentialId);
    setCredentialId(newCredentialId);
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
          platformAuthenticatorAvailable: platformAvailable,
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
          id: window.location.hostname,
        },
        user: {
          id: bufferToBase64URLString(new Uint8Array(32)),
          name: 'test@example.com',
          displayName: 'Test User',
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
          residentKey: 'required',
          requireResidentKey: true,
        },
      };

      addLog('info', 'Requesting credential creation', options);

      const credential = await startRegistration(options);
      addLog('info', 'Registration result', credential);

      try {
        // 使用新的 PublicKeyUtils 提取公钥
        if (credential.response.publicKey && credential.response.publicKeyAlgorithm !== undefined) {
          const algorithm = credential.response.publicKeyAlgorithm;

          addLog('info', 'Public Key from Response:', {
            algorithm: algorithm,
            publicKeyLength: credential.response.publicKey.length,
            publicKeyBase64: credential.response.publicKey,
          });

          // 解码 Base64URL 格式的公钥 (SPKI 格式)
          const spkiBytes = Base64.toUint8Array(credential.response.publicKey);

          addLog('info', 'SPKI bytes:', {
            length: spkiBytes.length,
            hex: Array.from(spkiBytes)
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
            first10Bytes: Array.from(spkiBytes.slice(0, 10))
              .map(b => b.toString(16).padStart(2, '0'))
              .join(' '),
          });

          // 使用 PublicKeyUtils 提取原始公钥
          const rawPublicKey = PublicKeyUtils.extractRawPublicKeyFromSPKI(
            spkiBytes,
            credential.response.publicKeyAlgorithm
          );

          // 同时使用传统方法提取公钥进行对比
          let legacyPublicKey: Uint8Array | null = null;
          try {
            legacyPublicKey = PublicKeyUtils.extractRawPublicKeyFromSPKI(
              spkiBytes,
              credential.response.publicKeyAlgorithm
            );
            // 这里调用 legacy 方法，但先看看是否有其他方式
          } catch (e) {
            addLog('error', 'Legacy extraction failed', e);
          }

          // 获取密钥类型
          const keyType = algorithmToKeyType(credential.response.publicKeyAlgorithm);
          if (!keyType) {
            throw new Error(`Unsupported key algorithm: ${credential.response.publicKeyAlgorithm}`);
          }

          addLog('info', 'Extracted Public Key:', {
            keyType,
            length: rawPublicKey.length,
            hex: Array.from(rawPublicKey)
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
            compressed: rawPublicKey[0] === 0x02 || rawPublicKey[0] === 0x03,
            compressionFlag: rawPublicKey[0].toString(16).padStart(2, '0'),
          });

          // 生成 did:key
          const newDid = DidKeyCodec.generateDidKey(rawPublicKey, keyType);
          addLog('info', 'Generated did:key', newDid);

          // 保存注册时的公钥十六进制字符串用于后续比较
          const rawPublicKeyHex = Array.from(rawPublicKey)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          localStorage.setItem('regKeyHex', rawPublicKeyHex);
          addLog('info', 'Saved registration key hex', {
            rawPublicKeyHex,
            keyType,
            length: rawPublicKey.length,
          });

          // 验证 DID 能否正确解析回原始公钥
          try {
            const { keyType: parsedKeyType, publicKey: parsedPublicKey } =
              DidKeyCodec.parseDidKey(newDid);
            const publicKeyMatches = Array.from(rawPublicKey).every(
              (byte, index) => byte === parsedPublicKey[index]
            );

            addLog('info', 'DID roundtrip test', {
              originalKeyType: keyType,
              parsedKeyType: parsedKeyType,
              keyTypeMatches: keyType === parsedKeyType,
              originalPublicKeyHex: Array.from(rawPublicKey)
                .map(b => b.toString(16).padStart(2, '0'))
                .join(''),
              parsedPublicKeyHex: Array.from(parsedPublicKey)
                .map(b => b.toString(16).padStart(2, '0'))
                .join(''),
              publicKeyMatches: publicKeyMatches,
              lengthMatch: rawPublicKey.length === parsedPublicKey.length,
            });
          } catch (didError) {
            addLog('error', 'DID parsing failed', didError);
          }

          // 保存 did
          saveDid(newDid);

          // 保存 credentialId
          saveCredentialId(credential.id);
          addLog('info', 'Saved credential ID', credential.id);

          const credentialData: CredentialData = {
            id: credential.id,
            response: {
              attestationObject: credential.response.attestationObject as string,
              clientDataJSON: credential.response.clientDataJSON as string,
            },
          };

          addLog('info', 'Saving credential data', credentialData);
          setCredentialData(JSON.stringify(credentialData, null, 2));
          addLog('success', 'Credential created successfully', credentialData);
        } else {
          throw new Error('No public key or algorithm found in credential response');
        }
      } catch (error) {
        addLog('error', 'Failed to process public key', {
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                }
              : error,
          credential: credential,
        });
        throw error;
      }
    } catch (error) {
      addLog('error', 'Credential creation failed', {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
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
        timeout: 60000,
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
          userHandle: assertion.response.userHandle,
        },
        type: assertion.type,
        clientExtensionResults: assertion.clientExtensionResults,
      };

      addLog('success', 'Authentication successful', result);
      return result;
    } catch (error) {
      addLog('error', 'Authentication failed', {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
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

      if (!credentialId) {
        message.error('No credential ID found. Please create credential first.');
        return;
      }

      setLoading(true);
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      // 使用保存的 credentialId
      const options: PublicKeyCredentialRequestOptionsJSON = {
        challenge: bufferToBase64URLString(challenge),
        rpId: window.location.hostname,
        allowCredentials: [
          {
            id: credentialId,
            type: 'public-key',
            // transports: ['internal']
          },
        ],
        userVerification: 'preferred',
        timeout: 60000,
      };

      addLog('info', 'Authentication options', {
        ...options,
        allowCredentials: options.allowCredentials?.map(cred => ({
          ...cred,
          id: cred.id.substring(0, 20) + '...', // 截断显示
        })),
      });

      const credential = await startAuthentication(options);
      addLog('info', 'Authentication response', credential);

      // 详细记录签名相关信息
      addLog('info', 'Sign credential details', {
        id: credential.id,
        idLength: credential.id.length,
        rawIdLength: credential.rawId?.length,
        authenticatorDataLength: credential.response.authenticatorData.length,
        clientDataJSONLength: credential.response.clientDataJSON.length,
        signatureLength: credential.response.signature.length,
      });

      // 保存签名结果
      const signatureData: SignatureData = {
        message: bufferToBase64URLString(challenge),
        signature: {
          response: {
            authenticatorData: credential.response.authenticatorData,
            clientDataJSON: credential.response.clientDataJSON,
            signature: credential.response.signature,
          },
        },
      };

      setLastSignature(signatureData);
      setVerifyMessage(JSON.stringify(signatureData, null, 2));
      setVerifySignature(JSON.stringify(signatureData, null, 2));

      addLog('success', 'Sign successful', {
        challenge: bufferToBase64URLString(challenge),
        signatureData,
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
        signedChallenge: challenge,
      });

      const authenticatorData = base64URLStringToBuffer(
        signatureData.signature.response.authenticatorData
      );
      const clientDataJSON = base64URLStringToBuffer(
        signatureData.signature.response.clientDataJSON
      );
      const signature = base64URLStringToBuffer(signatureData.signature.response.signature);

      // 解析 authenticatorData 的详细信息
      const rpIdHash = new Uint8Array(authenticatorData).slice(0, 32);
      const flags = new Uint8Array(authenticatorData)[32];
      const signCount = new DataView(authenticatorData, 33, 4).getUint32(0, false);

      addLog('info', 'authenticatorData parsed', {
        totalLength: authenticatorData.byteLength,
        rpIdHashHex: Array.from(rpIdHash)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        flags: flags.toString(2).padStart(8, '0'), // 二进制显示
        flagsHex: flags.toString(16).padStart(2, '0'),
        signCount,
        hasExtensions: (flags & 0x80) !== 0,
        userPresent: (flags & 0x01) !== 0,
        userVerified: (flags & 0x04) !== 0,
      });

      // 计算当前页面的 rpIdHash 进行对比
      const currentHostname = window.location.hostname;
      const expectedHash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(currentHostname)
      );
      const expectedHashArray = new Uint8Array(expectedHash);

      addLog('info', 'rpIdHash comparison', {
        currentHostname,
        expectedHashHex: Array.from(expectedHashArray)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        actualHashHex: Array.from(rpIdHash)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        match: Array.from(rpIdHash).every((byte, index) => byte === expectedHashArray[index]),
      });

      // 计算 clientDataHash
      const clientDataHash = await crypto.subtle.digest('SHA-256', clientDataJSON);

      // 合并 authenticatorData 和 clientDataHash
      const verificationData = new Uint8Array(
        authenticatorData.byteLength + clientDataHash.byteLength
      );
      verificationData.set(new Uint8Array(authenticatorData));
      verificationData.set(new Uint8Array(clientDataHash), authenticatorData.byteLength);

      // 验证 clientDataJSON 的内容和格式
      const clientDataString = new TextDecoder().decode(clientDataJSON);
      const clientDataParsed = JSON.parse(clientDataString);

      addLog('info', 'ClientData analysis', {
        clientDataString,
        clientDataParsed,
        clientDataLength: clientDataJSON.byteLength,
        clientDataHashHex: Array.from(new Uint8Array(clientDataHash))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        expectedType: 'webauthn.get',
        actualType: clientDataParsed.type,
        typeMatches: clientDataParsed.type === 'webauthn.get',
        origin: clientDataParsed.origin,
        challenge: clientDataParsed.challenge,
      });

      addLog('info', 'Verification data construction', {
        authenticatorDataLength: authenticatorData.byteLength,
        clientDataHashLength: clientDataHash.byteLength,
        totalLength: verificationData.length,
        authenticatorDataHex: Array.from(new Uint8Array(authenticatorData))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        clientDataHashHex: Array.from(new Uint8Array(clientDataHash))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        verificationDataFirst20Bytes: Array.from(verificationData.slice(0, 20))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' '),
        verificationDataLast20Bytes: Array.from(verificationData.slice(-20))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' '),
      });

      // 详细解析 DER 签名结构
      const sigBytes = new Uint8Array(signature);
      let derAnalysis = {};

      if (sigBytes.length > 64 && sigBytes[0] === 0x30) {
        try {
          let offset = 0;
          const sequenceTag = sigBytes[offset++]; // 0x30
          const sequenceLength = sigBytes[offset++];

          const rTag = sigBytes[offset++]; // 0x02
          const rLength = sigBytes[offset++];
          const rValue = sigBytes.slice(offset, offset + rLength);
          offset += rLength;

          const sTag = sigBytes[offset++]; // 0x02
          const sLength = sigBytes[offset++];
          const sValue = sigBytes.slice(offset, offset + sLength);

          derAnalysis = {
            sequenceTag: sequenceTag.toString(16),
            sequenceLength,
            rTag: rTag.toString(16),
            rLength,
            rValue: Array.from(rValue)
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
            rHasLeadingZero: rValue[0] === 0x00,
            sTag: sTag.toString(16),
            sLength,
            sValue: Array.from(sValue)
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
            sHasLeadingZero: sValue[0] === 0x00,
            totalParsedLength: offset,
            isValidDER: sequenceTag === 0x30 && rTag === 0x02 && sTag === 0x02,
          };
        } catch (parseError) {
          derAnalysis = {
            parseError: parseError instanceof Error ? parseError.message : String(parseError),
          };
        }
      }

      addLog('info', 'Signature details', {
        signatureLength: signature.byteLength,
        signatureHex: Array.from(new Uint8Array(signature))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        isDER: signature.byteLength > 64 && new Uint8Array(signature)[0] === 0x30,
        first8Bytes: Array.from(new Uint8Array(signature).slice(0, 8))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' '),
        derSequenceLength: signature.byteLength > 1 ? new Uint8Array(signature)[1] : 'N/A',
        derAnalysis,
      });

      addLog('info', 'PublicKey details', {
        keyType,
        length: publicKey.length,
        hex: Array.from(publicKey)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        isCompressed: publicKey.length === 33 && (publicKey[0] === 0x02 || publicKey[0] === 0x03),
        compressionFlag: publicKey[0]?.toString(16).padStart(2, '0'),
        first8Bytes: Array.from(publicKey.slice(0, 8))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' '),
      });

      // 如果是 P-256，检查解压后的公钥格式
      if (keyType === KEY_TYPE.ECDSAR1) {
        try {
          const decompressedKey = PublicKeyUtils.decompressP256PublicKey(publicKey);
          addLog('info', 'Decompressed P-256 public key', {
            originalLength: publicKey.length,
            decompressedLength: decompressedKey.length,
            firstByte: decompressedKey[0].toString(16).padStart(2, '0'),
            isValidUncompressed: decompressedKey.length === 65 && decompressedKey[0] === 0x04,
            decompressedHex: Array.from(decompressedKey)
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
            xCoordinate: Array.from(decompressedKey.slice(1, 33))
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
            yCoordinate: Array.from(decompressedKey.slice(33, 65))
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
          });
        } catch (decompressError) {
          addLog('error', 'Failed to decompress P-256 public key', decompressError);
        }
      }

      let isSupport = defaultCryptoProviderFactory.supports(keyType);
      addLog('info', 'Crypto provider support', { keyType, isSupport });

      // ----------------------------------------------
      // 1) 计算 digest 并用 noble 再验一次
      if (keyType === KEY_TYPE.ECDSAR1) {
        try {
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', verificationData));
          const rawSig = SignatureUtils.normalizeSignature(
            new Uint8Array(signature),
            keyType,
            'raw'
          );
          const nobleOk = p256.verify(
            rawSig,
            digest,
            PublicKeyUtils.decompressP256PublicKey(publicKey)
          );

          // 额外测试：用相同的 digest 和 rawSig 测试 WebCrypto（虽然这不是标准用法）
          let webCryptoWithDigestAndRaw = false;
          try {
            // 先尝试用 raw 签名格式
            const tempKey = await crypto.subtle.importKey(
              'raw',
              PublicKeyUtils.decompressP256PublicKey(publicKey),
              { name: 'ECDSA', namedCurve: 'P-256' },
              false,
              ['verify']
            );

            // 注意：这个测试可能会失败，因为 WebCrypto 期望 DER 格式
            webCryptoWithDigestAndRaw = await crypto.subtle.verify(
              { name: 'ECDSA', hash: { name: 'SHA-256' } },
              tempKey,
              rawSig, // 使用 raw 格式签名
              digest // 使用 digest 而不是原始数据
            );
          } catch (rawTestError) {
            addLog('info', 'WebCrypto with raw signature failed as expected', rawTestError);
          }

          // 最终测试：用 Noble.js 重新编码 DER 签名，然后用 WebCrypto 验证
          let reEncodedWebCryptoResult = false;
          try {
            // 1. 用 Noble.js 解析原始 DER 签名
            const parsedSig = p256.Signature.fromDER(new Uint8Array(signature));

            // 2. 用 Noble.js 重新编码为 DER
            const reEncodedDer = parsedSig.toDERRawBytes();

            // 3. 用重新编码的 DER 签名进行 WebCrypto 验证
            const tempKey = await crypto.subtle.importKey(
              'raw',
              PublicKeyUtils.decompressP256PublicKey(publicKey),
              { name: 'ECDSA', namedCurve: 'P-256' },
              false,
              ['verify']
            );

            reEncodedWebCryptoResult = await crypto.subtle.verify(
              { name: 'ECDSA', hash: { name: 'SHA-256' } },
              tempKey,
              reEncodedDer,
              verificationData
            );

            addLog('info', 'DER re-encoding test', {
              originalDerLength: signature.byteLength,
              reEncodedDerLength: reEncodedDer.length,
              derSignaturesMatch: Array.from(new Uint8Array(signature)).every(
                (byte, index) => byte === reEncodedDer[index]
              ),
              reEncodedWebCryptoResult,
              originalDerHex: Array.from(new Uint8Array(signature))
                .map(b => b.toString(16).padStart(2, '0'))
                .join(''),
              reEncodedDerHex: Array.from(reEncodedDer)
                .map(b => b.toString(16).padStart(2, '0'))
                .join(''),
            });
          } catch (reEncodeError) {
            addLog('error', 'DER re-encoding failed', reEncodeError);
          }

          addLog('info', 'Noble verification', {
            nobleOk,
            webCryptoWithDigestAndRaw,
            reEncodedWebCryptoResult,
            digestLength: digest.length,
            rawSigLength: rawSig.length,
            digestHex: Array.from(digest)
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
            rawSigHex: Array.from(rawSig)
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
            verificationDataHex: Array.from(verificationData)
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
          });
        } catch (nobleError) {
          addLog('error', 'Noble verification failed', nobleError);
        }
      }

      // 最关键的测试：手动重建 WebAuthn 验证过程
      // 这是 WebAuthn 规范要求的确切步骤
      try {
        // 1. 重新计算 clientDataHash（确保一致性）
        const manualClientDataHash = await crypto.subtle.digest('SHA-256', clientDataJSON);

        // 2. 重新构建 verificationData
        const manualVerificationData = new Uint8Array(
          authenticatorData.byteLength + manualClientDataHash.byteLength
        );
        manualVerificationData.set(new Uint8Array(authenticatorData));
        manualVerificationData.set(
          new Uint8Array(manualClientDataHash),
          authenticatorData.byteLength
        );

        // 3. 检查是否与之前构建的一致
        const verificationDataMatches = Array.from(verificationData).every(
          (byte, index) => byte === manualVerificationData[index]
        );

        // 4. 尝试用手动构建的数据进行 WebCrypto 验证
        let manualWebCryptoResult = false;
        if (keyType === KEY_TYPE.ECDSAR1) {
          const manualDecompressedKey = PublicKeyUtils.decompressP256PublicKey(publicKey);
          const manualCryptoKey = await crypto.subtle.importKey(
            'raw',
            manualDecompressedKey,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
          );

          manualWebCryptoResult = await crypto.subtle.verify(
            { name: 'ECDSA', hash: { name: 'SHA-256' } },
            manualCryptoKey,
            signature,
            manualVerificationData
          );
        }

        addLog('info', 'Manual WebAuthn verification reconstruction', {
          verificationDataMatches,
          manualWebCryptoResult,
          manualVerificationDataLength: manualVerificationData.length,
          originalVerificationDataLength: verificationData.length,
          clientDataHashMatches: Array.from(new Uint8Array(clientDataHash)).every(
            (byte, index) => byte === new Uint8Array(manualClientDataHash)[index]
          ),
        });
      } catch (manualError) {
        addLog('error', 'Manual verification reconstruction failed', manualError);
      }

      // 2) 注册时的压缩公钥（localStorage 里保存的 rawPublicKeyHex）
      const regKeyHex = localStorage.getItem('regKeyHex');
      if (regKeyHex) {
        const currentKeyHex = Array.from(publicKey)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        addLog('info', 'Compare registered key vs current key', {
          regKeyHex: regKeyHex.substring(0, 40) + '…',
          currentKeyHex: currentKeyHex.substring(0, 40) + '…',
          fullRegKeyHex: regKeyHex,
          fullCurrentKeyHex: currentKeyHex,
          match: regKeyHex === currentKeyHex,
          lengthMatch: regKeyHex.length === currentKeyHex.length,
        });
      } else {
        addLog('info', 'No registered key hex found in localStorage', {
          availableKeys: Object.keys(localStorage).filter(
            k => k.includes('Key') || k.includes('key')
          ),
        });
      }
      // ----------------------------------------------

      // 测试方法：使用 Noble.js 进行 ECDSA-R1 验证（类似 PublicKeyUtils 的修复版本）
      const testNobleEcdsaR1Verify = async (
        data: Uint8Array,
        signature: Uint8Array,
        publicKey: Uint8Array,
        keyType: KeyType
      ): Promise<boolean> => {
        if (keyType !== KEY_TYPE.ECDSAR1) {
          // 对于非 ECDSA-R1，使用原来的方法
          return await CryptoUtils.verify(data, signature, publicKey, keyType);
        }

        try {
          // 1. Hash the data using SHA-256
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));

          // 2. Convert signature to raw format for Noble.js
          const rawSignature = SignatureUtils.normalizeSignature(signature, keyType, 'raw');

          // 3. Decompress the public key for Noble.js
          const decompressedKey = PublicKeyUtils.decompressP256PublicKey(publicKey);

          // 4. Verify using Noble.js
          const result = p256.verify(rawSignature, digest, decompressedKey);

          addLog('info', 'Test Noble ECDSA-R1 verification details', {
            digestLength: digest.length,
            rawSignatureLength: rawSignature.length,
            decompressedKeyLength: decompressedKey.length,
            result,
            digestHex: Array.from(digest)
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
            rawSignatureHex: Array.from(rawSignature)
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
          });

          return result;
        } catch (error) {
          addLog('error', 'Test Noble ECDSA-R1 verification failed', error);
          return false;
        }
      };

      // 使用新的 PublicKeyUtils 验证签名
      const isValid = await PublicKeyUtils.verify(
        verificationData,
        new Uint8Array(signature),
        publicKey,
        keyType
      );

      // 对比：也使用原来的 CryptoUtils 验证，用于调试
      const isValidOld = await CryptoUtils.verify(
        verificationData,
        new Uint8Array(signature),
        publicKey,
        keyType
      );

      // 测试：使用 Noble.js 的 ECDSA-R1 验证方法
      const isValidNoble = await testNobleEcdsaR1Verify(
        verificationData,
        new Uint8Array(signature),
        publicKey,
        keyType
      );

      addLog('info', 'Verification comparison', {
        publicKeyUtilsResult: isValid,
        cryptoUtilsResult: isValidOld,
        testNobleResult: isValidNoble,
        publicKeyUtilsVsCryptoUtils: isValid === isValidOld,
        testNobleVsNobleDirectTest:
          isValidNoble === (keyType === KEY_TYPE.ECDSAR1 ? true : isValidOld), // 应该与直接 Noble 测试一致
        allMethodsMatch: isValid === isValidOld && isValidOld === isValidNoble,
      });

      // 额外的 WebCrypto 直接验证（仅对 P-256）
      if (keyType === KEY_TYPE.ECDSAR1) {
        try {
          const decompressedKey = PublicKeyUtils.decompressP256PublicKey(publicKey);
          const cryptoKey = await crypto.subtle.importKey(
            'raw',
            decompressedKey,
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['verify']
          );

          // 测试1：直接使用原始 DER 签名
          const webCryptoResult1 = await crypto.subtle.verify(
            { name: 'ECDSA', hash: { name: 'SHA-256' } },
            cryptoKey,
            signature,
            verificationData
          );

          // 测试2：使用 SignatureUtils 规范化的 DER 签名
          const normalizedDerSig = SignatureUtils.normalizeSignature(
            new Uint8Array(signature),
            keyType,
            'der'
          );
          const webCryptoResult2 = await crypto.subtle.verify(
            { name: 'ECDSA', hash: { name: 'SHA-256' } },
            cryptoKey,
            normalizedDerSig,
            verificationData
          );

          // 测试3：尝试用 digest 而不是原始数据（这通常不对，但测试一下）
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', verificationData));
          let webCryptoResult3 = false;
          try {
            webCryptoResult3 = await crypto.subtle.verify(
              { name: 'ECDSA', hash: { name: 'SHA-256' } },
              cryptoKey,
              normalizedDerSig,
              digest
            );
          } catch (digestError) {
            addLog('info', 'WebCrypto with digest failed as expected', digestError);
          }

          // 测试4：检查 WebCrypto 是否期望不同的算法参数
          let webCryptoResult4 = false;
          try {
            webCryptoResult4 = await crypto.subtle.verify(
              { name: 'ECDSA', hash: 'SHA-256' }, // 不用对象包装
              cryptoKey,
              normalizedDerSig,
              verificationData
            );
          } catch (paramError) {
            addLog('info', 'WebCrypto with different params failed', paramError);
          }

          // 测试5：检查 WebCrypto 导入的公钥是否正确
          const exportedKey = await crypto.subtle.exportKey('raw', cryptoKey);
          const exportedKeyArray = new Uint8Array(exportedKey);

          addLog('info', 'WebCrypto key export test', {
            exportedKeyLength: exportedKeyArray.length,
            exportedKeyHex: Array.from(exportedKeyArray)
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
            matchesDecompressed: Array.from(exportedKeyArray).every(
              (byte, index) => byte === decompressedKey[index]
            ),
            firstByte: exportedKeyArray[0]?.toString(16).padStart(2, '0'),
            isUncompressed: exportedKeyArray.length === 65 && exportedKeyArray[0] === 0x04,
          });

          // 测试6：尝试用 Noble.js 的公钥格式重新导入到 WebCrypto
          const nobleDecompressed = PublicKeyUtils.decompressP256PublicKey(publicKey);
          let webCryptoResult6 = false;
          try {
            const cryptoKey2 = await crypto.subtle.importKey(
              'raw',
              nobleDecompressed,
              { name: 'ECDSA', namedCurve: 'P-256' },
              false,
              ['verify']
            );

            webCryptoResult6 = await crypto.subtle.verify(
              { name: 'ECDSA', hash: { name: 'SHA-256' } },
              cryptoKey2,
              normalizedDerSig,
              verificationData
            );
          } catch (reimportError) {
            addLog('info', 'WebCrypto reimport failed', reimportError);
          }

          addLog('info', 'Direct WebCrypto verification tests', {
            originalDerResult: webCryptoResult1,
            normalizedDerResult: webCryptoResult2,
            digestResult: webCryptoResult3,
            differentParamsResult: webCryptoResult4,
            reimportResult: webCryptoResult6,
            originalSigLength: signature.byteLength,
            normalizedSigLength: normalizedDerSig.length,
            signaturesMatch: Array.from(new Uint8Array(signature)).every(
              (byte, index) => byte === normalizedDerSig[index]
            ),
            keyImported: true,
          });
        } catch (webCryptoError) {
          addLog('error', 'Direct WebCrypto verification failed', {
            error:
              webCryptoError instanceof Error
                ? {
                    name: webCryptoError.name,
                    message: webCryptoError.message,
                    stack: webCryptoError.stack,
                  }
                : webCryptoError,
            browserInfo: {
              userAgent: navigator.userAgent,
              webCryptoSupported: !!window.crypto?.subtle,
              platform: navigator.platform,
            },
          });
        }
      }

      if (isValid) {
        message.success('Signature verification successful');
        addLog('success', 'Signature verification successful', {
          isValid,
          verificationDataLength: verificationData.length,
          publicKeyLength: publicKey.length,
          keyType,
        });
      } else {
        message.error('Signature verification failed');
        addLog('error', 'Signature verification failed', {
          isValid,
          verificationDataLength: verificationData.length,
          publicKeyLength: publicKey.length,
          keyType,
        });
      }
    } catch (error) {
      console.error('Verify failed', { error });
      addLog('error', 'Verification process failed', {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
      });
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
                <Button onClick={checkWebAuthnSupport}>Check WebAuthn Support</Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">DID:</label>
                  <Input
                    placeholder="Enter your DID"
                    value={did}
                    onChange={e => setDid(e.target.value)}
                    readOnly
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">Credential ID:</label>
                  <Input
                    placeholder="No credential"
                    value={credentialId ? credentialId.substring(0, 20) + '...' : ''}
                    readOnly
                  />
                </div>
                {!did || !credentialId ? (
                  <Button onClick={handleCreateCredential} disabled={loading}>
                    Create Credential
                  </Button>
                ) : (
                  <div className="space-x-2">
                    <Button onClick={handleAuthenticate} disabled={loading}>
                      Authenticate
                    </Button>
                    <Button
                      onClick={() => {
                        localStorage.removeItem(DID_STORAGE_KEY);
                        localStorage.removeItem(CREDENTIAL_ID_STORAGE_KEY);
                        localStorage.removeItem('regKeyHex');
                        setDid('');
                        setCredentialId('');
                        addLog('info', 'Cleared stored credentials and registration key');
                      }}
                      variant="outline"
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">Message to Sign:</label>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      placeholder="Enter message to sign"
                      value={messageToSign}
                      onChange={e => setMessageToSign(e.target.value)}
                    />
                    <AntButton icon={<ReloadOutlined />} onClick={generateRandomMessage} />
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
                    onChange={e => setVerifyMessage(e.target.value)}
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Signature to Verify:</label>
                  <Input.TextArea
                    placeholder="Enter signature to verify"
                    value={verifySignature}
                    onChange={e => setVerifySignature(e.target.value)}
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
                  type={
                    log.type === 'error' ? 'error' : log.type === 'success' ? 'success' : 'info'
                  }
                  message={log.message}
                  description={
                    log.data && (
                      <pre className="mt-2 text-xs overflow-x-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )
                  }
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
