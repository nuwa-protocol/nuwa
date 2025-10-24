#!/usr/bin/env node

import { loadConfig, validateConfig, showHelp, showVersion } from '../config/cli.js';
import { startServer } from '../server.js';

/**
 * Main CLI entry point
 */
async function main() {
  try {
    console.log('🔧 Loading configuration...');

    // Load configuration from CLI args, config file, and environment
    const config = loadConfig();

    console.log('✅ Configuration loaded successfully');
    console.log(`📍 Port: ${config.port}, Host: ${config.host}`);
    console.log(`🌐 Network: ${config.network}, Debug: ${config.debug}`);

    // Check for SERVICE_KEY
    if (!config.serviceKey) {
      console.error('❌ SERVICE_KEY is required but not provided.');
      console.error('💡 Set SERVICE_KEY environment variable or use --service-key option');
      console.error('💡 Example: export SERVICE_KEY=your_private_key_here');
      process.exit(1);
    }

    // Validate configuration
    console.log('🔍 Validating configuration...');
    const validation = validateConfig(config);
    if (!validation.valid) {
      console.error('❌ Configuration validation failed:');
      validation.errors.forEach(error => console.error(`   • ${error}`));
      process.exit(1);
    }

    console.log('✅ Configuration validation passed');

    // Start the server
    console.log('🚀 Starting LLM Gateway server...');
    const serverInstance = await startServer(config);

    // Setup graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      try {
        await serverInstance.close();
        console.log('✅ Shutdown completed successfully');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGHUP', () => shutdown('SIGHUP'));

    // Handle uncaught exceptions
    process.on('uncaughtException', error => {
      console.error('❌ Uncaught Exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  } catch (error) {
    console.error('❌ Failed to start LLM Gateway:', error);

    if (error instanceof Error) {
      if (error.message.includes('EADDRINUSE')) {
        console.error('💡 The port is already in use. Try a different port with --port <number>');
      } else if (error.message.includes('EACCES')) {
        console.error('💡 Permission denied. Try running with sudo or use a port > 1024');
      } else if (error.message.includes('SERVICE_KEY')) {
        console.error(
          '💡 SERVICE_KEY is required. Set it via environment variable or --service-key'
        );
      }
    }

    process.exit(1);
  }
}

// Execute main function directly - this file is only used as CLI entry point
main();

export { main };
