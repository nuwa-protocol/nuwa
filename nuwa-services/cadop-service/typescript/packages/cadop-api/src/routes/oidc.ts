import express, { Router } from 'express';
import { oidcService } from '../services/oidc.js';
import { cryptoService } from '../services/crypto.js';
import { config } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { OIDCConfiguration } from '@cadop/shared/types';
import { supabase } from '../config/supabase.js';
import type { Database } from '../config/supabase.js';

const router: Router = express.Router();
const issuer = config.oidc.issuer;

/**
 * OIDC discovery endpoint
 * GET /.well-known/openid-configuration
 */
router.get('/.well-known/openid-configuration', (req, res) => {
  const configuration: OIDCConfiguration = {
    issuer: issuer,
    authorization_endpoint: `${issuer}/auth/authorize`,
    token_endpoint: `${issuer}/auth/token`,
    userinfo_endpoint: `${issuer}/auth/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    registration_endpoint: `${issuer}/auth/register`,
    
    scopes_supported: [
      'openid',
      'profile',
      'email',
      'phone',
      'address',
      'did',
      'agent_did',
      'sybil_level'
    ],
    
    response_types_supported: [
      'code',
      'id_token',
      'code id_token',
      'token',
      'token id_token',
      'code token',
      'code token id_token'
    ],
    
    response_modes_supported: [
      'query',
      'fragment',
      'form_post'
    ],
    
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
      'client_credentials'
    ],
    
    subject_types_supported: [
      'public'
    ],
    
    id_token_signing_alg_values_supported: [
      'EdDSA'
    ],
    
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'none'
    ],
    
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'auth_time',
      'nonce',
      'acr',
      'amr',
      'azp',
      'name',
      'given_name',
      'family_name',
      'nickname',
      'preferred_username',
      'profile',
      'picture',
      'website',
      'email',
      'email_verified',
      'gender',
      'birthdate',
      'zoneinfo',
      'locale',
      'phone_number',
      'phone_number_verified',
      'address',
      'updated_at',
      'did',
      'agent_did',
      'sybil_level',
      'auth_methods'
    ],
    
    display_values_supported: [
      'page',
      'popup',
      'touch',
      'wap'
    ],
    
    claim_types_supported: [
      'normal'
    ],
    
    claims_parameter_supported: false,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    require_request_uri_registration: false,
    
    service_documentation: `${issuer}/.well-known/service_documentation`,
    op_policy_uri: `${issuer}/.well-known/privacy_policy`,
    op_tos_uri: `${issuer}/.well-known/terms_of_service`
  };
  
  res.json(configuration);
});

/**
 * JWKS endpoint
 * GET /.well-known/jwks.json
 */
router.get('/.well-known/jwks.json', async (req, res) => {
  try {
    const publicJWK = cryptoService.getPublicJWK();
    if (!publicJWK) {
      throw new Error('Public key not available');
    }
    res.json({
      keys: [publicJWK]
    });
  } catch (error) {
    logger.error('Failed to get JWKS', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DID Document endpoint
 * GET /.well-known/did.json
 */
router.get('/.well-known/did.json', async (req, res) => {
  try {
    const publicJWK = cryptoService.getPublicJWK();
    if (!publicJWK) {
      throw new Error('Public key not available');
    }

    const keyId = cryptoService.getKeyId();
    if (!keyId) {
      throw new Error('Key ID not available');
    }

    const didDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/jws-2020/v1'
      ],
      id: `did:web:${new URL(issuer).hostname}`,
      verificationMethod: [
        {
          id: `${issuer}/.well-known/did.json#${keyId}`,
          type: 'JsonWebKey2020',
          controller: `did:web:${new URL(issuer).hostname}`,
          publicKeyJwk: publicJWK
        }
      ],
      authentication: [`${issuer}/.well-known/did.json#${keyId}`],
      assertionMethod: [`${issuer}/.well-known/did.json#${keyId}`],
      service: [
        {
          id: `${issuer}#oidc`,
          type: 'OpenIdConnectIssuer',
          serviceEndpoint: issuer
        }
      ]
    };

    res.json(didDocument);
  } catch (error) {
    logger.error('Failed to get DID Document', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Authorization endpoint
 * GET /auth/authorize
 */
router.get('/auth/authorize', async (req, res) => {
  await oidcService.handleAuthorize(req, res);
});

/**
 * Token endpoint
 * POST /auth/token
 */
router.post('/auth/token', async (req, res) => {
  await oidcService.handleToken(req, res);
});

/**
 * User info endpoint
 * GET /auth/userinfo
 */
router.get('/auth/userinfo', async (req, res) => {
  await oidcService.handleUserInfo(req, res);
});

/**
 * Client registration endpoint
 * POST /auth/register
 */
router.post('/auth/register', async (req, res) => {
  try {
    // 验证请求头中的 Initial Access Token (如果需要)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Initial Access Token required'
      });
    }

    const {
      client_name,
      redirect_uris,
      grant_types = ['authorization_code'],
      response_types = ['code'],
      scope = 'openid profile',
      client_uri,
      logo_uri,
      contacts,
      tos_uri,
      policy_uri,
      software_id,
      software_version
    } = req.body;
    
    // 基本验证
    if (!client_name || !redirect_uris || !Array.isArray(redirect_uris)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters'
      });
    }

    // 验证重定向 URI
    for (const uri of redirect_uris) {
      try {
        new URL(uri);
      } catch (error) {
        return res.status(400).json({
          error: 'invalid_redirect_uri',
          error_description: `Invalid redirect URI: ${uri}`
        });
      }
    }

    // 验证授权类型和响应类型
    const validGrantTypes = ['authorization_code', 'refresh_token', 'client_credentials'] as const;
    const validResponseTypes = ['code', 'token', 'id_token'] as const;

    if (!grant_types.every((type: string) => validGrantTypes.includes(type as typeof validGrantTypes[number]))) {
      return res.status(400).json({
        error: 'invalid_grant_type',
        error_description: 'Unsupported grant type'
      });
    }

    if (!response_types.every((type: string) => validResponseTypes.includes(type as typeof validResponseTypes[number]))) {
      return res.status(400).json({
        error: 'invalid_response_type',
        error_description: 'Unsupported response type'
      });
    }

    // 生成客户端凭据
    const client_id = `client_${cryptoService.generateSecureRandom(16)}`;
    const client_secret = cryptoService.generateSecureRandom(32);
    const client_secret_hash = cryptoService.createHash(client_secret);
    const created_at = new Date();

    // 存储客户端信息
    const clientData: Database['public']['Tables']['oauth_clients']['Insert'] = {
      id: cryptoService.generateSecureRandom(16),
      client_id,
      client_secret_hash,
      name: client_name,
      redirect_uris,
      scopes: scope.split(' '),
      metadata: {
        client_uri,
        logo_uri,
        contacts,
        tos_uri,
        policy_uri,
        software_id,
        software_version,
        grant_types,
        response_types
      },
      created_at: created_at.toISOString(),
      updated_at: created_at.toISOString()
    };

    const { error } = await supabase.from('oauth_clients').insert(clientData);

    if (error) {
      logger.error('Failed to store client registration', { error });
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to register client'
      });
    }

    // 返回客户端凭据
    res.status(201).json({
      client_id,
      client_secret,
      client_secret_expires_at: 0, // 永不过期
      client_id_issued_at: Math.floor(created_at.getTime() / 1000),
      registration_access_token: cryptoService.generateSecureRandom(32),
      registration_client_uri: `${issuer}/auth/register/${client_id}`,
      redirect_uris,
      grant_types,
      response_types,
      scope,
      client_name,
      client_uri,
      logo_uri,
      contacts,
      tos_uri,
      policy_uri,
      software_id,
      software_version
    });

  } catch (error) {
    logger.error('Client registration error', { error });
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error'
    });
  }
});

