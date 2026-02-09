import { CryptoUtils } from '../crypto';
import { MultibaseCodec } from '../multibase';
import { KeyType } from '../types/crypto';
import { AgentKeyMaterial } from './types';

export async function createAgentKeyMaterial(idFragment: string): Promise<AgentKeyMaterial> {
  const { publicKey, privateKey } = await CryptoUtils.generateKeyPair(KeyType.ED25519);
  return {
    keyType: KeyType.ED25519,
    publicKeyMultibase: MultibaseCodec.encodeBase58btc(publicKey),
    privateKeyMultibase: MultibaseCodec.encodeBase58btc(privateKey),
    idFragment,
    createdAt: new Date().toISOString(),
  };
}

