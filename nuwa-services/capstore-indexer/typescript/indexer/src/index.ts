// import { setupRoochEventListener } from './indexer/index.js';
import { getService } from './service.js';

// -----------------------------------------------------------------------------
// Event Listener Initialization
// -----------------------------------------------------------------------------
// setupRoochEventListener();

// -----------------------------------------------------------------------------
// Global Error Handlers
// -----------------------------------------------------------------------------
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });
  // Keep the process running in production
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ Unhandled Promise Rejection:', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    timestamp: new Date().toISOString(),
  });
  // Keep the process running in production
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// -----------------------------------------------------------------------------
// Start Service
// -----------------------------------------------------------------------------
(async () => {
  try {
    console.log('🌟 Starting Nuwa Cap Store Indexer Service...');
    console.log('📊 Environment:', {
      NODE_ENV: process.env.NODE_ENV || 'development',
      TARGET: process.env.TARGET || 'test',
      PORT: process.env.PORT || '3000',
      DEBUG: process.env.DEBUG || 'false',
    });
    
    const ipfsService = await getService();
    await ipfsService.start();
    console.log('✅ Nuwa Cap Store Indexer Service running');
    console.log(`🌐 Service available at http://localhost:${process.env.PORT || '3000'}`);
  } catch (error) {
    console.error('❌ Failed to start service:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    process.exit(1);
  }
})();
