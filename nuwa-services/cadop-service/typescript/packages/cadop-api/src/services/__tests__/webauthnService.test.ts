import { jest } from '@jest/globals';
import { WebAuthnService } from '../webauthnService.js';
import {
  mockUser,
  mockAuthenticator,
  createMockRegistrationResponse,
  createMockAuthenticationResponse,
} from '../../test/mocks.js';
import type {
  RegistrationResponseJSON,
  AuthenticatorTransportFuture,
  AuthenticatorAttachment,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { supabase } from '../../config/supabase.js';
import crypto from 'crypto';
import { encode } from 'cbor2';

// 创建真实的测试数据
const mockCredentialIdBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const mockCredentialId = isoBase64URL.fromBuffer(mockCredentialIdBuffer);
const mockPublicKeyBuffer = new Uint8Array([
  0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 
  0x58, 0x20, 0x01, 0x80, 0x00, 0x00, 0x00, 0x00,
]);
const mockPublicKey = isoBase64URL.fromBuffer(mockPublicKeyBuffer);

const mockAuthenticatorDataBuffer = new Uint8Array([
  0x49, 0x96, 0x0d, 0xe5, 0x88, 0x0e, 0x8c, 0x68,
]);
const mockAuthenticatorData = isoBase64URL.fromBuffer(mockAuthenticatorDataBuffer);

describe('WebAuthn Service', () => {
  let webAuthnService: WebAuthnService;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // 清理测试数据
    await supabase.from('webauthn_challenges').delete().neq('id', '');
    await supabase.from('authenticators').delete().neq('id', '');
    await supabase.from('authenticators').delete().eq('id', mockAuthenticator.id);

    webAuthnService = new WebAuthnService();
  });

  describe('Public Key Storage and Verification', () => {
    it('should correctly store and retrieve public key', async () => {
      // 首先生成注册选项以创建 challenge
      const options = await webAuthnService.generateRegistrationOptions(
        mockUser.id,
        mockUser.email,
        mockUser.name
      );

      const mockResponse = createMockRegistrationResponse(options.challenge);

      // 使用真实的 WebAuthn 服务进行验证
      const result = await webAuthnService.verifyRegistrationResponse(
        mockUser.id,
        mockResponse,
        'Test Device'
      );

      expect(result.success).toBe(true);
      if (result.success && result.authenticator) {
        expect(result.authenticator.credentialId).toBeDefined();
        expect(result.authenticator.friendlyName).toBe('Test Device');
      }
    });

    it('should correctly store and retrieve public key format', async () => {
      // 测试公钥的存储和读取格式
      const coseMap = new Map();
      coseMap.set(1, 2); // kty: EC2
      coseMap.set(3, -7); // alg: ES256
      coseMap.set(-1, 1); // crv: P-256
      coseMap.set(-2, new Uint8Array(32)); // x coordinate
      coseMap.set(-3, new Uint8Array(32)); // y coordinate
      
      const testPublicKey = Buffer.from(encode(coseMap));

      // 模拟数据库存储（转换为十六进制字符串）
      const storedHex = testPublicKey.toString('hex');
      console.log('Stored public key hex:', storedHex);
      console.log('Original Buffer:', testPublicKey);
      console.log('Original Buffer length:', testPublicKey.length);

      // 模拟从数据库读取（从十六进制字符串转换回 Buffer）
      const retrievedBuffer = Buffer.from(storedHex, 'hex');
      console.log('Retrieved Buffer:', retrievedBuffer);
      console.log('Retrieved Buffer length:', retrievedBuffer.length);
      console.log('Buffers equal:', testPublicKey.equals(retrievedBuffer));

      // 测试不同的格式转换
      const asUint8Array = new Uint8Array(retrievedBuffer);
      console.log('As Uint8Array:', asUint8Array);
      console.log('Uint8Array length:', asUint8Array.length);

      // 测试 JSON 序列化行为
      const serialized = JSON.stringify(retrievedBuffer);
      console.log('JSON serialized:', serialized.substring(0, 100) + '...');
      
      const parsed = JSON.parse(serialized);
      console.log('JSON parsed type:', typeof parsed);
      console.log('JSON parsed has data:', 'data' in parsed);
      console.log('JSON parsed has type:', 'type' in parsed);

      expect(testPublicKey.equals(retrievedBuffer)).toBe(true);
    });

    it('should correctly store and retrieve authenticator from database', async () => {
      // 创建一个测试公钥
      const testPublicKey = Buffer.from('a501020326200121a26474797065664275666665726464617461b82061301', 'hex');
      
      // 插入认证器到数据库
      const { data: insertedAuth, error: insertError } = await supabase
        .from('authenticators')
        .insert({
          id: mockAuthenticator.id,
          user_id: mockUser.id,
          credential_id: mockAuthenticator.credential_id,
          credential_public_key: testPublicKey.toString('hex'), // 存储为十六进制字符串
          counter: mockAuthenticator.counter,
          credential_device_type: mockAuthenticator.credential_device_type,
          credential_backed_up: mockAuthenticator.credential_backed_up,
          transports: mockAuthenticator.transports,
          friendly_name: mockAuthenticator.friendly_name,
          aaguid: mockAuthenticator.aaguid,
        })
        .select()
        .single();

      expect(insertError).toBeNull();
      expect(insertedAuth).toBeDefined();

      // 使用 WebAuthn 服务的 getAuthenticators 方法读取
      const webAuthnService = new WebAuthnService();
      const authenticators = await (webAuthnService as any).getAuthenticators({ 
        credentialId: mockAuthenticator.credential_id 
      });

      expect(authenticators).toHaveLength(1);
      const retrievedAuth = authenticators[0];
      
      // 验证公钥正确恢复
      expect(Buffer.isBuffer(retrievedAuth.credentialPublicKey)).toBe(true);
      expect(retrievedAuth.credentialPublicKey.equals(testPublicKey)).toBe(true);
      expect(retrievedAuth.userId).toBe(mockUser.id);
      expect(retrievedAuth.credentialId).toBe(mockAuthenticator.credential_id);
    });

    it('should handle invalid public key format', async () => {
      // 首先生成注册选项以创建 challenge
      const options = await webAuthnService.generateRegistrationOptions(
        mockUser.id,
        mockUser.email,
        mockUser.name
      );

      const invalidResponse = {
        ...createMockRegistrationResponse(options.challenge),
        response: {
          ...createMockRegistrationResponse(options.challenge).response,
          attestationObject: 'invalid-attestation', // 使用无效的 attestation 对象
        },
      };

      const result = await webAuthnService.verifyRegistrationResponse(
        mockUser.id,
        invalidResponse,
        'Test Device'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Device Management', () => {
    it('should handle getUserDevices', async () => {
      // 首先创建一个认证器
      await supabase
        .from('authenticators')
        .insert({
          id: mockAuthenticator.id,
          user_id: mockUser.id,
          credential_id: mockAuthenticator.credential_id,
          credential_public_key: mockAuthenticator.credential_public_key,
          counter: mockAuthenticator.counter,
          credential_device_type: mockAuthenticator.credential_device_type,
          credential_backed_up: mockAuthenticator.credential_backed_up,
          transports: mockAuthenticator.transports,
          friendly_name: mockAuthenticator.friendly_name,
          aaguid: mockAuthenticator.aaguid,
        });

      const devices = await webAuthnService.getUserDevices(mockUser.id);
      expect(Array.isArray(devices)).toBe(true);
      expect(devices.length).toBe(1);
      expect(devices[0].id).toBe(mockAuthenticator.id);
    });

    it('should handle removeDevice', async () => {
      // 首先创建一个认证器
      await supabase
        .from('authenticators')
        .insert({
          id: mockAuthenticator.id,
          user_id: mockUser.id,
          credential_id: mockAuthenticator.credential_id,
          credential_public_key: mockAuthenticator.credential_public_key,
          counter: mockAuthenticator.counter,
          credential_device_type: mockAuthenticator.credential_device_type,
          credential_backed_up: mockAuthenticator.credential_backed_up,
          transports: mockAuthenticator.transports,
          friendly_name: mockAuthenticator.friendly_name,
          aaguid: mockAuthenticator.aaguid,
        });

      const result = await webAuthnService.removeDevice(mockUser.id, mockAuthenticator.id);
      expect(result).toBe(true);

      // 验证设备已被删除
      const { data: device } = await supabase
        .from('authenticators')
        .select()
        .eq('id', mockAuthenticator.id)
        .single();
      expect(device).toBeNull();
    });

    it('should handle cleanupExpiredChallenges', async () => {
      // 创建一些过期的 challenge
      const expiredDate = new Date();
      expiredDate.setMinutes(expiredDate.getMinutes() - 10);

      await supabase
        .from('webauthn_challenges')
        .insert([
          {
            user_id: mockUser.id,
            challenge: 'test-challenge-1',
            operation_type: 'registration',
            expires_at: expiredDate.toISOString(),
          },
          {
            user_id: mockUser.id,
            challenge: 'test-challenge-2',
            operation_type: 'registration',
            expires_at: expiredDate.toISOString(),
          },
        ]);

      const result = await webAuthnService.cleanupExpiredChallenges();
      expect(result).toBeGreaterThan(0); // 只验证有清理发生

      // 验证 challenge 已被删除
      const { data: challenges } = await supabase
        .from('webauthn_challenges')
        .select()
        .eq('user_id', mockUser.id);
      expect(challenges).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid challenge during registration', async () => {
      // 首先生成注册选项以创建 challenge
      const options = await webAuthnService.generateRegistrationOptions(
        mockUser.id,
        mockUser.email,
        mockUser.name
      );

      const invalidResponse = createMockRegistrationResponse('invalid-challenge');

      const result = await webAuthnService.verifyRegistrationResponse(
        mockUser.id,
        invalidResponse,
        'Test Device'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Challenge');
    });

    it('should handle invalid origin during registration', async () => {
      // 首先生成注册选项以创建 challenge
      const options = await webAuthnService.generateRegistrationOptions(
        mockUser.id,
        mockUser.email,
        mockUser.name
      );

      const mockResponse = createMockRegistrationResponse(options.challenge);
      mockResponse.response.clientDataJSON = isoBase64URL.fromBuffer(Buffer.from(JSON.stringify({
        type: 'webauthn.create',
        challenge: options.challenge,
        origin: 'http://malicious-site.com',
      })));

      const result = await webAuthnService.verifyRegistrationResponse(
        mockUser.id,
        mockResponse,
        'Test Device'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Origin');
    });
  });

  describe('Authentication Flow', () => {
    it('should handle non-existent user during authentication options generation', async () => {
      await expect(webAuthnService.generateAuthenticationOptions('non-existent-user'))
        .rejects
        .toThrow('No authenticators found');
    });

    it('should handle multiple devices for the same user', async () => {
      // 为同一用户注册两个设备
      const options1 = await webAuthnService.generateRegistrationOptions(
        mockUser.id,
        mockUser.email,
        mockUser.name
      );

      const mockResponse1 = createMockRegistrationResponse(options1.challenge);

      await webAuthnService.verifyRegistrationResponse(
        mockUser.id,
        mockResponse1,
        'Device 1'
      );

      const options2 = await webAuthnService.generateRegistrationOptions(
        mockUser.id,
        mockUser.email,
        mockUser.name
      );

      const mockResponse2 = createMockRegistrationResponse(options2.challenge);

      await webAuthnService.verifyRegistrationResponse(
        mockUser.id,
        mockResponse2,
        'Device 2'
      );

      // 验证用户设备列表
      const devices = await webAuthnService.getUserDevices(mockUser.id);
      expect(devices.length).toBeGreaterThan(1); // 只验证有多个设备
      expect(devices.map(d => d.name)).toContain('Device 1');
      expect(devices.map(d => d.name)).toContain('Device 2');
    });

    it('should prevent registering the same device twice', async () => {
      // 首次注册设备
      const options = await webAuthnService.generateRegistrationOptions(
        mockUser.id,
        mockUser.email,
        mockUser.name
      );

      const mockResponse = createMockRegistrationResponse(options.challenge);

      await webAuthnService.verifyRegistrationResponse(
        mockUser.id,
        mockResponse,
        'Test Device'
      );

      // 尝试再次注册相同的设备
      const options2 = await webAuthnService.generateRegistrationOptions(
        mockUser.id,
        mockUser.email,
        mockUser.name
      );

      const result = await webAuthnService.verifyRegistrationResponse(
        mockUser.id,
        mockResponse, // 使用相同的响应
        'Test Device Again'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('already registered');
    });
  });
}); 