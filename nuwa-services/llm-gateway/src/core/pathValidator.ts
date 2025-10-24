import { Request } from 'express';
import { ProviderConfig } from '../providers/LLMProvider.js';

/**
 * Path validation result
 */
export interface PathValidationResult {
  path: string;
  error?: string;
}

/**
 * Handles path validation and security checks for provider requests
 * Separated from main request handling for better testability
 */
export class PathValidator {
  /**
   * Extract and validate the upstream path from the request path
   * New logic: /:provider/$path → provider_url/$path (with security validation)
   * @param req Express request object
   * @param providerName Name of the provider
   * @param providerConfig Provider configuration for validation
   * @returns Object with path and validation result
   */
  static validatePath(req: Request, providerName: string, providerConfig: ProviderConfig): PathValidationResult {
    const fullPath = req.path;
    
    if (!providerConfig) {
      return { 
        path: '', 
        error: `Provider '${providerName}' not found in registry` 
      };
    }
    
    let extractedPath: string;
    
    // Primary method: manual extraction for provider routes (/:provider/$path)
    if (fullPath.startsWith(`/${providerName}/`)) {
      const expectedPrefix = `/${providerName}`;
      const remainingPath = fullPath.substring(expectedPrefix.length);
      extractedPath = remainingPath.startsWith('/') ? remainingPath : '/' + remainingPath;
    }
    // Fallback: try Express params if available
    else if ((req as any).params && typeof (req as any).params[0] === 'string') {
      const wildcardPath = (req as any).params[0];
      extractedPath = wildcardPath.startsWith('/') ? wildcardPath : '/' + wildcardPath;
    }
    // Unexpected path format
    else {
      console.warn(`Unexpected path format: ${fullPath} for provider: ${providerName}`);
      extractedPath = fullPath;
    }
    
    // Clean up any double slashes
    extractedPath = extractedPath.replace(/\/+/g, '/');
    
    // Validate path against allowed paths
    if (!this.isPathAllowed(extractedPath, providerConfig.allowedPaths)) {
      const errorMsg = `Path '${extractedPath}' is not allowed for provider '${providerName}'. Allowed paths: ${providerConfig.allowedPaths.join(', ')}`;
      return { 
        path: extractedPath, 
        error: errorMsg
      };
    }
    
    return { path: extractedPath };
  }

  /**
   * Check if a path is allowed for a provider
   * @param path The path to check
   * @param allowedPaths Array of allowed path patterns
   * @returns true if path is allowed
   */
  static isPathAllowed(path: string, allowedPaths: string[]): boolean {
    // Normalize path: remove duplicate slashes and ensure it starts with /
    const normalizedPath = ('/' + path).replace(/\/+/g, '/');
    
    // Security checks: block dangerous patterns
    const dangerousPatterns = [
      /\.\./,           // Directory traversal
      /\/\.\//,         // Current directory reference
      /\/\/+/,          // Multiple consecutive slashes (after normalization)
      /%2e%2e/i,        // URL-encoded directory traversal
      /%2f/i,           // URL-encoded slash
      /[<>"|*?]/,       // Invalid filename characters
      /[\x00-\x1f]/,    // Control characters
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(normalizedPath)) {
        console.warn(`Blocked dangerous path pattern: ${normalizedPath}`);
        return false;
      }
    }
    
    // Check against allowed paths
    return allowedPaths.some(allowedPath => {
      // Normalize allowed path as well
      const normalizedAllowed = ('/' + allowedPath).replace(/\/+/g, '/');
      
      // Support exact match and wildcard patterns
      if (normalizedAllowed.endsWith('*')) {
        const prefix = normalizedAllowed.slice(0, -1);
        return normalizedPath.startsWith(prefix);
      } else {
        return normalizedPath === normalizedAllowed;
      }
    });
  }

  /**
   * Validate multiple paths at once (useful for testing)
   * @param paths Array of paths to validate
   * @param allowedPaths Array of allowed path patterns
   * @returns Array of validation results
   */
  static validatePaths(paths: string[], allowedPaths: string[]): Array<{ path: string; allowed: boolean }> {
    return paths.map(path => ({
      path,
      allowed: this.isPathAllowed(path, allowedPaths)
    }));
  }

  /**
   * Get normalized path (useful for testing and debugging)
   * @param path Raw path
   * @returns Normalized path
   */
  static normalizePath(path: string): string {
    return ('/' + path).replace(/\/+/g, '/');
  }

  /**
   * Check if path contains dangerous patterns (useful for testing)
   * @param path Path to check
   * @returns true if path contains dangerous patterns
   */
  static hasDangerousPatterns(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    
    const dangerousPatterns = [
      /\.\./,           // Directory traversal
      /\/\.\//,         // Current directory reference
      /\/\/+/,          // Multiple consecutive slashes (after normalization)
      /%2e%2e/i,        // URL-encoded directory traversal
      /%2f/i,           // URL-encoded slash
      /[<>"|*?]/,       // Invalid filename characters
      /[\x00-\x1f]/,    // Control characters
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(normalizedPath));
  }
}
