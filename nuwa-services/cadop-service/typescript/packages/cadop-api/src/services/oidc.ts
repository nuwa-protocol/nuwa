import { Request, Response } from 'express';
import { config } from '../config/environment.js';
import { supabase } from '../config/supabase.js';
import { cryptoService } from './crypto.js';
import type { 
  IDToken, 
  AuthorizeRequest, 
  AuthorizeResponse, 
  TokenRequest, 
  TokenResponse, 
  UserInfoResponse,
  SessionData,
  OIDCConfiguration,
  OAuthClient
} from '../types/oidc.js';
import { logger } from '../utils/logger.js';
import { DatabaseService } from './database.js';
import jwt from 'jsonwebtoken';
const { verify } = jwt;

// 扩展 Express Request 类型以支持 session
declare module 'express' {
  interface Request {
    session?: {
      oidc?: {
        state?: string;
        nonce?: string;
      };
      sessionId?: string;
    };
    cookies?: {
      session_id?: string;
    };
  }
}

export class OIDCService {
  private static instance: OIDCService;

  private constructor() {}

  public static getInstance(): OIDCService {
    if (!OIDCService.instance) {
      OIDCService.instance = new OIDCService();
    }
    return OIDCService.instance;
  }

  /**
   * 获取 OIDC 发现配置
   */
  public getDiscoveryConfiguration(): OIDCConfiguration {
    const baseUrl = config.oidc.issuer;
    
    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/auth/authorize`,
      token_endpoint: `${baseUrl}/auth/token`,
      userinfo_endpoint: `${baseUrl}/auth/userinfo`,
      jwks_uri: `${baseUrl}/.well-known/jwks.json`,
      registration_endpoint: `${baseUrl}/auth/register`,
      
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
      
      service_documentation: `${baseUrl}/.well-known/service_documentation`,
      op_policy_uri: `${baseUrl}/.well-known/privacy_policy`,
      op_tos_uri: `${baseUrl}/.well-known/terms_of_service`
    };
  }

  /**
   * 处理授权请求
   */
  public async handleAuthorize(req: Request, res: Response): Promise<void> {
    try {
      const authRequest = this.parseAuthorizeRequest(req);
      
      // 验证客户端
      const client = await this.validateClient(authRequest.client_id);
      if (!client) {
        this.sendErrorResponse(res, 'invalid_client', 'Invalid client_id', authRequest.state);
        return;
      }
      
      // 验证重定向 URI
      if (!this.validateRedirectUri(authRequest.redirect_uri, client)) {
        this.sendErrorResponse(res, 'invalid_request', 'Invalid redirect_uri', authRequest.state);
        return;
      }
      
      // 验证 response_type
      if (!this.validateResponseType(authRequest.response_type, client)) {
        this.sendErrorResponse(res, 'unsupported_response_type', 'Unsupported response_type', authRequest.state, authRequest.redirect_uri);
        return;
      }
      
      // 检查用户是否已登录
      const session = await this.getCurrentSession(req);
      if (!session) {
        // 重定向到登录页面
        const loginUrl = this.buildLoginUrl(authRequest);
        res.redirect(loginUrl);
        return;
      }
      
      // 检查是否需要用户同意
      const needsConsent = await this.checkConsentRequired(session.user_id, authRequest.client_id, authRequest.scope);
      if (needsConsent && authRequest.prompt !== 'none') {
        // 重定向到同意页面
        const consentUrl = this.buildConsentUrl(authRequest, session);
        res.redirect(consentUrl);
        return;
      }
      
      if (authRequest.prompt === 'none' && needsConsent) {
        this.sendErrorResponse(res, 'interaction_required', 'User interaction required', authRequest.state, authRequest.redirect_uri);
        return;
      }
      
      // 生成授权响应
      const response = await this.generateAuthorizeResponse(authRequest, session);
      
      // 根据 response_mode 返回结果
      this.sendAuthorizeResponse(res, response, authRequest);
      
    } catch (error) {
      console.error('Authorization error:', error);
      res.status(500).json({ 
        error: 'server_error', 
        error_description: 'Internal server error' 
      });
    }
  }

  /**
   * 处理令牌请求
   */
  public async handleToken(req: Request, res: Response): Promise<void> {
    try {
      const tokenRequest = this.parseTokenRequest(req);
      
      // 验证客户端
      const client = await this.validateClientCredentials(tokenRequest);
      if (!client) {
        res.status(401).json({
          error: 'invalid_client',
          error_description: 'Client authentication failed'
        });
        return;
      }
      
      let tokenResponse: TokenResponse;
      
      switch (tokenRequest.grant_type) {
        case 'authorization_code':
          tokenResponse = await this.handleAuthorizationCodeGrant(tokenRequest, client);
          break;
          
        case 'refresh_token':
          tokenResponse = await this.handleRefreshTokenGrant(tokenRequest, client);
          break;
          
        case 'client_credentials':
          tokenResponse = await this.handleClientCredentialsGrant(tokenRequest, client);
          break;
          
        default:
          res.status(400).json({
            error: 'unsupported_grant_type',
            error_description: 'Grant type not supported'
          });
          return;
      }
      
      res.json(tokenResponse);
      
    } catch (error) {
      console.error('Token error:', error);
      
      if (error instanceof Error) {
        const errorResponse = this.parseTokenError(error);
        res.status(400).json(errorResponse);
      } else {
        res.status(500).json({
          error: 'server_error',
          error_description: 'Internal server error'
        });
      }
    }
  }

  /**
   * 处理用户信息请求
   */
  public async handleUserInfo(req: Request, res: Response): Promise<void> {
    try {
      // 从 Authorization header 获取访问令牌
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('UserInfo request without access token');
        res.status(401).json({
          error: 'invalid_token',
          error_description: 'Access token required'
        });
        return;
      }
      
      const accessToken = authHeader.substring(7);
      
      // 验证访问令牌
      const tokenData = await this.validateAccessToken(accessToken);
      if (!tokenData) {
        logger.warn('Invalid access token in UserInfo request', { accessToken });
        res.status(401).json({
          error: 'invalid_token',
          error_description: 'Invalid or expired access token'
        });
        return;
      }
      
      // 获取用户信息
      try {
        const userInfo = await this.getUserInfo(tokenData.user_id, tokenData.scope);
        logger.debug('UserInfo request successful', { 
          user_id: tokenData.user_id,
          scope: tokenData.scope
        });
        res.json(userInfo);
      } catch (error) {
        logger.error('Failed to get user info', { 
          error,
          user_id: tokenData.user_id,
          scope: tokenData.scope
        });
        res.status(500).json({
          error: 'server_error',
          error_description: 'Failed to retrieve user information'
        });
      }
      
    } catch (error) {
      logger.error('UserInfo request error', { error });
      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error'
      });
    }
  }

  /**
   * 解析授权请求
   */
  private parseAuthorizeRequest(req: Request): AuthorizeRequest {
    const query = req.query;
    
    return {
      response_type: query['response_type'] as string,
      client_id: query['client_id'] as string,
      redirect_uri: query['redirect_uri'] as string,
      scope: query['scope'] as string | undefined,
      state: query['state'] as string | undefined,
      nonce: query['nonce'] as string | undefined,
      response_mode: query['response_mode'] as 'query' | 'fragment' | 'form_post' | undefined,
      display: query['display'] as 'page' | 'popup' | 'touch' | 'wap' | undefined,
      prompt: query['prompt'] as 'none' | 'login' | 'consent' | 'select_account' | undefined,
      max_age: query['max_age'] ? parseInt(query['max_age'] as string) : undefined,
      ui_locales: query['ui_locales'] as string | undefined,
      id_token_hint: query['id_token_hint'] as string | undefined,
      login_hint: query['login_hint'] as string | undefined,
      acr_values: query['acr_values'] as string | undefined
    };
  }

  /**
   * 解析令牌请求
   */
  private parseTokenRequest(req: Request): TokenRequest {
    const body = req.body;
    
    return {
      grant_type: body.grant_type,
      code: body.code,
      redirect_uri: body.redirect_uri,
      client_id: body.client_id,
      client_secret: body.client_secret,
      refresh_token: body.refresh_token,
      scope: body.scope
    };
  }

  /**
   * 验证客户端
   */
  private async validateClient(clientId: string): Promise<OAuthClient | null> {
    try {
      // For demo purposes, support hardcoded test clients
      if (clientId.startsWith('client_')) {
        return {
          id: clientId,
          client_id: clientId,
          client_secret_hash: undefined, // No secret required for demo
          name: 'CADOP Test Client',
          redirect_uris: ['http://localhost:3001/callback', 'http://localhost:3000/callback'],
          scopes: ['openid', 'profile', 'email', 'did', 'agent_did', 'sybil_level'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code', 'id_token', 'code id_token'],
          metadata: {},
          created_at: new Date(),
          updated_at: new Date()
        };
      }
      
      // Try to get from database for production clients
      const { data, error } = await supabase
        .from('oauth_clients')
        .select('*')
        .eq('client_id', clientId)
        .single();
        
      if (error || !data) {
        return null;
      }
      
      return {
        id: data.id,
        client_id: data.client_id,
        client_secret_hash: data.client_secret_hash,
        name: data.name,
        redirect_uris: data.redirect_uris,
        scopes: data.scopes,
        grant_types: data.grant_types || ['authorization_code'],
        response_types: data.response_types || ['code'],
        metadata: data.metadata || {},
        created_at: new Date(data.created_at),
        updated_at: new Date(data.updated_at)
      };
    } catch (error) {
      console.error('Client validation error:', error);
      return null;
    }
  }

  /**
   * 验证客户端凭据
   */
  private async validateClientCredentials(tokenRequest: TokenRequest): Promise<OAuthClient | null> {
    const client = await this.validateClient(tokenRequest.client_id);
    if (!client) {
      return null;
    }
    
    // 如果客户端有密钥，验证密钥
    if (client.client_secret_hash) {
      if (!tokenRequest.client_secret) {
        return null;
      }
      
      const isValid = cryptoService.verifyHash(tokenRequest.client_secret, client.client_secret_hash);
      if (!isValid) {
        return null;
      }
    }
    
    return client;
  }

  /**
   * 验证重定向 URI
   */
  private validateRedirectUri(redirectUri: string, client: OAuthClient): boolean {
    return client.redirect_uris.includes(redirectUri);
  }

  /**
   * 验证响应类型
   */
  private validateResponseType(responseType: string, client: OAuthClient): boolean {
    return client.response_types.includes(responseType);
  }

  /**
   * 获取当前会话
   */
  private async getCurrentSession(req: Request): Promise<SessionData | null> {
    try {
      // 从 session 或 cookie 中获取会话信息
      const sessionId = req.session?.sessionId || req.cookies?.session_id;
      if (!sessionId) {
        return null;
      }
      
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('session_token_hash', cryptoService.createHash(sessionId))
        .single();
        
      if (error || !data) {
        return null;
      }
      
      return data.session_data as SessionData;
    } catch (error) {
      console.error('Session retrieval error:', error);
      return null;
    }
  }

  /**
   * 检查是否需要用户同意
   */
  private async checkConsentRequired(_userId: string, _clientId: string, _scope?: string): Promise<boolean> {
    // 如果是受信任的第一方客户端，可能不需要同意
    // 这里简化处理，假设总是需要同意
    return true;
  }

  /**
   * 构建登录URL
   */
  private buildLoginUrl(authRequest: AuthorizeRequest): string {
    const params = new URLSearchParams({
      response_type: authRequest.response_type,
      client_id: authRequest.client_id,
      redirect_uri: authRequest.redirect_uri,
      scope: authRequest.scope || 'openid',
      state: authRequest.state || '',
      ...(authRequest.nonce && { nonce: authRequest.nonce })
    });
    
    return `/auth/login?${params.toString()}`;
  }

  /**
   * 构建同意 URL
   */
  private buildConsentUrl(authRequest: AuthorizeRequest, _session: SessionData): string {
    const params = new URLSearchParams({
      client_id: authRequest.client_id,
      scope: authRequest.scope || 'openid',
      return_to: `/auth/authorize?${new URLSearchParams(authRequest as any).toString()}`
    });
    
    return `/consent?${params.toString()}`;
  }

  /**
   * 生成授权响应
   */
  private async generateAuthorizeResponse(authRequest: AuthorizeRequest, session: SessionData): Promise<AuthorizeResponse> {
    const response: AuthorizeResponse = {};
    
    // 只有当 state 存在时才设置
    if (authRequest.state) {
      response.state = authRequest.state;
    }
    
    const responseTypes = authRequest.response_type.split(' ');
    
    if (responseTypes.includes('code')) {
      // 生成授权码
      const code = cryptoService.generateAuthorizationCode();
      
      // 存储授权码
      await this.storeAuthorizationCode({
        id: cryptoService.generateSecureRandom(16),
        code,
        client_id: authRequest.client_id,
        user_id: session.user_id,
        redirect_uri: authRequest.redirect_uri,
        scope: authRequest.scope || 'openid',
        expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 分钟
        used: false,
        nonce: authRequest.nonce,
        state: authRequest.state,
        created_at: new Date()
      });
      
      response.code = code;
    }
    
    if (responseTypes.includes('token')) {
      // 生成访问令牌
      const accessToken = cryptoService.generateAccessToken();
      
      // 存储访问令牌
      await this.storeAccessToken({
        id: cryptoService.generateSecureRandom(16),
        token: accessToken,
        user_id: session.user_id,
        client_id: authRequest.client_id,
        scope: authRequest.scope || 'openid',
        expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 小时
        created_at: new Date()
      });
      
      response.access_token = accessToken;
      response.token_type = 'Bearer';
      response.expires_in = 3600;
    }
    
    if (responseTypes.includes('id_token')) {
      // 生成 ID Token
      const idToken = await this.generateIDToken(session, authRequest);
      response.id_token = idToken;
    }
    
    if (authRequest.scope) {
      response.scope = authRequest.scope;
    }
    
    return response;
  }

  /**
   * 生成 ID Token
   */
  private async generateIDToken(session: SessionData, authRequest: AuthorizeRequest): Promise<string> {
    const claims: IDToken = {
      iss: config.oidc.issuer,
      sub: session.user_id,
      aud: authRequest.client_id,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      auth_time: session.auth_time,
      nonce: authRequest.nonce,
      did: session.user_did,
      agent_did: session.agent_did,
      sybil_level: session.sybil_level,
      auth_methods: session.auth_methods.map((method: string) => ({
        provider: method,
        verified_at: Math.floor(Date.now() / 1000),
        sybil_contribution: 1
      }))
    };

    return await cryptoService.signIDToken(claims);
  }

  /**
   * 发送授权响应
   */
  private sendAuthorizeResponse(res: Response, response: AuthorizeResponse, authRequest: AuthorizeRequest): void {
    const responseMode = authRequest.response_mode || 'query';
    const redirectUri = authRequest.redirect_uri;
    
    const params = new URLSearchParams();
    Object.entries(response).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });
    
    let finalRedirectUri: string;
    
    switch (responseMode) {
      case 'fragment':
        finalRedirectUri = `${redirectUri}#${params.toString()}`;
        break;
      case 'form_post':
        // 返回自动提交的表单
        res.send(this.generateFormPostResponse(redirectUri, response));
        return;
      case 'query':
      default:
        finalRedirectUri = `${redirectUri}?${params.toString()}`;
        break;
    }
    
