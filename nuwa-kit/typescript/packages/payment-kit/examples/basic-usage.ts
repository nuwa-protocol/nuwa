/**
 * Basic usage example showing how DidAccountSigner is shared between identity-kit and payment-kit
 */

import { IdentityKit, DidAccountSigner } from '@nuwa-ai/identity-kit';
import { createRoochPaymentChannelClient } from '@nuwa-ai/payment-kit';

async function basicUsageExample() {
  // 1. Initialize identity environment
  const env = await IdentityKit.bootstrap({
    method: 'rooch',
    vdrOptions: { rpcUrl: 'https://test-seed.rooch.network' },
  });

  const kit = await env.loadDid('did:rooch:0xabc...');
  const keyId = (await kit.getAvailableKeyIds()).authentication![0];

  // 2. Create payment channel client (internally uses DidAccountSigner)
  const pcClient = await createRoochPaymentChannelClient({
    kit,
    keyId,
  });

  // 3. Alternatively, you can manually create DidAccountSigner for advanced use cases
  const signer = kit.getSigner();
  const didAccountSigner = await DidAccountSigner.create(signer, keyId);
  
  console.log('DID Account Signer Address:', didAccountSigner.getRoochAddress().toBech32Address());
  console.log('DID:', await didAccountSigner.getDid());

  // 4. The same DidAccountSigner class is used in both identity-kit (for DID operations)
  // and payment-kit (for payment channel operations), ensuring consistency
}

export { basicUsageExample }; 