import { BillingRule } from './types';

// Cache for compiled regex patterns to improve performance
const regexCache = new Map<string, RegExp>();

/**
 * Pure functional implementation of rule matching used by all environments
 * (Express / Koa / Cloudflare Workers / …).
 *
 * The function iterates over the provided rule list and returns the **first**
 * rule that satisfies the matching conditions. If no rule matches it returns
 * `undefined`.
 */
export function findRule(meta: Record<string, any>, rules: BillingRule[]): BillingRule | undefined {
  for (const rule of rules) {
    if (matchesRule(meta, rule)) {
      return rule;
    }
  }
  return undefined;
}

/**
 * Get or create a cached RegExp object for the given pattern
 */
function getCachedRegex(pattern: string): RegExp {
  let regex = regexCache.get(pattern);
  if (!regex) {
    regex = new RegExp(pattern);
    // Limit cache size to prevent memory leaks
    if (regexCache.size >= 100) {
      // Remove oldest entry when cache is full
      const firstKey = regexCache.keys().next().value;
      if (firstKey) {
        regexCache.delete(firstKey);
      }
    }
    regexCache.set(pattern, regex);
  }
  return regex;
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

  // Path regex match (optimized with caching)
  if (when.pathRegex) {
    // Check if we have an original RegExp with flags
    const originalRegex = (rule as any).originalRegex;
    if (originalRegex && originalRegex instanceof RegExp) {
      if (!originalRegex.test(meta.path || '')) {
        return false;
      }
    } else {
      const regex = getCachedRegex(when.pathRegex);
      if (!regex.test(meta.path || '')) {
        return false;
      }
    }
  }

  if (when.method && meta.method !== when.method) {
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
