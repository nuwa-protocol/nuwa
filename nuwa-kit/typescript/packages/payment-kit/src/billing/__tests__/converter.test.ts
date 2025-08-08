import { convertUsdToAssetUsingPrice } from '../core/converter';
import type { RateResult } from '../rate/types';

describe('convertUsdToAssetUsingPrice', () => {
  const rate: RateResult = {
    price: BigInt(5), // 5 picoUSD per asset unit
    timestamp: 1700000000000,
    provider: 'test-provider',
    assetId: 'test-asset',
  };

  test('returns zero asset cost when usdCost is 0', () => {
    const res = convertUsdToAssetUsingPrice(0n, rate);
    expect(res.assetCost).toBe(0n);
    expect(res.usdCost).toBe(0n);
    expect(res.priceUsed).toBe(5n);
    expect(res.assetId).toBe('test-asset');
  });

  test('converts with ceil division when not divisible', () => {
    // usdCost = 11, price = 5 => (11+5-1)/5 = 15/5 = 3
    const res = convertUsdToAssetUsingPrice(11n, rate);
    expect(res.assetCost).toBe(3n);
    expect(res.usdCost).toBe(11n);
    expect(res.priceUsed).toBe(5n);
  });

  test('converts exactly when divisible', () => {
    // usdCost = 10, price = 5 => (10+5-1)/5 = 14/5 = 2 (ceil exact)
    const res = convertUsdToAssetUsingPrice(10n, rate);
    expect(res.assetCost).toBe(2n);
  });

  test('throws on non-positive price', () => {
    const badRate: RateResult = { ...rate, price: 0n };
    expect(() => convertUsdToAssetUsingPrice(10n, badRate)).toThrow('Invalid price');
  });
});


