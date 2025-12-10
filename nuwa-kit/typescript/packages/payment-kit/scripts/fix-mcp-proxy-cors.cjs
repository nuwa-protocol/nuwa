#!/usr/bin/env node
/**
 * Post-install script to fix CORS headers in mcp-proxy
 * This adds missing mcp-protocol-version header to Access-Control-Allow-Headers
 */

const fs = require('fs');
const path = require('path');

// Find mcp-proxy installation
const mcpProxyPath = require.resolve('mcp-proxy/package.json');
const mcpProxyDir = path.dirname(mcpProxyPath);
const startHTTPServerPath = path.join(mcpProxyDir, 'src', 'startHTTPServer.ts');

console.log('🔧 Fixing mcp-proxy CORS headers...');

try {
  if (!fs.existsSync(startHTTPServerPath)) {
    console.log('⚠️  mcp-proxy source file not found, skipping CORS fix');
    process.exit(0);
  }

  let content = fs.readFileSync(startHTTPServerPath, 'utf8');

  // Check if already patched
  if (content.includes('mcp-protocol-version')) {
    console.log('✅ mcp-proxy CORS headers already fixed');
    process.exit(0);
  }

  // Apply the fix
  const oldCorsHeaders =
    'res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Mcp-Session-Id, Last-Event-Id");';
  const newCorsHeaders =
    'res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, mcp-session-id, mcp-protocol-version, last-event-id");';

  if (content.includes(oldCorsHeaders)) {
    content = content.replace(oldCorsHeaders, newCorsHeaders);

    // Also fix the Methods header to include DELETE
    content = content.replace(
      'res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");',
      'res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");'
    );

    // Fix the Expose-Headers to use lowercase
    content = content.replace(
      'res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");',
      'res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");'
    );

    fs.writeFileSync(startHTTPServerPath, content, 'utf8');
    console.log('✅ mcp-proxy CORS headers fixed successfully');
  } else {
    console.log('⚠️  CORS headers pattern not found, mcp-proxy may have been updated');
  }
} catch (error) {
  console.error('❌ Error fixing mcp-proxy CORS:', error.message);
  // Don't fail the installation
  process.exit(0);
}
