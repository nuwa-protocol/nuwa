import { BillingRule } from './types';

/**
 * Pure functional implementation of rule matching used by all environments
 * (Express / Koa / Cloudflare Workers / …).
 *
 * The function iterates over the provided rule list and returns the **first**
 * rule that satisfies the matching conditions. If no rule matches it returns
 * `undefined`.
 */
export function findRule(
  meta: Record<string, any>,
  rules: BillingRule[],
): BillingRule | undefined {
  for (const rule of rules) {
    if (matchesRule(meta, rule)) {
      return rule;
    }
  }
  return undefined;
}

/**
 * Internal helper that determines whether a single rule applies to the given
 * request metadata.
 */
function matchesRule(meta: Record<string, any>, rule: BillingRule): boolean {
  // Catch-all default rule
  if (rule.default) {
    return true;
  }

  if (!rule.when) {
    return false;
  }

  const when = rule.when as Record<string, any>;

  // Path exact match
  if (when.path && meta.path !== when.path) {
    return false;
  }

  // Path regex match
  if (when.pathRegex) {
    const regex = new RegExp(when.pathRegex);
    if (!regex.test(meta.path || '')) {
      return false;
    }
  }

  // Model / method / assetId direct comparisons
  if (when.model && meta.model !== when.model) {
    return false;
  }
  if (when.method && meta.method !== when.method) {
    return false;
  }
  if (when.assetId && meta.assetId !== when.assetId) {
    return false;
  }

  // Fallback: check all remaining keys strictly equal
  for (const [key, value] of Object.entries(when)) {
    if (['path', 'pathRegex', 'model', 'method', 'assetId'].includes(key)) {
      continue; // already handled above
    }

    if (meta[key] !== value) {
      return false;
    }
  }

  return true;
}
