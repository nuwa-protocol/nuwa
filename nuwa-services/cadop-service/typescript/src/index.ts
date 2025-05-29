import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config/environment';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import custodianRoutes from './routes/custodian';
import { proofRoutes } from './routes/proof';
import oidcRoutes from './routes/oidc';
import webauthnRoutes from './routes/webauthn';
import { cryptoService } from './services/crypto';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(cors({
  origin: config.cors.origin,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files serving
app.use('/static', express.static(path.join(__dirname, 'public/static')));

// Initialize crypto service and keys
async function initializeServices() {
  try {
    await cryptoService.initializeKeys();
    logger.info('Crypto service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize crypto service', { error });
    process.exit(1);
  }
}

// Routes
app.use('/health', healthRoutes);

// OIDC and well-known endpoints (注意：这些路由需要在其他路由之前)
app.use('/', oidcRoutes);

// API routes
app.use('/auth', authRoutes);
app.use('/api/custodian', custodianRoutes);
app.use('/api/proof', proofRoutes);

// WebAuthn routes
app.use('/api/webauthn', webauthnRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (_req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found'
  });
});

const port = config.server.port;

// Start server with service initialization
async function startServer() {
  try {
    // Initialize all services
    await initializeServices();
    
    // Start the HTTP server
    app.listen(port, () => {
      logger.info(`CADOP Service started on port ${port}`, {
        environment: config.server.nodeEnv,
        port,
        oidc_issuer: config.oidc.issuer,
        endpoints: {
          discovery: `${config.oidc.issuer}/.well-known/openid-configuration`,
          jwks: `${config.oidc.issuer}/.well-known/jwks.json`,
          did_document: `${config.oidc.issuer}/.well-known/did.json`,
          authorization: `${config.oidc.issuer}/auth/authorize`,
          token: `${config.oidc.issuer}/auth/token`,
          userinfo: `${config.oidc.issuer}/auth/userinfo`
        }
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
startServer();

export default app; 