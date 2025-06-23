import { CryptoProvider, CryptoProviderFactory } from './providers';
import { Ed25519Provider } from './providers/ed25519';
import { Secp256k1Provider } from './providers/secp256k1';
import { EcdsaR1Provider } from './providers/ecdsa_r1';
import { KEY_TYPE, KeyType } from '../types';

export class DefaultCryptoProviderFactory implements CryptoProviderFactory {
  private providers: Map<KeyType, CryptoProvider>;

  constructor() {
    this.providers = new Map();
    this.providers.set(KEY_TYPE.ED25519, new Ed25519Provider());
    this.providers.set(KEY_TYPE.SECP256K1, new Secp256k1Provider());
    this.providers.set(KEY_TYPE.ECDSAR1, new EcdsaR1Provider());
  }

  createProvider(keyType: KeyType): CryptoProvider {
    const provider = this.providers.get(keyType);
    if (!provider) {
      throw new Error(`No provider available for key type: ${keyType}`);
    }
    return provider;
  }

  supports(keyType: KeyType): boolean {
    return this.providers.has(keyType);
  }
}

/**
 * Default instance of the crypto provider factory
 */
export const defaultCryptoProviderFactory = new DefaultCryptoProviderFactory();
