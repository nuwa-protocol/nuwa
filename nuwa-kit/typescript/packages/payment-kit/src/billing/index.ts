/**
 * Payment-Kit – Billing module public surface
 *
 * This file now exposes *both* the legacy Billing V1 APIs and the new Billing
 * V2 refactor side-by-side to allow incremental migration.
 */

// ──────────────────────
// Stateless core (V2)
// ──────────────────────
export * from './core/types';
export { findRule } from './core/rule-matcher';
export {
  register as registerStrategy,
  getStrategy as getRegisteredStrategy,
} from './core/strategy-registry';

// Built-in strategies self-register on import
export * from './strategies';
export * from './rate';
