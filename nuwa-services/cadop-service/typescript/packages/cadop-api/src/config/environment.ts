import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema with development defaults
const envSchema = z.object({
  // Server
  PORT: z.string().default('8080'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Supabase (with development defaults)
  SUPABASE_URL: z.string().url().default('https://placeholder.supabase.co'),
  SUPABASE_ANON_KEY: z.string().default('placeholder-anon-key'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('placeholder-service-role-key'),
  
  // WebAuthn (with development defaults)
  WEBAUTHN_RP_NAME: z.string().default('CADOP Service'),
  WEBAUTHN_RP_ID: z.string().default('localhost'),
  WEBAUTHN_ORIGIN: z.string().url().default('http://localhost:3000'),
  WEBAUTHN_CHALLENGE_TIMEOUT: z.string().default('300000'), // 5 minutes in milliseconds
  WEBAUTHN_ATTESTATION_TYPE: z.enum(['none', 'indirect', 'direct']).default('none'),
  
  // Rooch Network (with development defaults)
  ROOCH_NETWORK_URL: z.string().url().default('http://localhost:6767'),
  ROOCH_NETWORK_ID: z.string().default('local'),
  
  // Service Configuration
  CADOP_DID: z.string().default('did:rooch:placeholder'),
  JWT_SIGNING_KEY: z.string().default('test-signing-key'),
  CUSTODIAN_MAX_DAILY_MINTS: z.string().default('10'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),
  
  // CORS (with development defaults)
  CORS_ORIGIN: z.string().default('http://localhost:3001,http://localhost:3000'),
  
  // Session (with development defaults)
  SESSION_SECRET: z.string().default('dev-session-secret-key-for-testing-only'),
  SESSION_DURATION: z.string().default('86400'), // 24 hours in seconds
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
  webauthn: {
    rpName: env.WEBAUTHN_RP_NAME,
    rpId: env.WEBAUTHN_RP_ID,
    origin: env.WEBAUTHN_ORIGIN,
    timeout: parseInt(env.WEBAUTHN_CHALLENGE_TIMEOUT, 10),
    attestationType: env.WEBAUTHN_ATTESTATION_TYPE,
  },
  rooch: {
    networkUrl: env.ROOCH_NETWORK_URL,
    networkId: env.ROOCH_NETWORK_ID,
  },
  service: {
    did: env.CADOP_DID,
    signingKey: env.JWT_SIGNING_KEY,
    maxDailyMints: parseInt(env.CUSTODIAN_MAX_DAILY_MINTS, 10),
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
    duration: parseInt(env.SESSION_DURATION, 10),
  },
} as const; 