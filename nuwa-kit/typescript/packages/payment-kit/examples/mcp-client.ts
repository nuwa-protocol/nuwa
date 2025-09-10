#!/usr/bin/env node

/**
 * Example MCP client with payment capabilities
 * 
 * This example demonstrates:
 * - Connecting to an MCP payment server
 * - Making FREE and paid tool calls
 * - Handling payment flows and SubRAV management
 * - Error handling and recovery
 */

import { PaymentChannelMcpClient } from '../src/integrations/mcp/PaymentChannelMcpClient';
import { TestEnv, createSelfDid } from '@nuwa-ai/identity-kit/testHelpers';

async function main() {
  console.log('🔌 Connecting to MCP Payment Server...');

  // Create test environment and identity (in production, use real signer)
  const env = await TestEnv.bootstrap({
    rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
    network: 'local',
    debug: false,
  });

  const payer = await createSelfDid(env, {
    keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
    skipFunding: false,
  });
  
  const client = new PaymentChannelMcpClient({
    baseUrl: 'http://localhost:8080/mcp',
    signer: payer.signer,
    keyId: payer.vmIdFragment,
    payerDid: payer.did,
    defaultAssetId: '0x3::gas_coin::RGas',
    debug: true,
  });

  try {
    console.log('\n1️⃣ Testing FREE endpoints...');
    
    // Health check (FREE)
    const health = await client.healthCheck();
    console.log('Health:', health);
    
    // Service discovery (FREE)
    const discovery = await client.call('nuwa.discovery');
    console.log('Discovery:', discovery.data);
    
    // Recovery (FREE)
    const recovery = await client.recoverFromService();
    console.log('Recovery:', recovery);

    console.log('\n2️⃣ Testing FREE business tool...');
    
    // Hello tool (FREE)
    const hello = await client.call('hello', { name: 'MCP User' });
    console.log('Hello response:', hello.data);
    console.log('Payment info:', hello.payment || 'None (FREE)');

    console.log('\n3️⃣ Testing paid business tool...');
    
    // Analyze tool (paid)
    const analysis = await client.call('analyze', { 
      data: 'Sample data for analysis' 
    });
    console.log('Analysis response:', analysis.data);
    console.log('Payment info:', analysis.payment);

    console.log('\n4️⃣ Testing streaming tool...');
    
    // Stream data (paid, streaming)
    const stream = await client.call('stream_data', { count: 3 });
    console.log('Stream response:', stream.data);
    console.log('Payment info:', stream.payment);

    console.log('\n5️⃣ Checking pending SubRAVs...');
    
    const pendingSubRAV = client.getPendingSubRAV();
    if (pendingSubRAV) {
      console.log('Pending SubRAV:', {
        channelId: pendingSubRAV.channelId,
        nonce: pendingSubRAV.nonce.toString(),
        amount: pendingSubRAV.accumulatedAmount.toString(),
      });
      
      // Commit the SubRAV
      const signedSubRAV = await client.getPayerClient().signSubRAV(pendingSubRAV);
      const commitResult = await client.commitSubRAV(signedSubRAV);
      console.log('Commit result:', commitResult);
    } else {
      console.log('No pending SubRAVs');
    }

    console.log('\n6️⃣ Testing error handling...');
    
    try {
      await client.call('unknown_tool', { param: 'value' });
    } catch (error: any) {
      console.log('Expected error for unknown tool:', error.message);
    }

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Error during testing:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Failed to run MCP client:', error);
    process.exit(1);
  });
}
