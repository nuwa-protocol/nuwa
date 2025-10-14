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
 * @throws {Error} If the pattern is not a valid regular expression
 */
function getCachedRegex(pattern: string): RegExp {
  let regex = regexCache.get(pattern);
  if (!regex) {
    try {
      regex = new RegExp(pattern);
    } catch (error) {
      // Provide a more user-friendly error message for invalid regex patterns
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Invalid regular expression pattern "${pattern}": ${errorMessage}. ` +
          'Please check your billing rule configuration and ensure the pathRegex field contains a valid regular expression.'
      );
    }

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
    try {
      // Check if we have an original RegExp with flags
      if (rule.originalRegex && rule.originalRegex instanceof RegExp) {
        if (!rule.originalRegex.test(meta.path || '')) {
          return false;
        }
      } else {
        const regex = getCachedRegex(when.pathRegex);
        if (!regex.test(meta.path || '')) {
          return false;
        }
      }
    } catch (error) {
      // If regex compilation fails, log the error and treat as non-matching
      // This prevents invalid regex patterns from crashing the application
      console.error(`[BillingRule] Failed to compile regex pattern for rule "${rule.id}":`, error);
      return false;
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
