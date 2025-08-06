import type { Handler, ApiContext, DiscoveryResponse } from '../../types/api';
import { createSuccessResponse } from '../../errors';

/**
 * Handle discovery requests for the well-known endpoint
 */
export const handleDiscovery: Handler<ApiContext, void, DiscoveryResponse> = async (ctx) => {
  const discoveryInfo: DiscoveryResponse = {
    version: 1,
    serviceId: ctx.config.serviceId,
    serviceDid: ctx.config.serviceDid,
    network: 'test', // TODO: get from config
    defaultAssetId: ctx.config.defaultAssetId || '0x3::gas_coin::RGas',
    basePath: '/payment-channel' // TODO: get from config
  };

  if (ctx.config.defaultPricePicoUSD) {
    discoveryInfo.defaultPricePicoUSD = ctx.config.defaultPricePicoUSD.toString();
  }

  return createSuccessResponse(discoveryInfo);
};