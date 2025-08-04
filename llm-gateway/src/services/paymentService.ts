import { KeyManager } from '@nuwa-ai/identity-kit';
import { createExpressPaymentKit, ExpressPaymentKit } from '@nuwa-ai/payment-kit';


let paymentKitInstance: ExpressPaymentKit | null = null;

/**
 * Initialize and get ExpressPaymentKit instance
 */
export async function getPaymentKit(): Promise<ExpressPaymentKit> {
  if (paymentKitInstance) {
    return paymentKitInstance;
  }

  // Check if payment kit is enabled
  const paymentKitEnabled = process.env.ENABLE_PAYMENT_KIT === 'true';
  
  if (!paymentKitEnabled) {
    throw new Error('Payment Kit is not enabled. Set ENABLE_PAYMENT_KIT=true to enable.');
  }

  // Validate required environment variables
  const serviceKey = process.env.LLM_GATEWAY_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error('LLM_GATEWAY_SERVICE_KEY environment variable is required for payment kit');
  }

  try {
    // Create signer from serialized service key
    const keyManager = await KeyManager.fromSerializedKey(serviceKey);

    // Create ExpressPaymentKit instance
    paymentKitInstance = await createExpressPaymentKit({
      serviceId: 'llm-gateway',
      signer: keyManager,
      network: (process.env.ROOCH_NETWORK as 'local' | 'dev' | 'test' | 'main') || 'test',
      defaultPricePicoUSD: process.env.DEFAULT_PRICE_PICO_USD || '1000000000', // 1000 picoUSD = 0.001 USD

      debug: process.env.DEBUG?.includes('billing') || process.env.NODE_ENV !== 'production',
    });

    console.log('✅ ExpressPaymentKit initialized successfully');
    return paymentKitInstance;
  } catch (error) {
    console.error('❌ Failed to initialize ExpressPaymentKit:', error);
    throw error;
  }
}

/**
 * Check if payment kit is enabled
 */
export function isPaymentKitEnabled(): boolean {
  return process.env.ENABLE_PAYMENT_KIT === 'true';
}

/**
 * Check if we should use DID auth only (without billing)
 */
export function isDIDAuthOnly(): boolean {
  return process.env.DID_AUTH_ONLY === 'true';
}