export { BaseStrategy } from './base';
import { PerRequestStrategy, PerRequestConfig } from './perRequest';
import { PerTokenStrategy, PerTokenConfig } from './perToken';

export { PerRequestStrategy, PerRequestConfig, PerTokenStrategy, PerTokenConfig };

// Explicit registration API to avoid side-effect imports
export function registerBuiltinStrategies(): void {
  // Use dynamic import/require to avoid triggering module side effects at import time
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { register: registerStrategy } = require('../core/strategy-registry') as typeof import('../core/strategy-registry');
  registerStrategy('PerRequest', (cfg) => new PerRequestStrategy(cfg as any));
  registerStrategy('PerToken', (cfg) => new PerTokenStrategy(cfg as any));
}
