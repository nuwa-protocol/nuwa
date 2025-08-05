import { register as registerStrategy } from '../core/strategy-registry';

export { BaseStrategy } from './base';
import { PerRequestStrategy, PerRequestConfig } from './perRequest';
import { PerTokenStrategy, PerTokenConfig } from './perToken';

export { PerRequestStrategy, PerRequestConfig, PerTokenStrategy, PerTokenConfig };


// Side-effect registration of built-in strategies
registerStrategy('PerRequest', (cfg) => new PerRequestStrategy(cfg as any));
registerStrategy('PerToken', (cfg) => new PerTokenStrategy(cfg as any));
