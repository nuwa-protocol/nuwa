import { PaymentChannelMcpClient } from './PaymentChannelMcpClient';
import { MemoryHostChannelMappingStore } from '../http/internal/LocalStore';
import type { McpPayerOptions } from './PaymentChannelMcpClient';
import type { SignerInterface } from '@nuwa-ai/identity-kit';

// Mock signer for testing
const mockSigner: SignerInterface = {
  getDid: async () => 'did:example:test',
  sign: async () => new Uint8Array(),
  getPublicKey: async () => new Uint8Array(),
  getKeyId: async () => 'test-key-id',
} as any;

// Mock chain config for testing
const mockChainConfig = {
  chain: 'rooch' as const,
  rpcUrl: 'http://localhost:8080',
  network: 'local' as const,
  debug: false,
};

describe('PaymentChannelMcpClient State Persistence', () => {
  let mappingStore: MemoryHostChannelMappingStore;
  let client: PaymentChannelMcpClient;

  beforeEach(() => {
    mappingStore = new MemoryHostChannelMappingStore();

    const options: McpPayerOptions = {
      baseUrl: 'http://localhost:8080/mcp',
      signer: mockSigner,
      keyId: 'test-key-id',
      chainConfig: mockChainConfig,
      maxAmount: BigInt('1000000000000'),
      mappingStore,
      payerDid: 'did:example:test',
    };

    client = new PaymentChannelMcpClient(options);
  });

  afterEach(async () => {
    await client.close();
  });

  it('should persist and restore pending SubRAV state', async () => {
    // Initially no pending SubRAV
    expect(client.getPendingSubRAV()).toBeNull();

    // Simulate setting a pending SubRAV (this would normally happen during payment flow)
    const mockSubRAV = {
      version: 1,
      chainId: 1n,
      channelId: 'test-channel-id',
      channelEpoch: 1n,
      vmIdFragment: 'test-vm-fragment',
      accumulatedAmount: 1000000n,
      nonce: 1n,
    };

    // Access private paymentState to set pending SubRAV for testing
    (client as any).paymentState.setPendingSubRAV(mockSubRAV);

    // Manually trigger persistence
    await (client as any).persistClientState();

    // Verify state was persisted (note: BigInt values are serialized as strings)
    const persistedState = await mappingStore.getState('localhost:8080::did:example:test');
    expect(persistedState).toBeDefined();
    expect(persistedState?.pendingSubRAV).toEqual({
      version: '1',
      chainId: '1',
      channelId: 'test-channel-id',
      channelEpoch: '1',
      vmIdFragment: 'test-vm-fragment',
      accumulatedAmount: '1000000',
      nonce: '1',
    });

    // Create new client instance to test state restoration
    const newClient = new PaymentChannelMcpClient({
      baseUrl: 'http://localhost:8080/mcp',
      signer: mockSigner,
      keyId: 'test-key-id',
      chainConfig: mockChainConfig,
      maxAmount: BigInt('1000000000000'),
      mappingStore,
      payerDid: 'did:example:test',
    });

    // Wait a bit for async state loading
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify state was restored
    const restoredSubRAV = newClient.getPendingSubRAV();
    expect(restoredSubRAV).toEqual(mockSubRAV);

    await newClient.close();
  });

  it('should clear persisted state when requested', async () => {
    // Set some state first
    const mockSubRAV = {
      version: 1,
      chainId: 1n,
      channelId: 'test-channel-id',
      channelEpoch: 1n,
      vmIdFragment: 'test-vm-fragment',
      accumulatedAmount: 1000000n,
      nonce: 1n,
    };

    (client as any).paymentState.setPendingSubRAV(mockSubRAV);
    await (client as any).persistClientState();

    // Verify state exists
    let persistedState = await mappingStore.getState('localhost:8080::did:example:test');
    expect(persistedState).toBeDefined();

    // Clear state
    await client.clearPersistedState();

    // Verify state was cleared
    persistedState = await mappingStore.getState('localhost:8080::did:example:test');
    expect(persistedState).toBeUndefined();

    // Verify in-memory state was also cleared
    expect(client.getPendingSubRAV()).toBeNull();
  });

  it('should persist state when SubRAV is cleared', async () => {
    // Set a pending SubRAV
    const mockSubRAV = {
      version: 1,
      chainId: 1n,
      channelId: 'test-channel-id',
      channelEpoch: 1n,
      vmIdFragment: 'test-vm-fragment',
      accumulatedAmount: 1000000n,
      nonce: 1n,
    };

    (client as any).paymentState.setPendingSubRAV(mockSubRAV);
    expect(client.getPendingSubRAV()).toEqual(mockSubRAV);

    // Clear SubRAV (this should trigger persistence)
    client.clearPendingSubRAV();

    // Wait a bit for async persistence
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify state was persisted with cleared SubRAV
    const persistedState = await mappingStore.getState('localhost:8080::did:example:test');
    expect(persistedState).toBeDefined();
    expect(persistedState?.pendingSubRAV).toBeUndefined();
  });
});