    res.redirect(finalRedirectUri);
  }

  /**
   * 生成表单提交响应
   */
  private generateFormPostResponse(redirectUri: string, response: AuthorizeResponse): string {
    const inputs = Object.entries(response)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}">`)
      .join('\n');
      
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Redirecting...</title>
      </head>
      <body onload="document.forms[0].submit()">
        <form method="post" action="${redirectUri}">
          ${inputs}
        </form>
        <p>If you are not redirected automatically, <a href="#" onclick="document.forms[0].submit()">click here</a>.</p>
      </body>
      </html>
    `;
  }

  /**
   * 发送错误响应
   */
  private sendErrorResponse(res: Response, error: string, description: string, state?: string, redirectUri?: string): void {
    const errorResponse: Record<string, string> = {
      error,
      error_description: description
    };
    
    if (state) {
      errorResponse['state'] = state;
    }
    
    if (redirectUri) {
      const params = new URLSearchParams();
      Object.entries(errorResponse).forEach(([key, value]) => {
        params.append(key, value);
      });
      
      res.redirect(`${redirectUri}?${params.toString()}`);
    } else {
      res.status(400).json(errorResponse);
    }
  }

  /**
   * 处理授权码授权
   */
  private async handleAuthorizationCodeGrant(tokenRequest: TokenRequest, client: OAuthClient): Promise<TokenResponse> {
    if (!tokenRequest.code || !tokenRequest.redirect_uri) {
      throw new Error('invalid_request');
    }
    
    // 验证和获取授权码
    const authCode = await this.validateAndConsumeAuthorizationCode(tokenRequest.code, client.client_id, tokenRequest.redirect_uri);
    if (!authCode) {
      throw new Error('invalid_grant');
    }
    
    // 生成访问令牌
    const accessToken = cryptoService.generateAccessToken();
    const refreshToken = cryptoService.generateRefreshToken();
    
    // 存储令牌
    await Promise.all([
      this.storeAccessToken({
        id: cryptoService.generateSecureRandom(16),
        token: accessToken,
        user_id: authCode.user_id,
        client_id: client.client_id,
        scope: authCode.scope,
        expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 小时
        created_at: new Date()
      }),
      this.storeRefreshToken({
        id: cryptoService.generateSecureRandom(16),
        token: refreshToken,
        user_id: authCode.user_id,
        client_id: client.client_id,
        scope: authCode.scope,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 天
        created_at: new Date()
      })
    ]);
    
    const response: TokenResponse = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: authCode.scope
    };
    
    // 如果原始请求包含 openid scope，生成 ID Token
    if (authCode.scope.includes('openid')) {
      const sessionData: SessionData = {
        user_id: authCode.user_id,
        client_id: client.client_id,
        scope: authCode.scope,
        auth_time: Math.floor(authCode.created_at.getTime() / 1000),
        auth_methods: []
      };
      
      const authRequest: Partial<AuthorizeRequest> = {
        client_id: client.client_id,
        nonce: authCode.nonce || undefined
      };
      
      response.id_token = await this.generateIDToken(sessionData, authRequest as AuthorizeRequest);
    }
    
    return response;
  }

  /**
   * 处理刷新令牌授权
   */
  private async handleRefreshTokenGrant(tokenRequest: TokenRequest, client: OAuthClient): Promise<TokenResponse> {
    if (!tokenRequest.refresh_token) {
      throw new Error('invalid_request');
    }
    
    // 验证刷新令牌
    const refreshTokenData = await this.validateRefreshToken(tokenRequest.refresh_token, client.client_id);
    if (!refreshTokenData) {
      throw new Error('invalid_grant');
    }
    
    // 生成新的访问令牌
    const accessToken = cryptoService.generateAccessToken();
    
    await this.storeAccessToken({
      id: cryptoService.generateSecureRandom(16),
      token: accessToken,
      user_id: refreshTokenData.user_id,
      client_id: client.client_id,
      scope: refreshTokenData.scope,
      expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 小时
      created_at: new Date()
    });
    
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: refreshTokenData.scope
    };
  }

  /**
   * 处理客户端凭据授权
   */
  private async handleClientCredentialsGrant(tokenRequest: TokenRequest, client: OAuthClient): Promise<TokenResponse> {
    // 客户端凭据流程，不涉及用户
    const accessToken = cryptoService.generateAccessToken();
    
    await this.storeAccessToken({
      id: cryptoService.generateSecureRandom(16),
      token: accessToken,
      user_id: '', // 客户端凭据没有用户
      client_id: client.client_id,
      scope: tokenRequest.scope || 'api',
      expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 小时
      created_at: new Date()
    });
    
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: tokenRequest.scope || 'api'
    };
  }

  /**
   * 验证访问令牌
   */
  private async validateAccessToken(token: string): Promise<{ user_id: string; scope: string } | null> {
    try {
      // 首先检查令牌格式
      if (!token || typeof token !== 'string' || token.length < 32) {
        logger.warn('Invalid access token format');
        return null;
      }

      // 从数据库获取令牌信息
      const { data, error } = await supabase
        .from('access_tokens')
        .select('user_id, scope, expires_at, client_id')
        .eq('token_hash', cryptoService.createHash(token))
        .single();
        
      if (error) {
        logger.warn('Failed to retrieve access token from database', { error });
        return null;
      }

      if (!data) {
        logger.warn('Access token not found in database');
        return null;
      }
      
      // 检查是否过期
      const expiresAt = new Date(data.expires_at);
      const now = new Date();
      
      if (expiresAt < now) {
        logger.warn('Access token has expired', {
          token_hash: cryptoService.createHash(token),
          expires_at: expiresAt,
          now
        });
        return null;
      }

      // 检查令牌是否被撤销
      const { data: revoked } = await supabase
        .from('revoked_tokens')
        .select('id')
        .eq('token_hash', cryptoService.createHash(token))
        .single();

      if (revoked) {
        logger.warn('Access token has been revoked', {
          token_hash: cryptoService.createHash(token)
        });
        return null;
      }
      
      logger.debug('Access token validated successfully', {
        user_id: data.user_id,
        client_id: data.client_id,
        scope: data.scope,
        expires_at: expiresAt
      });

      return {
        user_id: data.user_id,
        scope: data.scope
      };
    } catch (error) {
      logger.error('Access token validation error', { error });
      return null;
    }
  }

  /**
   * 获取用户信息
   */
  private async getUserInfo(userId: string, scope: string): Promise<UserInfoResponse> {
    const user = await DatabaseService.getUserCompleteProfile(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const authMethods = await DatabaseService.getUserAuthMethods(userId);

    const response: UserInfoResponse = {
      sub: user.id,
      name: user.display_name,
      email: user.email,
      email_verified: false, // 从数据库中获取或设置默认值
      did: user.user_did,
      agent_did: user.primary_agent_did,
      sybil_level: user.metadata?.sybil_level || 0,
      auth_methods: authMethods.map(method => ({
        provider: method.provider,
        verified_at: method.verified_at ? Math.floor(new Date(method.verified_at).getTime() / 1000) : undefined,
        sybil_contribution: method.sybil_contribution
      }))
    };

    return response;
  }

  /**
   * 存储授权码
   */
  private async storeAuthorizationCode(authCode: any): Promise<void> {
    const { error } = await supabase
      .from('authorization_codes')
      .insert({
        id: authCode.id,
        code: authCode.code,
        client_id: authCode.client_id,
        user_id: authCode.user_id,
        redirect_uri: authCode.redirect_uri,
        scope: authCode.scope,
        expires_at: authCode.expires_at.toISOString(),
        used: authCode.used,
        nonce: authCode.nonce,
        state: authCode.state,
        created_at: authCode.created_at.toISOString()
      });
      
    if (error) {
      throw new Error(`Failed to store authorization code: ${error.message}`);
    }
  }

  /**
   * 存储访问令牌
   */
  private async storeAccessToken(token: any): Promise<void> {
    const { error } = await supabase
      .from('access_tokens')
      .insert({
        id: token.id,
        token: token.token,
        user_id: token.user_id,
        client_id: token.client_id,
        scope: token.scope,
        expires_at: token.expires_at.toISOString(),
        created_at: token.created_at.toISOString()
      });
      
    if (error) {
      throw new Error(`Failed to store access token: ${error.message}`);
    }
  }

  /**
   * 存储刷新令牌
   */
  private async storeRefreshToken(token: any): Promise<void> {
    const { error } = await supabase
      .from('refresh_tokens')
      .insert({
        id: token.id,
        token: token.token,
        user_id: token.user_id,
        client_id: token.client_id,
        scope: token.scope,
        expires_at: token.expires_at.toISOString(),
        created_at: token.created_at.toISOString()
      });
      
    if (error) {
      throw new Error(`Failed to store refresh token: ${error.message}`);
    }
  }

  /**
   * 验证并消费授权码
   */
  private async validateAndConsumeAuthorizationCode(code: string, clientId: string, redirectUri: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('authorization_codes')
        .select('*')
        .eq('code', code)
        .eq('client_id', clientId)
        .eq('redirect_uri', redirectUri)
        .eq('used', false)
        .single();
        
      if (error || !data) {
        return null;
      }
      
      // 检查是否过期
      if (new Date(data.expires_at) < new Date()) {
        return null;
      }
      
      // 标记为已使用
      await supabase
        .from('authorization_codes')
        .update({ used: true })
        .eq('id', data.id);
        
      return {
        ...data,
        expires_at: new Date(data.expires_at),
        created_at: new Date(data.created_at)
      };
    } catch (error) {
      console.error('Authorization code validation error:', error);
      return null;
    }
  }

  /**
   * 验证刷新令牌
   */
  private async validateRefreshToken(token: string, clientId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('refresh_tokens')
        .select('*')
        .eq('token', token)
        .eq('client_id', clientId)
        .single();
        
      if (error || !data) {
        return null;
      }
      
      // 检查是否过期
      if (new Date(data.expires_at) < new Date()) {
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Refresh token validation error:', error);
      return null;
    }
  }

  /**
   * 解析令牌错误
   */
  private parseTokenError(error: Error): any {
    const message = error.message.toLowerCase();
    
    if (message.includes('invalid_request')) {
      return { error: 'invalid_request', error_description: 'Invalid request' };
    }
    if (message.includes('invalid_client')) {
      return { error: 'invalid_client', error_description: 'Invalid client' };
    }
    if (message.includes('invalid_grant')) {
      return { error: 'invalid_grant', error_description: 'Invalid grant' };
    }
    if (message.includes('unauthorized_client')) {
      return { error: 'unauthorized_client', error_description: 'Unauthorized client' };
    }
    if (message.includes('unsupported_grant_type')) {
      return { error: 'unsupported_grant_type', error_description: 'Unsupported grant type' };
    }
    
    return { error: 'server_error', error_description: 'Internal server error' };
  }

  public async verifyIdToken(token: string): Promise<IDToken | null> {
    try {
      if (!token) {
        return null;
      }

      const decoded = this.decodeIdToken(token);
      if (!decoded) {
        return null;
      }

      // 验证必需的字段
      if (!decoded.sub || !decoded.aud) {
        return null;
      }

      // 验证过期时间
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < now) {
        return null;
      }

      // 验证签名
      const isValid = await cryptoService.verifyIDToken(token);
      if (!isValid) {
        return null;
      }

      return decoded;
    } catch (error) {
      logger.error('Failed to verify ID token', { error });
      return null;
    }
  }

  public async createIdToken(payload: Partial<IDToken>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const claims: IDToken = {
      iss: config.oidc.issuer,
      sub: payload.sub || 'test-user',
      aud: payload.aud || 'default-client',
      exp: now + 3600,
      iat: now,
      ...payload
    };

    return cryptoService.signIDToken(claims);
  }

  public decodeIdToken(token: string): IDToken | null {
    try {
      if (!token) {
        return null;
      }

      const decoded = cryptoService.decodeIDToken(token);
      return decoded as IDToken;
    } catch (error) {
      logger.error('Failed to decode ID token', { error });
      return null;
    }
  }
}

// 导出单例实例
export const oidcService = OIDCService.getInstance();

export async function validateIdToken(token: string): Promise<IDToken | null> {
  try {
    return await oidcService.verifyIdToken(token);
  } catch (error) {
    return null;
  }
}

export async function createIdToken(payload: Partial<IDToken>): Promise<string> {
  return await oidcService.createIdToken(payload);
}

export function decodeIdToken(token: string): IDToken | null {
  try {
    return jwt.decode(token) as IDToken;
  } catch (error) {
    return null;
  }
}

export async function verifyIdToken(token: string): Promise<IDToken | null> {
  return await oidcService.verifyIdToken(token);
} 