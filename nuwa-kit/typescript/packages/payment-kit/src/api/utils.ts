import type { Handler, ApiContext } from '../types/api';
import type { RouteOptions } from '../transport/express/BillableRouter';
import type { z } from 'zod';

/**
 * Pair of Zod schemas for request / response.
 */
export type ZodSchemaPair<Req, Res> = {
  request: z.ZodType<Req, any, any>;
  response: z.ZodType<Res, any, any>;
};

/**
 * Wrap a business handler with runtime Zod validation.
 *
 * 1. Validate the raw request against the provided request schema. If parsing
 *    fails Zod will throw a descriptive error that will propagate up the call
 *    chain.
 * 2. Delegate to the underlying business handler.
 * 3. (Optional – not yet implemented) Validate the handler's response against
 *    the response schema. This step will be enabled once all handlers return
 *    plain data objects instead of the ApiResponse envelope.
 */
export function createValidatedHandler<Req, Res>(params: {
  schema: ZodSchemaPair<Req, Res>;
  handler: Handler<ApiContext, Req, Res>;
}): Handler<ApiContext, Req, Res> {
  const { schema, handler } = params;

  return async (ctx, rawReq) => {
    // 1️⃣ Validate & transform the incoming request.
    const req = schema.request.parse(rawReq);

    // 2️⃣ Execute business logic.
    const rawRes = await handler(ctx, req);

    // TODO: 3️⃣ Response validation once migration is complete.
    return rawRes;
  };
}
