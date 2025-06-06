import express, { Application } from 'express';
import { logger } from './utils/logger.js';

async function startApp(): Promise<Application> {
  try {
   
    
    logger.info('Services initialized successfully');

    const app = express();
    // ... rest of app setup ...
    
    return app;
  } catch (error) {
    logger.error('Failed to start application', { error });
    throw error;
  }
}

export default startApp; 