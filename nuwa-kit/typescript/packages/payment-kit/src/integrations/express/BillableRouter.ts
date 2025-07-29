import express, { Router, RequestHandler } from 'express';
import type { BillingRule, BillingConfig, ConfigLoader, StrategyConfig } from '../../billing/types';

/**
 * Options when creating a BillableRouter
 */
export interface BillableRouterOptions {
  /** Service identifier used in billing config */
  serviceId: string;
  /** Default price (picoUSD) when no rule matches. Optional */
  defaultPricePicoUSD?: bigint | string;
  /** Config version – defaults to 1 */
  version?: number;
}

/**
 * BillableRouter helps you declare Express routes and their pricing in one place.
 *
 * Example:
 * ```ts
 * const br = new BillableRouter({ serviceId: 'echo-service' });
 * br.get('/v1/echo', 1_000_000_000n, (req,res)=> res.json({ ok:true }));
 * app.use(br.router);
 * const billingEngine = new UsdBillingEngine(br.getConfigLoader(), rateProvider);
 * ```
 */
export class BillableRouter {
  /** The underlying Express Router you should mount into your app */
  public readonly router: Router;
  /** Collected billing rules */
  private readonly rules: BillingRule[] = [];
  private readonly opts: BillableRouterOptions;

  constructor(opts: BillableRouterOptions) {
    this.opts = { version: 1, ...opts };
    this.router = express.Router();

    // Add default rule if provided
    if (opts.defaultPricePicoUSD !== undefined) {
      this.rules.push({
        id: 'default-pricing',
        default: true,
        strategy: {
          type: 'PerRequest',
          price: opts.defaultPricePicoUSD.toString()
        }
      });
    }
  }

  // ---------------------------------------------------------------------
  // Public helpers for HTTP verbs
  // ---------------------------------------------------------------------

  get(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    return this.register('get', path, pricing, handler, id);
  }

  post(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    return this.register('post', path, pricing, handler, id);
  }

  put(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    return this.register('put', path, pricing, handler, id);
  }

  delete(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    return this.register('delete', path, pricing, handler, id);
  }

  patch(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    return this.register('patch', path, pricing, handler, id);
  }

  /**
   * Access the collected billing rules (mainly for testing)
   */
  getRules(): BillingRule[] {
    return [...this.rules];
  }

  /**
   * Returns a ConfigLoader instance that feeds the collected rules to BillingEngine.
   */
  getConfigLoader(): ConfigLoader {
    const cfg: BillingConfig = {
      version: this.opts.version ?? 1,
      serviceId: this.opts.serviceId,
      rules: [...this.rules]
    };
    return {
      async load(serviceId: string): Promise<BillingConfig> {
        if (serviceId !== cfg.serviceId) {
          throw new Error(`BillableRouter config loader mismatch: expected ${cfg.serviceId}, got ${serviceId}`);
        }
        return cfg;
      }
    };
  }

  // ---------------------------------------------------------------------
  // Internal helper to collect rule + register to Express
  // ---------------------------------------------------------------------
  private register(method: string, path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    // Determine strategy config
    let strategy: StrategyConfig;
    if (typeof pricing === 'object' && 'type' in pricing) {
      // It's already a strategy config
      strategy = pricing;
    } else {
      // It's a fixed price, create PerRequest strategy
      strategy = {
        type: 'PerRequest',
        price: pricing.toString()
      };
    }

    // Collect billing rule
    const rule: BillingRule = {
      id: id || `${method}:${path}`,
      when: {
        path,
        method: method.toUpperCase()
      },
      strategy
    };
    // Insert rule so that default rules are evaluated last.
    // Specific rules (non-default) should take precedence over the catch-all default rule.
    if (rule.default) {
      // Keep default pricing rule at the end
      this.rules.push(rule);
    } else {
      // Place specific rules before default so they match first
      this.rules.unshift(rule);
    }

    // Delegate to Express Router
    (this.router as any)[method](path, handler);
    return this;
  }
}

// Re-export express so consumers don’t have to import twice
export { express as _express }; 