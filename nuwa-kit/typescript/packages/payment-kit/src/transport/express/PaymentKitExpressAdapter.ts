import { Router } from 'express';
import type { ApiContext } from '../../types/api';
import type { ApiHandlerConfig } from '../../api';
import type { BillableRouter } from './BillableRouter';
import { registerHandlersWithBillableRouter } from './HandlerRestAdapter';

/**
 * Express-specific adapter that registers PaymentKit handlers with BillableRouter
 * This eliminates the need for dummyHandler and separate routing layers
 */
export class PaymentKitExpressAdapter {
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
    
    this.setupRoutes();
  }

  /**
   * Get the Express router from BillableRouter
   * All routes are now registered directly with BillableRouter
   */
  getRouter(): Router {
    return this.billableRouter.router;
  }

  /**
   * Set up all routes by registering handlers directly with BillableRouter
   * This ensures billing rules and Express routes are created together
   */
  private setupRoutes(): void {
    registerHandlersWithBillableRouter(
      this.handlerConfigs,
      this.context,
      this.billableRouter
    );
  }
}

/**
 * Factory function to create Express adapter
 * Returns the BillableRouter's router with all handlers registered
 */
export function createExpressAdapter(
  handlerConfigs: Record<string, ApiHandlerConfig>,
  context: ApiContext,
  billableRouter: BillableRouter
): Router {
  const adapter = new PaymentKitExpressAdapter(handlerConfigs, context, billableRouter);
  return adapter.getRouter();
}