/**
 * Service documentation endpoint
 * GET /.well-known/service_documentation
 */
router.get('/.well-known/service_documentation', (_req, res) => {
  res.json({
    name: 'CADOP Service',
    description: 'Centralized Agent DID Operation Protocol Service',
    version: '1.0.0',
    documentation: 'https://github.com/rooch-network/nuwa/tree/main/nuwa-services/cadop-service',
    support: {
      email: 'support@rooch.network',
      github: 'https://github.com/rooch-network/nuwa/issues'
    },
    features: [
      'OIDC Identity Provider',
      'Agent DID Creation via CADOP',
      'Web2 Authentication Integration',
      'Sybil Protection',
      'Verifiable Credentials'
    ],
    endpoints: {
      oidc_discovery: '/.well-known/openid-configuration',
      jwks: '/.well-known/jwks.json',
      did_document: '/.well-known/did.json',
      authorization: '/auth/authorize',
      token: '/auth/token',
      userinfo: '/auth/userinfo',
      registration: '/auth/register'
    }
  });
});

/**
 * Privacy policy endpoint
 * GET /.well-known/privacy_policy
 */
router.get('/.well-known/privacy_policy', (_req, res) => {
  res.json({
    title: 'CADOP Service Privacy Policy',
    version: '1.0.0',
    effective_date: '2024-01-01',
    last_updated: '2024-01-01',
    contact: 'privacy@rooch.network',
    policy_url: 'https://rooch.network/privacy',
    summary: {
      data_collection: 'We collect minimal data necessary for identity verification and DID creation',
      data_usage: 'Data is used solely for authentication and DID management purposes',
      data_sharing: 'We do not share personal data with third parties without consent',
      data_retention: 'Data is retained according to legal requirements and user preferences',
      user_rights: 'Users have rights to access, modify, and delete their data'
    }
  });
});

/**
 * Terms of service endpoint
 * GET /.well-known/terms_of_service
 */
router.get('/.well-known/terms_of_service', (_req, res) => {
  res.json({
    title: 'CADOP Service Terms of Service',
    version: '1.0.0',
    effective_date: '2024-01-01',
    last_updated: '2024-01-01',
    contact: 'legal@rooch.network',
    terms_url: 'https://rooch.network/terms',
    summary: {
      service_description: 'CADOP Service provides decentralized identity creation and management',
      user_responsibilities: 'Users are responsible for securing their credentials and using the service lawfully',
      service_availability: 'We strive for high availability but do not guarantee 100% uptime',
      limitation_of_liability: 'Service is provided as-is with limitations on liability',
      termination: 'Either party may terminate the service relationship with appropriate notice'
    }
  });
});

export const oidcRouter: Router = router; 