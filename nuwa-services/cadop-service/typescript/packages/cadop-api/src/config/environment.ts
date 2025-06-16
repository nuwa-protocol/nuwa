import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema with development defaults
const envSchema = z.object({
  // Server
  PORT: z.string().default('8080'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // WebAuthn
  WEBAUTHN_RP_ID: z.string().default('localhost'),
  
  // Rooch Network (with development defaults)
  ROOCH_NETWORK_URL: z.string().url().default('http://localhost:6767'),
  ROOCH_NETWORK_ID: z.string().default('local'),
  
  // Service Configuration
  CADOP_DID: z.string().default('did:rooch:placeholder'),
  JWT_SIGNING_KEY: z.string().default('signing-key-placeholder'),
  CUSTODIAN_MAX_DAILY_MINTS: z.string().default('10'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),
  
  // CORS (with development defaults)
  CORS_ORIGIN: z.string().default('http://localhost:3001,http://localhost:3000'),
  
});

// Validate environment variables
const env = envSchema.parse(process.env);

// Export typed configuration
export const config = {
  server: {
    port: parseInt(env.PORT, 10),
    nodeEnv: env.NODE_ENV,
  },
  rooch: {
    networkUrl: env.ROOCH_NETWORK_URL,
    networkId: env.ROOCH_NETWORK_ID,
  },
  service: {
    did: env.CADOP_DID,
    maxDailyMints: parseInt(env.CUSTODIAN_MAX_DAILY_MINTS, 10),
    signingKey: env.JWT_SIGNING_KEY,
  },
  webauthn: {
    rpId: env.WEBAUTHN_RP_ID,
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
} as const; 