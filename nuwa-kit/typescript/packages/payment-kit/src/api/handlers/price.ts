import type { Handler, ApiContext, PriceRequest, PriceResponse } from '../../types/api';
import { createSuccessResponse, PaymentKitError } from '../../errors';
import { ErrorCode } from '../../types/api';

/**
 * Handle price requests - get current asset price
 */
export const handlePrice: Handler<ApiContext, PriceRequest, PriceResponse> = async (ctx, req) => {
  try {
    const assetId = req.assetId || ctx.config.defaultAssetId || '0x3::gas_coin::RGas';
    
    // Get price from rate provider
    const pricePicoUSD = await ctx.rateProvider.getPricePicoUSD(assetId);
    const lastUpdated = ctx.rateProvider.getLastUpdated(assetId);
    
    // Convert picoUSD to USD (divide by 10^12)
    const priceUSD = Number(pricePicoUSD) / 1e12;
    
    const response: PriceResponse = {
      assetId,
      priceUSD: priceUSD.toString(),
      pricePicoUSD: pricePicoUSD.toString(),
      timestamp: new Date().toISOString(),
      source: 'rate-provider',
      lastUpdated: lastUpdated ? new Date(lastUpdated).toISOString() : undefined
    };

    return createSuccessResponse(response);
  } catch (error) {
    throw new PaymentKitError(
      ErrorCode.INTERNAL_ERROR,
      'Price lookup failed',
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
};