import { CapKitMcp } from '../src';
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import { setupEnv } from './env';

describe('CapKit', () => {
  let capKit: CapKitMcp;
  beforeAll(async () => {
    const { capKit: a } = await setupEnv();
    capKit = a;
  });

  afterAll(async () => {
    await capKit?.mcpClose();
  });

  it('should favorite a cap', async () => {
    const all = await capKit.queryByName();

    const cap = all.data?.items[0];
    const result = await capKit.updateEnableCap(cap?.id || '', 'enable');
    expect(result.code).toBe(200);

    const result1 = await capKit.updateEnableCap(cap?.id || '', 'disable');
    expect(result1.code).toBe(200);
  }, 150000);
});
