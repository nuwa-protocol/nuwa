import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger.js';
import { ServiceContainer } from './services/ServiceContainer.js';
import { config } from './config/environment.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import custodianRouter from './routes/custodian.js';
import idpRouter from './routes/idp.js';

async function initializeServices() {
  try {
    // Initialize ServiceContainer with all service configs
    const serviceConfig = {
      cadopDid: config.service.did,
      custodian: {
        maxDailyMints: config.service.maxDailyMints,
      },
      idp: {
        signingKey: config.service.signingKey,
      },
      rooch: {
        networkUrl: config.rooch.networkUrl,
        networkId: config.rooch.networkId,
      },
      isDevelopment: config.server.nodeEnv === 'development',
    };

    // Initialize container and all services
    await ServiceContainer.getInstance(serviceConfig);

    logger.info('Application services initialized successfully', {
      cadopDid: config.service.did,
      networkUrl: config.rooch.networkUrl,
    });
  } catch (error) {
    logger.error('Failed to initialize services', { error });
    throw error;
  }
}

async function startApp(): Promise<Application> {
  try {
    // Initialize all services
    await initializeServices();

    const app = express();

    // Trust proxy configuration for accurate client IP detection
    app.set('trust proxy', config.trustProxy);

    // Security middleware
    app.use(helmet());

    app.use(
      cors({
        origin: '*',
        credentials: true,
      })
    );

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      message: 'Too many requests from this IP, please try again later.',
    });
    app.use(limiter);

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // API Routes
    app.use('/health', healthRouter);
    app.use('/api/custodian', custodianRouter);
    app.use('/api/idp', idpRouter);

    // 404 handler for undefined routes
    app.use((req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });

    // Error handling
    app.use(errorHandler);

    return app;
  } catch (error) {
    logger.error('Failed to start application', { error });
    throw error;
  }
}

export default startApp;
