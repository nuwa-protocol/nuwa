// OIDC and OAuth 2.0 Type Definitions

export interface AuthorizeRequest {
  response_type: 'code' | 'token' | 'id_token' | string;
  client_id: string;
  redirect_uri: string;
  scope?: string | undefined;
  state?: string | undefined;
  nonce?: string | undefined;
  response_mode?: 'query' | 'fragment' | 'form_post' | undefined;
  display?: 'page' | 'popup' | 'touch' | 'wap' | undefined;
  prompt?: 'none' | 'login' | 'consent' | 'select_account' | undefined;
  max_age?: number | undefined;
  ui_locales?: string | undefined;
  id_token_hint?: string | undefined;
  login_hint?: string | undefined;
  acr_values?: string | undefined;
}

export interface AuthorizeResponse {
  code?: string | undefined;
  access_token?: string | undefined;
  token_type?: string | undefined;
  expires_in?: number | undefined;
  id_token?: string | undefined;
  state?: string | undefined;
  scope?: string | undefined;
  error?: string | undefined;
  error_description?: string | undefined;
  error_uri?: string | undefined;
}

export interface TokenRequest {
  grant_type: 'authorization_code' | 'refresh_token' | 'client_credentials';
  code?: string | undefined;
  redirect_uri?: string | undefined;
  client_id: string;
  client_secret?: string | undefined;
  refresh_token?: string | undefined;
  scope?: string | undefined;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number | undefined;
  refresh_token?: string | undefined;
  scope?: string | undefined;
  id_token?: string | undefined;
  error?: string | undefined;
  error_description?: string | undefined;
  error_uri?: string | undefined;
}

export interface UserInfoResponse {
  sub: string;
  name?: string | undefined;
  given_name?: string | undefined;
  family_name?: string | undefined;
  middle_name?: string | undefined;
  nickname?: string | undefined;
  preferred_username?: string | undefined;
  profile?: string | undefined;
  picture?: string | undefined;
  website?: string | undefined;
  email?: string | undefined;
  email_verified?: boolean | undefined;
  gender?: string | undefined;
  birthdate?: string | undefined;
  zoneinfo?: string | undefined;
  locale?: string | undefined;
  phone_number?: string | undefined;
  phone_number_verified?: boolean | undefined;
  address?: Address | undefined;
  updated_at?: number | undefined;
  // DID 相关扩展字段
  did?: string | undefined;
  agent_did?: string | undefined;
  sybil_level?: number | undefined;
  auth_methods?: string[] | undefined;
}

export interface Address {
  formatted?: string | undefined;
  street_address?: string | undefined;
  locality?: string | undefined;
  region?: string | undefined;
  postal_code?: string | undefined;
  country?: string | undefined;
}

export interface JWK {
  kty: string;
  use?: string | undefined;
  key_ops?: string[] | undefined;
  alg?: string | undefined;
  kid?: string | undefined;
  x5u?: string | undefined;
  x5c?: string[] | undefined;
  x5t?: string | undefined;
  'x5t#S256'?: string | undefined;
  // RSA specific
  n?: string | undefined;
  e?: string | undefined;
  d?: string | undefined;
  p?: string | undefined;
  q?: string | undefined;
  dp?: string | undefined;
  dq?: string | undefined;
  qi?: string | undefined;
  // EC specific
  crv?: string | undefined;
  x?: string | undefined;
  y?: string | undefined;
  // OKP specific
  k?: string | undefined;
}

export interface JWKS {
  keys: JWK[];
}

export interface OIDCConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  registration_endpoint?: string | undefined;
  scopes_supported: string[];
  response_types_supported: string[];
  response_modes_supported?: string[] | undefined;
  grant_types_supported: string[];
  acr_values_supported?: string[] | undefined;
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  id_token_encryption_alg_values_supported?: string[] | undefined;
  id_token_encryption_enc_values_supported?: string[] | undefined;
  userinfo_signing_alg_values_supported?: string[] | undefined;
  userinfo_encryption_alg_values_supported?: string[] | undefined;
  userinfo_encryption_enc_values_supported?: string[] | undefined;
  request_object_signing_alg_values_supported?: string[] | undefined;
  request_object_encryption_alg_values_supported?: string[] | undefined;
  request_object_encryption_enc_values_supported?: string[] | undefined;
  token_endpoint_auth_methods_supported?: string[] | undefined;
  token_endpoint_auth_signing_alg_values_supported?: string[] | undefined;
  display_values_supported?: string[] | undefined;
  claim_types_supported?: string[] | undefined;
  claims_supported?: string[] | undefined;
  service_documentation?: string | undefined;
  claims_locales_supported?: string[] | undefined;
  ui_locales_supported?: string[] | undefined;
  claims_parameter_supported?: boolean | undefined;
  request_parameter_supported?: boolean | undefined;
  request_uri_parameter_supported?: boolean | undefined;
  require_request_uri_registration?: boolean | undefined;
  op_policy_uri?: string | undefined;
  op_tos_uri?: string | undefined;
}

export interface OAuthClient {
  id: string;
  client_id: string;
  client_secret_hash?: string | undefined;
  name: string;
  redirect_uris: string[];
  scopes: string[];
  grant_types: string[];
  response_types: string[];
  metadata?: Record<string, any> | undefined;
  created_at: Date;
  updated_at: Date;
}

export interface AuthorizationCode {
  id: string;
  code: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scope: string;
  expires_at: Date;
  used: boolean;
  nonce?: string | undefined;
  state?: string | undefined;
  created_at: Date;
}

export interface AccessToken {
  id: string;
  token: string;
  user_id: string;
  client_id: string;
  scope: string;
  expires_at: Date;
  created_at: Date;
}

export interface RefreshToken {
  id: string;
  token: string;
  user_id: string;
  client_id: string;
  scope: string;
  expires_at: Date;
  created_at: Date;
}

export interface IDToken {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  auth_time?: number | undefined;
  nonce?: string | undefined;
  acr?: string | undefined;
  amr?: string[] | undefined;
  azp?: string | undefined;
  // DID 相关 claims
  did?: string | undefined;
  agent_did?: string | undefined;
  sybil_level?: number | undefined;
  auth_methods?: string[] | undefined;
}

export interface SessionData {
  user_id: string;
  client_id: string;
  scope: string;
  auth_time: number;
  auth_methods: string[];
  user_did?: string | undefined;
  agent_did?: string | undefined;
  sybil_level?: number | undefined;
  nonce?: string | undefined;
  state?: string | undefined;
} 