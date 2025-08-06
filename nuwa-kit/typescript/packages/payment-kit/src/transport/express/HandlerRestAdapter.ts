import { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Handler, ApiContext } from '../../types/api';
import { toApiError, createErrorResponse } from '../../errors';
import { sendJsonResponse } from '../../utils/json';

/**
 * Prepare request data from Express Request object
 * Extracted from PaymentKitExpressAdapter for reuse
 */
function prepareRequestData(req: Request): any {
  let baseData: any = {};

  // Extract from URL parameters
  if (req.params && Object.keys(req.params).length > 0) {
    baseData = { ...baseData, ...req.params };
  }

  // Extract from query parameters
  if (req.query && Object.keys(req.query).length > 0) {
    baseData = { ...baseData, ...req.query };
  }

  // Extract from request body
  if (req.body && Object.keys(req.body).length > 0) {
    baseData = { ...baseData, ...req.body };
  }

  // Add DID info if available (set by auth middleware)
  if ((req as any).didInfo) {
    baseData.didInfo = (req as any).didInfo;
  }

  return baseData;
}

/**
 * Convert PaymentKit Handler to Express RequestHandler
 * This adapter bridges the gap between PaymentKit's abstract Handler interface
 * and Express's concrete RequestHandler interface
 */
export function toExpressHandler<
  Ctx extends ApiContext,
  Req, 
  Res
>(ctx: Ctx, handler: Handler<Ctx, Req, Res>): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Prepare request data from Express request
      const requestData = prepareRequestData(req);

      // Execute PaymentKit handler with proper context and data
      const result = await handler(ctx, requestData as unknown as Req);

      // Send JSON response using unified utility
      sendJsonResponse(res, result);
    } catch (error) {
      // Convert to API error and pass to Express error handler
      const apiError = toApiError(error);
      const errorResponse = createErrorResponse(apiError);
      
      res.status(apiError.httpStatus || 500);
      sendJsonResponse(res, errorResponse);
    }
  };
}

/**
 * Register PaymentKit handlers directly with BillableRouter
 * This eliminates the need for dummyHandler and separate routing layers
 */
export function registerHandlersWithBillableRouter(
  handlerConfigs: Record<string, any>,
  context: ApiContext,
  billableRouter: any
): void {
  Object.entries(handlerConfigs).forEach(([handlerName, config]) => {
    // Now handlerName is a semantic name (e.g., 'recovery', 'commit')
    // and path is a property of config
    const { method, path, options, handler } = config;
    
    // Skip handlers without path (they're not REST endpoints)
    if (!path) {
      console.log(`⏩ Skipped handler '${handlerName}': no REST path defined`);
      return;
    }
    
    // Convert PaymentKit Handler to Express RequestHandler
    const expressHandler = toExpressHandler(context, handler);
    
    // Get the HTTP method in lowercase for BillableRouter
    const httpMethod = method || 'GET'; // Default to GET if not specified
    const methodName = httpMethod.toLowerCase() as 
      | 'get' | 'post' | 'put' | 'delete' | 'patch';
    
    // Validate method is supported
    if (!billableRouter[methodName]) {
      throw new Error(`Unsupported HTTP method: ${httpMethod}`);
    }
    
    // Register directly with BillableRouter using the public API
    // Use handlerName as ruleId for clearer billing rule identification
    billableRouter[methodName](path, options, expressHandler, handlerName);
    
    console.log(`📝 Registered handler '${handlerName}': ${httpMethod.toUpperCase()} ${path} with options:`, options);
  });
}