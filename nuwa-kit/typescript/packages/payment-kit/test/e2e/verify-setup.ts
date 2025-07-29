/**
 * Setup verification script for E2E tests
 * Run this to verify all dependencies are properly configured
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from '@jest/globals';
import { HttpPaymentCodec } from '../../src/middlewares/http/HttpPaymentCodec';
import { HttpBillingMiddleware } from '../../src/middlewares/http/HttpBillingMiddleware';
import { SubRAVUtils } from '../../src/core/SubRav';
import { PaymentChannelPayeeClient } from '../../src/client/PaymentChannelPayeeClient';
import { RoochPaymentChannelContract } from '../../src/rooch/RoochPaymentChannelContract';
import { TestEnv } from '@nuwa-ai/identity-kit/testHelpers';

async function verifySetup() {
  console.log('🔍 Verifying E2E test setup...');

  try {
    // Check environment
    console.log('📋 Environment check:');
    console.log(`  PAYMENT_E2E: ${process.env.PAYMENT_E2E}`);
    console.log(`  ROOCH_NODE_URL: ${process.env.ROOCH_NODE_URL || 'http://localhost:6767'}`);
    console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

    // Check if we can skip node check
    const shouldSkip = TestEnv.skipIfNoNode();
    console.log(`  Should skip node tests: ${shouldSkip}`);

    // Verify imports
    console.log('📦 Import verification:');
    console.log(`  HttpBillingMiddleware: ${typeof HttpBillingMiddleware}`);
    console.log(`  HttpPaymentCodec: ${typeof HttpPaymentCodec}`);
    console.log(`  PaymentChannelPayeeClient: ${typeof PaymentChannelPayeeClient}`);
    console.log(`  RoochPaymentChannelContract: ${typeof RoochPaymentChannelContract}`);

    // Test HTTP header codec
    console.log('🧪 Testing HTTP header codec...');
    const testPayload = {
      subRav: {
        version: 1,
        chainId: BigInt(4),
        channelId: 'test-channel',
        channelEpoch: BigInt(1),
        vmIdFragment: 'test-fragment',
        accumulatedAmount: BigInt('1000000'),
        nonce: BigInt(1)
      },
      amountDebited: BigInt('1000000'),
      serviceTxRef: 'test-tx-ref',
      errorCode: 0,
      message: 'Test message'
    };

    const encoded = HttpPaymentCodec.buildResponseHeader(testPayload);
    const decoded = HttpPaymentCodec.parseResponseHeader(encoded);
    
    console.log(`  Encode/decode test: ${decoded.message === 'Test message' ? '✅ PASS' : '❌ FAIL'}`);

    // Test fetch availability
    console.log('🌐 Testing fetch availability...');
    console.log(`  fetch available: ${typeof fetch !== 'undefined' ? '✅ YES' : '❌ NO'}`);

    // Test express availability
    console.log('📡 Testing express availability...');
    try {
      const express = require('express');
      console.log(`  express available: ${typeof express === 'function' ? '✅ YES' : '❌ NO'}`);
    } catch (error) {
      console.log(`  express available: ❌ NO (${error})`);
    }

    console.log('✅ Setup verification completed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Setup verification failed:', error);
    return false;
  }
}

// Run verification if called directly
if (require.main === module) {
  verifySetup().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { verifySetup }; 