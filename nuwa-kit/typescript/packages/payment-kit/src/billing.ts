/**
 * Billing system for @nuwa-ai/payment-kit
 * 
 * This module provides a flexible, configurable billing system for calculating
 * costs in payment channels. It supports multiple billing strategies and 
 * rule-based configuration via YAML files.
 * 
 * @example
 * ```typescript
 * import { BillingEngine, FileConfigLoader, BillingContext } from '@nuwa-ai/payment-kit/billing';
 * 
 * const loader = new FileConfigLoader('./config/billing');
 * const engine = new BillingEngine(loader);
 * 
 * const context: BillingContext = {
 *   serviceId: 'my-service',
 *   operation: 'upload',
 *   meta: { path: '/upload', method: 'POST' }
 * };
 * 
 * const cost = await engine.calcCost(context);
 * ```
 */

export * from './billing/index'; 