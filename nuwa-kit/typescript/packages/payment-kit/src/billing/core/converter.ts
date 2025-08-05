import { RateProvider, ConversionResult, RateProviderError } from '../rate/types';

/**
 * Convert a USD cost (in picoUSD) to the smallest unit of the requested asset
 * using the supplied `RateProvider`.
 */
export async function convertUsdToAsset(
  usdCost: bigint,
  assetId: string,
  rateProvider: RateProvider,
): Promise<ConversionResult> {
  if (usdCost === 0n) {
    return {
      assetCost: 0n,
      usdCost,
      priceUsed: 0n,
      priceTimestamp: Date.now(),
      rateProvider: 'none',
      assetId,
    };
  }

  try {
    const price = await rateProvider.getPricePicoUSD(assetId);
    const priceTimestamp = rateProvider.getLastUpdated(assetId) ?? Date.now();

    if (price <= 0n) {
      throw new RateProviderError(`Invalid price for asset ${assetId}: ${price}`, assetId);
    }

    // Ceil division to avoid under-charging
    const assetCost = (usdCost + price - 1n) / price;

    return {
      assetCost,
      usdCost,
      priceUsed: price,
      priceTimestamp,
      rateProvider: 'rate-provider',
      assetId,
    };
  } catch (err) {
    if (err instanceof RateProviderError) {
      throw err;
    }
    throw new RateProviderError(`Failed to convert USD to asset ${assetId}: ${err}`, assetId);
  }
}
