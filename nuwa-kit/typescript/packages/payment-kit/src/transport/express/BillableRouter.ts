import express, { Router, RequestHandler } from 'express';
import { findRule as coreFindRule } from '../../billing/core/rule-matcher';
import type { BillingRule, StrategyConfig, RuleProvider } from '../../billing';

/**
 * Route options for registering routes with billing
 */
export interface RouteOptions {
  /**
   * Pricing strategy.
   * 0 / '0' means free (skip billing logic)
   */
  pricing: bigint | string | StrategyConfig;

  /**
   * Whether DID authentication is required.
   * Default rules:
   *   pricing == 0  → false
   *   pricing  > 0  → true
   * If developer explicitly sets false with pricing>0, framework will throw error during startup.
   */
  authRequired?: boolean;

  /**
   * Whether admin authorization is required (implies authRequired: true).
   * Admin routes require both DID authentication and admin permission check.
   */
  adminOnly?: boolean;
}

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
 */
export class BillableRouter implements RuleProvider {
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
      const pricing = typeof opts.defaultPricePicoUSD === 'string' ? BigInt(opts.defaultPricePicoUSD) : opts.defaultPricePicoUSD;
      const authRequired = pricing > 0n;
      const paymentRequired = pricing > 0n;
      
      this.rules.push({
        id: 'default-pricing',
        default: true,
        strategy: {
          type: 'PerRequest',
          price: opts.defaultPricePicoUSD.toString()
        },
        authRequired,
        adminOnly: false,
        paymentRequired
      });
    }
  }

  // ---------------------------------------------------------------------
  // Public helpers for HTTP verbs
  // ---------------------------------------------------------------------

  get(path: string, options: RouteOptions | bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    return this.register('get', path, options, handler, id);
  }

  post(path: string, options: RouteOptions | bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    return this.register('post', path, options, handler, id);
  }

  put(path: string, options: RouteOptions | bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    return this.register('put', path, options, handler, id);
  }

  delete(path: string, options: RouteOptions | bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    return this.register('delete', path, options, handler, id);
  }

  patch(path: string, options: RouteOptions | bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    return this.register('patch', path, options, handler, id);
  }

  /**
   * Access the collected billing rules (mainly for testing)
   */
  getRules(): BillingRule[] {
    return [...this.rules];
  }

  /**
   * Find a billing rule that matches the given HTTP method + path using the
   * shared core rule-matcher (single source of truth).
   */
  findRule(method: string, path: string): BillingRule | undefined {
    return coreFindRule({ method: method.toUpperCase(), path }, this.rules);
  }

  // ---------------------------------------------------------------------
  // Internal helper to collect rule + register to Express
  // ---------------------------------------------------------------------
  private register(method: string, path: string, options: RouteOptions | bigint | string | StrategyConfig, handler: RequestHandler, id?: string) {
    console.log(`🔧 Registering route: ${method.toUpperCase()} ${path} with options:`, options);
    
    // Normalize options to RouteOptions
    let routeOptions: RouteOptions;
    if (typeof options === 'object' && 'pricing' in options) {
      // It's already RouteOptions
      routeOptions = options as RouteOptions;
    } else {
      // Legacy usage: pricing only (bigint, string, or StrategyConfig)
      routeOptions = { pricing: options as (bigint | string | StrategyConfig) };
    }

    // Determine strategy config
    let strategy: StrategyConfig;
    if (typeof routeOptions.pricing === 'object' && 'type' in routeOptions.pricing) {
      // It's already a strategy config
      strategy = routeOptions.pricing;
    } else {
      // It's a fixed price, create PerRequest strategy
      strategy = {
        type: 'PerRequest',
        price: routeOptions.pricing.toString()
      };
    }

    // Validate and determine auth and payment requirements
    const adminOnly = routeOptions.adminOnly || false;
    let authRequired = routeOptions.authRequired;
    
    // Validation: adminOnly implies authRequired
    if (adminOnly && authRequired === false) {
      throw new Error(`Route ${method.toUpperCase()} ${path}: adminOnly requires authRequired to be true or undefined`);
    }
    
    // Auto-determine payment requirement based on pricing strategy
    const pricing = typeof routeOptions.pricing === 'string' ? BigInt(routeOptions.pricing) : routeOptions.pricing;
    let paymentRequired: boolean;
    if (typeof pricing === 'bigint') {
      // Fixed price: only require payment if price > 0
      paymentRequired = pricing > 0n;
    } else {
      // Dynamic strategy: always require payment
      paymentRequired = true;
    }
    
    // Determine final auth requirement
    if (authRequired === undefined) {
      if (adminOnly) {
        // Admin routes always require auth
        authRequired = true;
      } else {
        // Default behavior: payment requires auth
        if (paymentRequired) {
          authRequired = true;
        } else {
          // Free endpoints don't require auth by default
          authRequired = false;
        }
      }
    }

    // Collect billing rule
    const rule: BillingRule = {
      id: id || `${method}:${path}`,
      when: {
        path,
        method: method.toUpperCase()
      },
      strategy,
      authRequired,
      adminOnly,
      paymentRequired
    };
    
    console.log(`📝 Created rule:`, rule);
    
    // Insert rule with proper ordering:
    // 1. Specific rules (non-default) should be added in registration order
    // 2. Default rules should always be at the end
    if (rule.default) {
      // Keep default pricing rule at the end
      console.log(`📌 Adding default rule to end:`, rule.id);
      this.rules.push(rule);
    } else {
      // Find the position to insert: before the first default rule, or at the end
      const firstDefaultIndex = this.rules.findIndex(r => r.default);
      if (firstDefaultIndex >= 0) {
        // Insert before the first default rule
        console.log(`📌 Adding specific rule before default rules:`, rule.id);
        this.rules.splice(firstDefaultIndex, 0, rule);
      } else {
        // No default rules yet, add to the end
        console.log(`📌 Adding specific rule to end:`, rule.id);
        this.rules.push(rule);
      }
    }

    console.log(`📋 Total rules after registration: ${this.rules.length}`, this.rules.map(r => r.id));

    // Delegate to Express Router
    (this.router as any)[method](path, handler);
    return this;
  }
}

// Re-export express so consumers don’t have to import twice
export { express as _express }; 