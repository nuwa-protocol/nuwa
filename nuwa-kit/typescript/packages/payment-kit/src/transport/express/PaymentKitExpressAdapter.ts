import { Router, Request, Response, NextFunction } from 'express';
import type { Handler, ApiContext } from '../../types/api';
import { toApiError, createErrorResponse } from '../../errors';
import type { BillableRouter, RouteOptions } from './BillableRouter';

/**
 * Express-specific adapter that mounts API handlers to Express router
 */
export class PaymentKitExpressAdapter {
  private router: Router;
  private handlers: Record<string, Handler<ApiContext, any, any>>;
  private context: ApiContext;
  private billableRouter: BillableRouter;

  constructor(
    handlers: Record<string, Handler<ApiContext, any, any>>,
    context: ApiContext,
    billableRouter: BillableRouter
  ) {
    this.handlers = handlers;
    this.context = context;
    this.billableRouter = billableRouter;
    this.router = Router();
    
    this.setupRoutes();
  }

  /**
   * Get the Express router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Set up all routes
   */
  private setupRoutes(): void {
    Object.entries(this.handlers).forEach(([key, handler]) => {
      const [method, path] = key.split(' ', 2);
      
      if (!method || !path) {
        throw new Error(`Invalid route key format: ${key}. Expected "METHOD /path"`);
      }

      // Determine route options based on the handler type
      const routeOptions = this.getRouteOptions(key, path);
      
      // Register the route with BillableRouter for billing rules
      this.registerBillingRule(method, path, routeOptions, key);
      
      // Mount the handler on Express router
      this.mountHandler(method, path, handler, key);
    });
  }

  /**
   * Get route options based on handler type
   */
  private getRouteOptions(key: string, path: string): RouteOptions {
    // Price endpoint is free and public
    if (key === 'GET /price') {
      return { pricing: '0', authRequired: false };
    }
    
    // Admin health is free and public
    if (key === 'GET /admin/health') {
      return { pricing: '0', authRequired: false };
    }
    
    // Other admin endpoints are free but admin-only
    if (path.startsWith('/admin/')) {
      return { pricing: '0', adminOnly: true };
    }
    
    // Recovery and commit endpoints are free but require auth
    if (key === 'GET /recovery' || key === 'POST /commit') {
      return { pricing: '0', authRequired: true };
    }
    
    // Default: free and no auth required
    return { pricing: '0', authRequired: false };
  }

  /**
   * Register billing rule for the route
   */
  private registerBillingRule(method: string, path: string, options: RouteOptions, ruleId: string): void {
    // Use the billable router's register method to add billing rules
    const routerMethod = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
    
    // Create a dummy handler for billing registration
    const dummyHandler = (req: Request, res: Response) => {
      // This should never be called as we handle routing separately
      res.status(500).json({ error: 'Internal routing error' });
    };
    
    if (this.billableRouter[routerMethod]) {
      this.billableRouter[routerMethod](path, options, dummyHandler, ruleId);
    }
  }

  /**
   * Mount handler on Express router
   */
  private mountHandler(method: string, path: string, handler: Handler<ApiContext, any, any>, key: string): void {
    const routerMethod = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
    
    if (!this.router[routerMethod]) {
      throw new Error(`Unsupported HTTP method: ${method}`);
    }

    this.router[routerMethod](path, async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Prepare request data for handler
        const requestData = this.prepareRequestData(req, key);
        
        // Call the handler
        const result = await handler(this.context, requestData);
        
        // Send successful response
        res.json(result);
      } catch (error) {
        // Convert error to standard API error format
        const apiError = toApiError(error);
        const errorResponse = createErrorResponse(apiError);
        
        // Set appropriate HTTP status
        const statusCode = apiError.httpStatus || 500;
        res.status(statusCode).json(errorResponse);
      }
    });
  }

  /**
   * Prepare request data for handler
   */
  private prepareRequestData(req: Request, key: string): any {
    const baseData = {
      ...req.query,
      ...req.body,
      params: req.params
    };

    // Add DID info if available (set by authentication middleware)
    if ((req as any).didInfo) {
      baseData.didInfo = (req as any).didInfo;
    }

    // Handle specific route parameter extraction
    if (key.includes(':channelId')) {
      baseData.channelId = req.params.channelId;
    }
    
    if (key.includes(':nonce')) {
      baseData.nonce = req.params.nonce;
    }

    // For query parameters like maxAge in cleanup endpoint
    if (req.query.maxAge) {
      baseData.maxAge = parseInt(req.query.maxAge as string);
    }

    return baseData;
  }
}

/**
 * Factory function to create Express adapter
 */
export function createExpressAdapter(
  handlers: Record<string, Handler<ApiContext, any, any>>,
  context: ApiContext,
  billableRouter: BillableRouter
): Router {
  const adapter = new PaymentKitExpressAdapter(handlers, context, billableRouter);
  return adapter.getRouter();
}