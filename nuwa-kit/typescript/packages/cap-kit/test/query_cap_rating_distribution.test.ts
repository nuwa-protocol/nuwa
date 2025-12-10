import { CapKitMcp } from '../src/index';
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

  it('should query cap rating distribution', async () => {
    const all = await capKit.queryByName(undefined, {
      sortBy: 'downloads',
    });

    const cap = all.data?.items[0];
    const result = await capKit.install(cap?.id || '', 'add');
    expect(result.code).toBe(200);
    const isFavorite = await capKit.install(cap?.id || '', 'isInstall');
    expect(isFavorite.code).toBe(200);
    expect(isFavorite.data).toEqual(true);

    const ratingDistribution = await capKit.queryCapRatingDistribution(cap?.id || '');
    expect(ratingDistribution.code).toBe(200);
    expect(ratingDistribution.data?.length).toEqual(5);
  }, 1500000);
});
