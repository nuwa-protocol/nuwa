import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

// 如果环境变量未设置，使用默认值
if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = 'http://localhost:54321';
}

// WebAuthn 配置
if (!process.env.WEBAUTHN_RP_NAME) {
    process.env.WEBAUTHN_RP_NAME = 'Test CADOP Service';
}
if (!process.env.WEBAUTHN_RP_ID) {
    process.env.WEBAUTHN_RP_ID = 'localhost';
}
if (!process.env.WEBAUTHN_ORIGIN) {
    process.env.WEBAUTHN_ORIGIN = 'http://localhost:3000';
}
if (!process.env.WEBAUTHN_CHALLENGE_TIMEOUT) {
    process.env.WEBAUTHN_CHALLENGE_TIMEOUT = '300000';
}
if (!process.env.WEBAUTHN_EXPECTED_ORIGIN) {
    process.env.WEBAUTHN_EXPECTED_ORIGIN = 'http://localhost:3000';
}
if (!process.env.WEBAUTHN_EXPECTED_RP_ID) {
    process.env.WEBAUTHN_EXPECTED_RP_ID = 'localhost';
}

// JWT 配置
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-testing';
}
if (!process.env.JWT_EXPIRES_IN) {
    process.env.JWT_EXPIRES_IN = '1h';
} 