import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/environment.js';
import { supabase } from './config/supabase.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import custodianRouter from './routes/custodian.js';
import { proofRouter } from './routes/proof.js';
import { oidcRouter } from './routes/oidc.js';
import webauthnRouter from './routes/webauthn.js';
import { cryptoService } from './services/crypto.js';
import fs from 'fs';

const app: Express = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Static files serving
const staticPath = path.join(__dirname, process.env.NODE_ENV === 'production' ? '../public' : '../dist/public');
if (fs.existsSync(staticPath)) {
  logger.info(`Serving static files from: ${staticPath}`);
  app.use(express.static(staticPath, {
    setHeaders: (res, path) => {
      if (path.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
    }
  }));
} else {
  logger.warn(`Static files directory not found: ${staticPath}`);
}

// Initialize crypto service and keys
async function initializeServices() {
  try {
    logger.info('Initializing crypto service');
    await cryptoService.initializeKeys();
    logger.info('Crypto service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize crypto service', { error });
    throw error;
  }
}

// API Routes
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/api/custodian', custodianRouter);
app.use('/api/proof', proofRouter);
app.use('/api/webauthn', webauthnRouter);
app.use('/', oidcRouter);

// Serve React app for non-static routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || 
      req.path.startsWith('/auth/') || 
      req.path.startsWith('/health') ||
      req.path.startsWith('/.well-known/')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  
  const indexPath = path.join(staticPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend not built' });
  }
});

// Error handling
app.use(errorHandler);

// Start server with service initialization
async function startServer() {
  try {
    // Initialize all services
    await initializeServices();
    
    // Start the HTTP server
    const port = config.server.port || 8080;
    app.listen(port, () => {
      logger.info(`CADOP Service started successfully`, {
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
    logger.error('Failed to start server', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined 
    });
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
startServer().catch(error => {
  logger.error('Unhandled error during server startup', { 
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined 
  });
  process.exit(1);
});

export default app; 