import type { ApiContext } from '../../types/api';
import { BuiltInApiHandlers } from '../../api';

export function registerHandlersForMcp(
  kit: { register: (name: string, options: any, handler: any, ruleId?: string) => any },
  apiContext: ApiContext,
  opts?: { pathPrefix?: string }
) {
  const prefix = opts?.pathPrefix || '/payment-channel';

  // Map built-in HTTP handlers into MCP operations with equivalent rule ids
  kit.register('nuwa.discover', { pricing: 0n, authRequired: false }, async () => {
    return {
      version: 1,
      serviceId: apiContext.config.serviceId,
      serviceDid: apiContext.config.serviceDid,
      network: 'test',
      defaultAssetId: apiContext.config.defaultAssetId,
      basePath: prefix,
    };
  }, 'GET:/.well-known/nuwa-payment/info');

  // Recovery (requires auth)
  kit.register(
    'nuwa.recovery',
    { pricing: 0n, authRequired: true },
    async (params: any, meta?: any) =>
      BuiltInApiHandlers.recovery.handler(apiContext, { ...(params || {}), didInfo: (meta as any)?.didInfo })
  );

  kit.register(
    'nuwa.health',
    { pricing: 0n, authRequired: false },
    async (params: any, meta?: any) => BuiltInApiHandlers.health.handler(apiContext, params)
  );

  kit.register(
    'nuwa.commit',
    { pricing: 0n, authRequired: true },
    async (params: any, meta?: any) =>
      BuiltInApiHandlers.commit.handler(apiContext, { ...(params || {}), didInfo: (meta as any)?.didInfo })
  );

  // Admin status (adminOnly)
  kit.register(
    'nuwa.admin.status',
    { pricing: 0n, authRequired: true, adminOnly: true },
    async (params: any, meta?: any) =>
      BuiltInApiHandlers.adminStatus.handler(apiContext, { ...(params || {}), didInfo: (meta as any)?.didInfo })
  );

  kit.register(
    'nuwa.admin.claim-trigger',
    { pricing: 0n, authRequired: true, adminOnly: true },
    async (params: any, meta?: any) =>
      BuiltInApiHandlers.adminClaimTrigger.handler(apiContext, { ...(params || {}), didInfo: (meta as any)?.didInfo })
  );

  return kit;
}


