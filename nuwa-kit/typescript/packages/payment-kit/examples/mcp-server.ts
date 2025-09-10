#!/usr/bin/env node

/**
 * Example MCP server with payment capabilities using FastMCP
 * 
 * This example demonstrates:
 * - Setting up an MCP server with payment channels
 * - Registering FREE and paid tools
 * - Built-in payment management endpoints
 * - DID-based authentication
 */

import { createFastMcpServer } from '../src/transport/mcp/FastMcpStarter';
import { TestEnv, createSelfDid } from '@nuwa-ai/identity-kit/testHelpers';

async function main() {
  console.log('🚀 Starting MCP Payment Server...');

  // Create test environment and identity (in production, use real config)
  const env = await TestEnv.bootstrap({
    rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
    network: 'local',
    debug: false,
  });

  const payee = await createSelfDid(env, {
    keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
    skipFunding: false,
  });
  
  const app = await createFastMcpServer({
    serviceId: 'mcp-demo-service',
    signer: payee.signer,
    defaultAssetId: '0x3::gas_coin::RGas',
    rpcUrl: env.rpcUrl,
    network: 'local',
    port: 8080,
    debug: true,
  });

  // FREE tool - no payment required
  app.freeTool({
    name: 'hello',
    description: 'Say hello',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'Name to greet' } } },
    execute: async (params: any) => ({ message: `Hello, ${params.name || 'World'}!` }),
  });

  // Paid tool - requires payment
  app.paidTool({
    name: 'analyze',
    description: 'Analyze some data (paid service)',
    pricePicoUSD: BigInt(1000),
    parameters: { type: 'object', properties: { data: { type: 'string', description: 'Data to analyze' } } },
    execute: async (params: any) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return {
        analysis: `Analysis of "${params.data}": This looks interesting!`,
        confidence: 0.95,
        timestamp: new Date().toISOString(),
      };
    },
  });

  // Streaming tool - for real-time responses
  app.paidTool({
    name: 'stream_data',
    description: 'Stream data in real-time (paid per chunk)',
    pricePicoUSD: BigInt(500),
    streaming: true,
    parameters: { type: 'object', properties: { count: { type: 'number', description: 'Number of chunks to stream' } } },
    execute: async (params: any) => {
      const count = params.count || 5;
      const chunks: any[] = [];
      for (let i = 0; i < count; i++) {
        chunks.push({ chunk: i + 1, data: `Streaming chunk ${i + 1}/${count}`, timestamp: new Date().toISOString() });
        if (i < count - 1) await new Promise(resolve => setTimeout(resolve, 200));
      }
      return { chunks, total: count };
    },
  });

  const server = await app.start();

  console.log('✅ MCP Payment Server running on http://localhost:8080/mcp');
  console.log('');
  console.log('Available tools:');
  console.log('  - hello (FREE): Say hello');
  console.log('  - analyze (paid): Analyze data');
  console.log('  - stream_data (paid, streaming): Stream data chunks');
  console.log('');
  console.log('Built-in payment tools:');
  console.log('  - nuwa.discovery (FREE): Service discovery');
  console.log('  - nuwa.health (FREE): Health check');
  console.log('  - nuwa.recovery (FREE): Recover channel state');
  console.log('  - nuwa.commit (FREE): Commit signed SubRAV');
  console.log('');
  console.log('Press Ctrl+C to stop the server');

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down MCP server...');
    server.close(() => {
      console.log('✅ Server stopped');
      process.exit(0);
    });
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Failed to start MCP server:', error);
    process.exit(1);
  });
}
