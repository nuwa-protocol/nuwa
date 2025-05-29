import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema with development defaults
const envSchema = z.object({
  // Server
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Supabase (with development defaults)
  SUPABASE_URL: z.string().url().default('https://placeholder.supabase.co'),
  SUPABASE_ANON_KEY: z.string().default('placeholder-anon-key'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('placeholder-service-role-key'),
  
  // JWT (with development defaults)
  JWT_SECRET: z.string().min(32).default('development-jwt-secret-key-minimum-32-characters-long-for-testing'),
  JWT_PRIVATE_KEY: z.string().optional(), // Ed25519 private key in PKCS#8 PEM format
  JWT_ISSUER: z.string().url().default('http://localhost:3000'),
  JWT_AUDIENCE: z.string().default('cadop-service'),
  
  // OIDC (with development defaults)
  OIDC_ISSUER: z.string().url().default('http://localhost:3000'),
  OIDC_CLIENT_ID: z.string().default('cadop-service'),
  OIDC_CLIENT_SECRET: z.string().default('development-client-secret'),
  
  // OAuth Providers (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  TWITTER_CONSUMER_KEY: z.string().optional(),
  TWITTER_CONSUMER_SECRET: z.string().optional(),
  
  // WebAuthn (with development defaults)
  WEBAUTHN_RP_NAME: z.string().default('CADOP Service'),
  WEBAUTHN_RP_ID: z.string().default('localhost'),
  WEBAUTHN_ORIGIN: z.string().url().default('http://localhost:3000'),
  
  // Rooch Network (with development defaults)
  ROOCH_NETWORK_URL: z.string().url().default('https://test-seed.rooch.network'),
  ROOCH_NETWORK_ID: z.string().default('testnet'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),
  
  // CORS (with development defaults)
  CORS_ORIGIN: z.string().default('http://localhost:3001,http://localhost:3000'),
  
  // Session (with development defaults)
  SESSION_SECRET: z.string().min(32).default('development-session-secret-minimum-32-characters-long-for-testing'),
  SESSION_MAX_AGE: z.string().default('86400000'),
});

// Validate environment variables
const env = envSchema.parse(process.env);

// Export typed configuration
export const config = {
  server: {
    port: parseInt(env.PORT, 10),
    nodeEnv: env.NODE_ENV,
  },
  supabase: {
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  },
  jwt: {
    secret: env.JWT_SECRET,
    privateKey: env.JWT_PRIVATE_KEY,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  },
  oidc: {
    issuer: env.OIDC_ISSUER,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
  },
  oauth: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
    twitter: {
      consumerKey: env.TWITTER_CONSUMER_KEY,
      consumerSecret: env.TWITTER_CONSUMER_SECRET,
    },
  },
  webauthn: {
    rpName: env.WEBAUTHN_RP_NAME,
    rpId: env.WEBAUTHN_RP_ID,
    origin: env.WEBAUTHN_ORIGIN,
  },
  rooch: {
    networkUrl: env.ROOCH_NETWORK_URL,
    networkId: env.ROOCH_NETWORK_ID,
  },
  rateLimit: {
    windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS, 10),
    maxRequests: parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10),
  },
  logging: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
  },
  cors: {
    origin: env.CORS_ORIGIN.split(',').map((origin: string) => origin.trim()),
  },
  session: {
    secret: env.SESSION_SECRET,
    maxAge: parseInt(env.SESSION_MAX_AGE, 10),
  },
} as const; 