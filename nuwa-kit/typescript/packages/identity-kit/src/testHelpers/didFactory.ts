import { Secp256k1Keypair, Ed25519Keypair } from '@roochnetwork/rooch-sdk';
import { KeyType } from '../types/crypto';
import { KeyManager } from '../keys/KeyManager';
import { MemoryKeyStore } from '../keys/KeyStore';
import { DidAccountSigner } from '../signers/didAccountSigner';
import { DIDCreationRequest } from '../vdr/types';
import { MultibaseCodec, DidKeyCodec } from '../multibase';
import { CryptoUtils } from '../crypto';
import { IdentityKit } from '../IdentityKit';
import { 
  CreateSelfDidResult, 
  CreateSelfDidOptions,
  CreateCadopDidOptions 
} from './types';
import { CadopServiceType } from '../CadopIdentityKit';

// Forward declaration to avoid circular import
interface TestEnv {
  rpcUrl: string;
  network: string;
  vdrRegistry: any;
  roochVDR: any;
  fundAccount(address: string, amount?: bigint): Promise<void>;
}

/**
 * Create a self-managed DID by calling the on-chain create_did_object_for_self function
 */
export async function createSelfDid(
  env: TestEnv, 
  options: CreateSelfDidOptions = {}
): Promise<CreateSelfDidResult> {
  const {
    keyType = KeyType.SECP256K1,
    keyFragment = 'account-key',
    skipFunding = true
  } = options;

  // Generate keypair based on type
  let roochKeyPair;
  if (keyType === KeyType.SECP256K1) {
    roochKeyPair = Secp256k1Keypair.generate();
  } else if (keyType === KeyType.ED25519) {
    roochKeyPair = Ed25519Keypair.generate();
  } else {
    throw new Error(`Unsupported key type for Rooch: ${keyType}`);
  }

  const address = roochKeyPair.getRoochAddress();

  // Fund the account if needed
  if (!skipFunding) {
    await env.fundAccount(address.toBech32Address());
  }  

  // Create creation request
  const publicKeyMultibase = MultibaseCodec.encodeBase58btc(roochKeyPair.getPublicKey().toBytes());
  const creationRequest: DIDCreationRequest = {
    publicKeyMultibase,
    keyType: keyType,
    initialRelationships: ['authentication', 'assertionMethod', 'capabilityInvocation', 'capabilityDelegation']
  };

  // Create DID on-chain using VDR
  const result = await env.vdrRegistry.createDID('rooch', creationRequest, {
    signer: roochKeyPair
  });

  if (!result.success || !result.didDocument) {
    throw new Error(`Failed to create DID on-chain: ${result.error || 'Unknown error'}`);
  }

  const did = result.didDocument.id;

  // Create KeyManager and import the keypair
  const keyStore = new MemoryKeyStore();
  const keyManager = KeyManager.createEmpty(did, keyStore);
  const keyId = await keyManager.importRoochKeyPair(keyFragment, roochKeyPair);

  // Create signer
  const signer = await DidAccountSigner.create(keyManager, keyId);

  return {
    did,
    vmIdFragment: keyFragment,
    keyManager,
    signer
  };
}

/**
 * Create a custodian DID with CADOP service
 */
export async function createCadopCustodian(
  env: TestEnv,
  options: Pick<CreateCadopDidOptions, 'custodianKeyType' | 'skipFunding'> = {}
): Promise<CreateSelfDidResult> {
  const {
    custodianKeyType = KeyType.SECP256K1,
    skipFunding = false
  } = options;

  // Create custodian DID 
  const custodian = await createSelfDid(env, {
    keyType: custodianKeyType,
    skipFunding
  });

  // Add CADOP service using IdentityKit
  const custodianKit = await IdentityKit.fromExistingDID(custodian.did, custodian.signer);

  // Add CADOP custodian service to custodian DID
  const custodianAuthMethods = custodianKit.getDIDDocument().verificationMethod || [];
  const custodianAuthMethod = custodianAuthMethods[0];
  
  if (!custodianAuthMethod) {
    throw new Error('No authentication method found in custodian DID document');
  }
  
  await custodianKit.addService({
    idFragment: 'cadop-custodian',
    type: CadopServiceType.CUSTODIAN,
    serviceEndpoint: 'https://example.com/cadop',
    additionalProperties: {
      custodianPublicKey: custodianAuthMethod.publicKeyMultibase,
      custodianServiceVMType: custodianAuthMethod.type
    }
  });

  return custodian;
}

/**
 * Create a user DID via CADOP protocol using an existing custodian
 */
export async function createDidViaCadop(
  env: TestEnv,
  custodian: CreateSelfDidResult,
  options: Pick<CreateCadopDidOptions, 'userKeyType'> = {}
): Promise<CreateSelfDidResult> {
  const {
    userKeyType = KeyType.ED25519
  } = options;

  const custodianKit = await IdentityKit.fromExistingDID(custodian.did, custodian.signer);

  // Generate user's did:key
  const userKeyPair = await CryptoUtils.generateKeyPair(userKeyType);
  const userDidKey = DidKeyCodec.generateDidKey(userKeyPair.publicKey, userKeyType);

  // Get custodian's authentication method for service key
  const custodianAuthMethod = custodianKit.getDIDDocument().verificationMethod?.[0];
  if (!custodianAuthMethod) {
    throw new Error('No authentication method found in custodian DID document');
  }

  // Create user DID via CADOP
  const cadopResult = await env.vdrRegistry.createDIDViaCADOP('rooch', {
    userDidKey,
    custodianServicePublicKey: custodianAuthMethod.publicKeyMultibase!,
    custodianServiceVMType: custodianAuthMethod.type
  }, {
    signer: custodian.signer
  });

  if (!cadopResult.success || !cadopResult.didDocument) {
    throw new Error(`Failed to create user DID via CADOP: ${cadopResult.error || 'Unknown error'}`);
  } 

  const userDid = cadopResult.didDocument.id;

  // Create user's KeyManager with the did:key keypair
  const userKeyStore = new MemoryKeyStore();
  const userKeyManager = KeyManager.createEmpty(userDid, userKeyStore);
  const userKeyFragment = 'account-key';
  const userKeyId = await userKeyManager.importKeyPair(
    userKeyFragment,
    userKeyPair,
    userKeyType
  );

  // Create user signer
  const userSigner = await DidAccountSigner.create(userKeyManager, userKeyId);

  return {
    did: userDid,
    vmIdFragment: userKeyFragment,
    keyManager: userKeyManager,
    signer: userSigner,
  };
}

 