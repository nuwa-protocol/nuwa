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

// Set explicit MIME types for static files
express.static.mime.define({
  'text/css': ['css'],
  'application/javascript': ['js'],
  'application/json': ['json'],
  'text/html': ['html']
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.github.com", "https://accounts.google.com"],
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

// Set up MIME types before static files
app.use((req, res, next) => {
  if (req.path.endsWith('.css')) {
    res.type('text/css');
  } else if (req.path.endsWith('.js')) {
    res.type('application/javascript');
  }
  next();
});

// Debug middleware to track static file requests
app.use((req, res, next) => {
  if (req.path.includes('.css') || req.path.includes('.js')) {
    console.log(`[DEBUG] Static file request: ${req.method} ${req.path}`);
  }
  next();
});

// Static files serving - MUST be before all other routes
const staticPath = path.join(__dirname, process.env.NODE_ENV === 'production' ? 'public' : '../dist/public');
console.log(`[DEBUG] Static files path: ${staticPath}`);
console.log(`[DEBUG] Static files exists: ${require('fs').existsSync(staticPath)}`);
app.use(express.static(staticPath, {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

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

// API Routes - order matters!
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/api/custodian', custodianRoutes);
app.use('/api/proof', proofRoutes);
app.use('/api/webauthn', webauthnRoutes);
// OIDC routes last since they include root-level routes
// app.use('/', oidcRoutes);

// Serve React app for non-static routes only
app.get('*', (req, res) => {
  // Skip serving index.html for API routes
  if (req.path.startsWith('/api/') || 
      req.path.startsWith('/auth/') || 
      req.path.startsWith('/health') ||
      req.path.startsWith('/.well-known/')) {
    // Let these routes be handled by their respective routers
    return res.status(404).json({ error: 'Route not found' });
  }
  
  const indexPath = path.join(staticPath, 'index.html');
  console.log(`[DEBUG] Serving index.html from: ${indexPath} for route: ${req.path}`);
  res.sendFile(indexPath);
});

// Error handling
app.use(errorHandler);

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