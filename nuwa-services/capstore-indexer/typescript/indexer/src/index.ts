import { setupRoochEventListener } from './event-handle.js';
import { ipfsService } from './services/service.js';

// -----------------------------------------------------------------------------
// Event Listener Initialization
// -----------------------------------------------------------------------------
setupRoochEventListener();

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