import { ipfsService } from './services/service.js';

// All tools are now registered in service.ts

// -----------------------------------------------------------------------------
// Start Service
// -----------------------------------------------------------------------------
ipfsService.start({
  transportType: "httpStream",
  httpStream: {
    port: 3000,
    endpoint: "/mcp"
  }
}).then(() => {
  console.log('✅ Nuwa Cap Store Indexer Service running on port 3000');
});