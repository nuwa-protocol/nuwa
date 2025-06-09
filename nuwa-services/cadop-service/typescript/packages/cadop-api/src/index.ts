import { config } from './config/environment.js';
import { logger } from './utils/logger.js';
import startApp from './app.js';

// Start server with service initialization
async function startServer() {
  try {
    // Initialize and get the Express app
    const app = await startApp();
    
    // Start the HTTP server
    const port = config.server.port || 8080;
    app.listen(port, () => {
      logger.info(`CADOP Service started successfully`, {
        environment: config.server.nodeEnv,
        port,
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