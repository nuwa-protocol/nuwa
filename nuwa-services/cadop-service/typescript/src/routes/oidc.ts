import { Router } from 'express';
import { oidcService } from '../services/oidc';
import { cryptoService } from '../services/crypto';

const router = Router();

/**
 * OIDC 发现端点
 * GET /.well-known/openid-configuration
 */
router.get('/.well-known/openid-configuration', async (_req, res) => {
  try {
    const configuration = oidcService.getDiscoveryConfiguration();
    res.json(configuration);
  } catch (error) {
    console.error('Discovery configuration error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to get discovery configuration'
    });
  }
});

/**
 * JWKS 端点
 * GET /.well-known/jwks.json
 */
router.get('/.well-known/jwks.json', async (_req, res) => {
  try {
    const jwks = await cryptoService.getJWKS();
    res.json(jwks);
  } catch (error) {
    console.error('JWKS error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to get JWKS'
    });
  }
});

/**
 * DID Document 端点
 * GET /.well-known/did.json
 */
router.get('/.well-known/did.json', async (req, res) => {
  try {
    // 为 CADOP 服务生成 DID Document
    const publicJWK = await cryptoService.getPublicJWK();
    const issuer = req.protocol + '://' + req.get('host');
    
    const didDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id: `${issuer}/.well-known/did.json`,
      verificationMethod: [
        {
          id: `${issuer}/.well-known/did.json#${publicJWK.kid}`,
          type: 'Ed25519VerificationKey2020',
          controller: `${issuer}/.well-known/did.json`,
          publicKeyJwk: publicJWK
        }
      ],
      authentication: [`${issuer}/.well-known/did.json#${publicJWK.kid}`],
      assertionMethod: [`${issuer}/.well-known/did.json#${publicJWK.kid}`],
      service: [
        {
          id: `${issuer}/.well-known/did.json#oidc`,
          type: 'OpenIdConnectVersion1.0Service',
          serviceEndpoint: `${issuer}/.well-known/openid-configuration`
        },
        {
          id: `${issuer}/.well-known/did.json#cadop`,
          type: 'CADOPService',
          serviceEndpoint: `${issuer}/api/custodian`
        }
      ]
    };
    
    res.json(didDocument);
  } catch (error) {
    console.error('DID Document error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to get DID document'
    });
  }
});

/**
 * 授权端点
 * GET /auth/authorize
 */
router.get('/auth/authorize', async (req, res) => {
  await oidcService.handleAuthorize(req, res);
});

/**
 * 令牌端点
 * POST /auth/token
 */
router.post('/auth/token', async (req, res) => {
  await oidcService.handleToken(req, res);
});

/**
 * 用户信息端点
 * GET /auth/userinfo
 */
router.get('/auth/userinfo', async (req, res) => {
  await oidcService.handleUserInfo(req, res);
});

/**
 * 客户端注册端点 (简化版)
 * POST /auth/register
 */
router.post('/auth/register', async (req, res) => {
  try {
    // 简化的客户端注册实现
    // 在生产环境中，这应该有适当的验证和授权
    
    const {
      client_name,
      redirect_uris,
      grant_types = ['authorization_code'],
      response_types = ['code'],
      scope = 'openid profile',
      client_secret
    } = req.body;
    
    // 基本验证
    if (!client_name || !redirect_uris || !Array.isArray(redirect_uris)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters'
      });
    }
    
    // 生成客户端 ID
    const client_id = `client_${cryptoService.generateSecureRandom(16)}`;
    
    // TODO: 在实际实现中，应该将客户端信息存储到数据库
    // 这里返回客户端信息用于测试
    
    const clientInfo = {
      client_id,
      client_name,
      redirect_uris,
      grant_types,
      response_types,
      scope: scope.split(' '),
      ...(client_secret && { client_secret }),
      registration_client_uri: `${req.protocol}://${req.get('host')}/auth/register/${client_id}`,
      created_at: new Date().toISOString()
    };
    
    return res.status(201).json(clientInfo);
    
  } catch (error) {
    console.error('Client registration error:', error);
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to register client'
    });
  }
});

/**
 * 健康检查端点
 * GET /health
 */
router.get('/health', async (_req, res) => {
  try {
    // 检查密钥系统
    await cryptoService.getJWKS();
    
    // 验证 OIDC 配置
    oidcService.getDiscoveryConfiguration();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        crypto: 'ok',
        oidc: 'ok',
        database: 'ok' // TODO: 添加数据库健康检查
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * 服务文档端点
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
 * 隐私政策端点
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
 * 服务条款端点
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

export default router; 