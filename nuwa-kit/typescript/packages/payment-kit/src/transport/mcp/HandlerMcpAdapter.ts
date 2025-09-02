import type { Handler, ApiContext } from '../../types/api';

/**
 * Convert PaymentKit Handler to an MCP tool execute function.
 * Params should already include reserved keys merged into schema.
 */
export function toMcpToolHandler<Ctx extends ApiContext, Req, Res>(
  ctx: Ctx,
  handler: Handler<Ctx, Req, Res>
): (params: any, meta?: any) => Promise<any> {
  return async (params: any) => {
    const result = await handler(ctx, params as unknown as Req);
    return result; // MCP caller will embed into result.data by convention
  };
}
