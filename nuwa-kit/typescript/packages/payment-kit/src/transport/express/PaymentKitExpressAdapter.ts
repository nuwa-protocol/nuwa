import { Router, Request, Response, NextFunction } from 'express';
import type { Handler, ApiContext } from '../../types/api';
import type { ApiHandlerConfig } from '../../api';
import { toApiError, createErrorResponse } from '../../errors';
import type { BillableRouter, RouteOptions } from './BillableRouter';

/**
 * Express-specific adapter that mounts API handlers to Express router
 */
export class PaymentKitExpressAdapter {
  private router: Router;
  private handlerConfigs: Record<string, ApiHandlerConfig>;
  private context: ApiContext;
  private billableRouter: BillableRouter;

  constructor(
    handlerConfigs: Record<string, ApiHandlerConfig>,
    context: ApiContext,
    billableRouter: BillableRouter
  ) {
    this.handlerConfigs = handlerConfigs;
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
    Object.entries(this.handlerConfigs).forEach(([path, config]) => {
      // Use suggested method from config, default to POST if not specified
      const method = config.method || 'POST';
      
      // Use the route options from configuration
      const routeOptions = config.options;
      
      // Register the route with BillableRouter for billing rules
      this.registerBillingRule(method, path, routeOptions, path);
      
      // Mount the handler on Express router
      this.mountHandler(method, path, config.handler, path);
    });
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
        const requestData = this.prepareRequestData(req, path);
        
        // Call the handler
        const result = await handler(this.context, requestData);
        
        // Send successful response with BigInt handling
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(result, (key, value) => {
          return typeof value === 'bigint' ? value.toString() : value;
        }));
      } catch (error) {
        // Convert error to standard API error format
        const apiError = toApiError(error);
        const errorResponse = createErrorResponse(apiError);
        
        // Set appropriate HTTP status and send error response with BigInt handling
        const statusCode = apiError.httpStatus || 500;
        res.status(statusCode);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(errorResponse, (key, value) => {
          return typeof value === 'bigint' ? value.toString() : value;
        }));
      }
    });
  }

  /**
   * Prepare request data for handler
   */
  private prepareRequestData(req: Request, path: string): any {
    const baseData = {
      ...req.query,
      ...req.body,
      params: req.params
    };

    // Add DID info if available (set by authentication middleware)
    if ((req as any).didInfo) {
      baseData.didInfo = (req as any).didInfo;
    }

    // Handle specific query parameters
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
  handlerConfigs: Record<string, ApiHandlerConfig>,
  context: ApiContext,
  billableRouter: BillableRouter
): Router {
  const adapter = new PaymentKitExpressAdapter(handlerConfigs, context, billableRouter);
  return adapter.getRouter();
}