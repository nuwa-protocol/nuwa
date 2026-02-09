import { describe, expect, it } from '@jest/globals';
import { Signer } from '@roochnetwork/rooch-sdk';
import { GasSubsidyService } from '../GasSubsidyService.js';

type MockResultType = 'executed' | 'moveabort';

function makeService(options: {
  enabled?: boolean;
  amountRaw?: string;
  clientResultType?: MockResultType;
  txHash?: string;
  throwError?: Error;
}) {
  const calls: unknown[] = [];
  const signer = {} as Signer;
  const client = {
    signAndExecuteTransaction: async (input: unknown) => {
      calls.push(input);
      if (options.throwError) throw options.throwError;
      return {
        execution_info: {
          status: { type: options.clientResultType || 'executed' },
          tx_hash: options.txHash || '0xtx',
        },
      };
    },
  };

  const service = new GasSubsidyService(
    {
      enabled: options.enabled ?? true,
      amountRaw: options.amountRaw ?? '5000000000',
      maxGas: 100000000,
    },
    signer,
    'https://main-seed.rooch.network',
    undefined,
    client
  );

  return { service, calls };
}

describe('GasSubsidyService', () => {
  it('returns skipped when subsidy is disabled', async () => {
    const { service, calls } = makeService({ enabled: false });
    const result = await service.subsidizeAgentDid('did:rooch:0x123');
    expect(result).toEqual({
      attempted: false,
      status: 'skipped',
      reason: 'subsidy disabled',
    });
    expect(calls.length).toBe(0);
  });

  it('returns skipped when amount is non-positive', async () => {
    const { service, calls } = makeService({ amountRaw: '0' });
    const result = await service.subsidizeAgentDid('did:rooch:0x123');
    expect(result).toEqual({
      attempted: false,
      status: 'skipped',
      reason: 'subsidy amount is non-positive',
    });
    expect(calls.length).toBe(0);
  });

  it('returns failed for invalid DID method', async () => {
    const { service } = makeService({});
    const result = await service.subsidizeAgentDid('did:key:zabc');
    expect(result.attempted).toBe(true);
    expect(result.status).toBe('failed');
    expect(result.reason).toContain('unsupported DID method');
  });

  it('returns failed when transaction status is not executed', async () => {
    const { service } = makeService({ clientResultType: 'moveabort', txHash: '0xfail' });
    const result = await service.subsidizeAgentDid('did:rooch:0x123');
    expect(result).toEqual({
      attempted: true,
      status: 'failed',
      amountRaw: '5000000000',
      txHash: '0xfail',
      reason: 'transaction failed: moveabort',
    });
  });

  it('returns success when transaction executes', async () => {
    const { service } = makeService({ clientResultType: 'executed', txHash: '0xok' });
    const result = await service.subsidizeAgentDid('did:rooch:0x123');
    expect(result).toEqual({
      attempted: true,
      status: 'success',
      amountRaw: '5000000000',
      txHash: '0xok',
    });
  });

  it('returns failed when transaction throws', async () => {
    const { service } = makeService({ throwError: new Error('network unavailable') });
    const result = await service.subsidizeAgentDid('did:rooch:0x123');
    expect(result.attempted).toBe(true);
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('network unavailable');
  });
});
