export { BaseStrategy } from './base';
import { PerRequestStrategy, PerRequestConfig } from './perRequest';
import { PerTokenStrategy, PerTokenConfig } from './perToken';
import { FinalCostStrategy, FinalCostConfig } from './finalCost';
import { register as registerStrategy } from '../core/strategy-registry';

export { PerRequestStrategy, PerRequestConfig, PerTokenStrategy, PerTokenConfig };
export { FinalCostStrategy, FinalCostConfig };

// Explicit registration API to avoid side-effect imports
export function registerBuiltinStrategies(): void {
  registerStrategy('PerRequest', cfg => new PerRequestStrategy(cfg as any));
  registerStrategy('PerToken', cfg => new PerTokenStrategy(cfg as any));
  registerStrategy('FinalCost', cfg => new FinalCostStrategy(cfg as any));
}
