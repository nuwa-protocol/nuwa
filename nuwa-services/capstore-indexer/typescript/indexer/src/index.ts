import { setupRoochEventListener } from './event-handle.js';
import { getService } from './services/service.js';

// -----------------------------------------------------------------------------
// Event Listener Initialization
// -----------------------------------------------------------------------------
setupRoochEventListener();

// -----------------------------------------------------------------------------
// Start Service
// -----------------------------------------------------------------------------
(async () => {
  const ipfsService = await getService();
  await ipfsService.start();
  console.log('✅ Nuwa Cap Store Indexer Service running');
})();