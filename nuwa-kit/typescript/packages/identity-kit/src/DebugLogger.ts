/* eslint-disable no-console */
/*
 * Lightweight environment-agnostic debug logger.
 *
 * ‑ Works in both Node.js and browser.
 * ‑ Supports level filtering (debug | info | warn | error | silent).
 * ‑ Namespaced: each module/class can request its own logger via DebugLogger.get("MyModule").
 * ‑ Global level can be controlled at runtime via DebugLogger.setGlobalLevel() *or*
 *   environment variable NUWA_LOG_LEVEL (node) / window.__NUWA_LOG_LEVEL__ (browser).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

function detectInitialGlobalLevel(): LogLevel {
  // Node.js: use process.env if available
  if (typeof process !== 'undefined' && (process as any).env) {
    const envLevel = (process as any).env.NUWA_LOG_LEVEL as string | undefined;
    if (envLevel && envLevel in LEVEL_ORDER) return envLevel as LogLevel;
  }
  // Browser: allow runtime override via global variable
  if (typeof window !== 'undefined' && (window as any).__NUWA_LOG_LEVEL__) {
    const envLevel = (window as any).__NUWA_LOG_LEVEL__ as string;
    if (envLevel && envLevel in LEVEL_ORDER) return envLevel as LogLevel;
  }
  return 'info';
}

export class DebugLogger {
  // ---------------------------------------------------------------------------
  // Static section
  // ---------------------------------------------------------------------------
  private static globalLevel: LogLevel = detectInitialGlobalLevel();
  private static loggers = new Map<string, DebugLogger>();

  /** Acquire (or create) a logger for the given namespace. */
  static get(namespace: string): DebugLogger {
    if (!DebugLogger.loggers.has(namespace)) {
      DebugLogger.loggers.set(namespace, new DebugLogger(namespace));
    }
    return DebugLogger.loggers.get(namespace)!;
  }

  /** Override global log level at runtime. */
  static setGlobalLevel(level: LogLevel): void {
    DebugLogger.globalLevel = level;
    // Propagate to existing instances unless they explicitly override.
    for (const logger of DebugLogger.loggers.values()) {
      if (!logger.levelOverridden) {
        logger.level = level;
      }
    }
  }

  /** Read current global level. */
  static getGlobalLevel(): LogLevel {
    return DebugLogger.globalLevel;
  }

  // ---------------------------------------------------------------------------
  // Instance section
  // ---------------------------------------------------------------------------
  private level: LogLevel;
  private levelOverridden = false;

  private constructor(private namespace: string) {
    this.level = DebugLogger.globalLevel;
  }

  /** Override level for this logger only. */
  setLevel(level: LogLevel): void {
    this.level = level;
    this.levelOverridden = true;
  }

  // -------------------------------------------------------
  // Logging helpers
  // -------------------------------------------------------
  debug(...args: unknown[]): void {
    this._log('debug', args);
  }

  info(...args: unknown[]): void {
    this._log('info', args);
  }

  warn(...args: unknown[]): void {
    this._log('warn', args);
  }

  error(...args: unknown[]): void {
    this._log('error', args);
  }

  // prettier-ignore
  private _log(level: LogLevel, args: unknown[]): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) {
      return; // filtered out
    }

    const prefix = `[${this.namespace}]`;

    // Colorize in browser / modern terminal if desired; keep simple for now.
    switch (level) {
      case 'debug':
        console.debug(prefix, ...args);
        break;
      case 'info':
        console.info(prefix, ...args);
        break;
      case 'warn':
        console.warn(prefix, ...args);
        break;
      case 'error':
        console.error(prefix, ...args);
        break;
    }
  }
}
