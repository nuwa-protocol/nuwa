import {
  NIP1SignedObject,
  SignedData,
  DIDDocument,
  SignerInterface,
  DIDResolver,
} from '../../types';
import { canonicalize } from './utils';
import { CryptoUtils } from '../../crypto';
import { NonceStore, defaultNonceStore } from './nonceStore';
import { BaseMultibaseCodec } from '../../multibase';
import { Base64 } from '../../utils/base64';
import { Bytes } from '../../utils/bytes';

// Authorization scheme identifier for HTTP headers
const AUTH_SCHEME = 'DIDAuthV1';
// Prefix actually sent in the HTTP `Authorization` header, including trailing space
const HEADER_PREFIX = `${AUTH_SCHEME} `;
// Default domain separator used in hash/signature calculations (spec §2.2)
const DEFAULT_DOMAIN_SEPARATOR = `${AUTH_SCHEME}:`;

// Default maximum clock skew allowed for signature verification (spec §2.2)
const DEFAULT_MAX_CLOCK_SKEW = 300;

interface VerifyOptions {
  maxClockSkew?: number;
}

interface VerifyHeaderOptions extends VerifyOptions {
  nonceStore?: NonceStore;
}

export async function createSignature(
  payload: Omit<SignedData, 'nonce' | 'timestamp'>,
  signer: SignerInterface,
  keyId: string,
  opts: {
    didDocument?: DIDDocument;
    nonce?: string;
    timestamp?: number;
    domainSeparator?: string;
  } = {}
): Promise<NIP1SignedObject> {
  const signerDid = await signer.getDid();
  if (opts.didDocument) {
    if (opts.didDocument.id !== signerDid) {
      throw new Error(
        `DID document ID ${opts.didDocument.id} does not match signer DID ${signerDid}`
      );
    }
    const verificationMethod = opts.didDocument.verificationMethod?.find(vm => vm.id === keyId);
    if (!verificationMethod) {
      throw new Error(`Verification method for keyId ${keyId} not found in DID document.`);
    }
  }

  const signedData: SignedData = {
    ...payload,
    nonce: opts.nonce ?? crypto.randomUUID(),
    timestamp: opts.timestamp ?? Math.floor(Date.now() / 1000),
  } as SignedData;

  const canonicalData = canonicalize(signedData);
  const domainSeparator = opts.domainSeparator ?? DEFAULT_DOMAIN_SEPARATOR;
  const dataToSign = Bytes.stringToBytes(domainSeparator + canonicalData);

  const signatureValue = await signer.signWithKeyId(dataToSign, keyId);

  return {
    signed_data: signedData,
    signature: {
      signer_did: signerDid,
      key_id: keyId,
      value: signatureValue,
    },
  };
}

export function toAuthorizationHeader(obj: NIP1SignedObject): string {
  // prepare serializable clone with base64url signature
  const cloned = {
    signed_data: obj.signed_data,
    signature: {
      ...obj.signature,
      value: Base64.encode(obj.signature.value),
    },
  };
  const json = JSON.stringify(cloned);
  const b64url = Base64.encode(json);
  return `${HEADER_PREFIX}${b64url}`;
}

export async function verifySignature(
  signedObject: NIP1SignedObject,
  resolverOrDoc: DIDDocument | DIDResolver,
  opts: VerifyOptions = {}
): Promise<boolean> {
  const { signed_data, signature } = signedObject;

  const attemptVerify = async (didDoc: DIDDocument): Promise<boolean> => {
    // timestamp window
    const maxSkew = opts.maxClockSkew ?? DEFAULT_MAX_CLOCK_SKEW;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - signed_data.timestamp) > maxSkew) {
      return false;
    }

    if (didDoc.id !== signature.signer_did) {
      return false;
    }

    const verificationMethod = didDoc.verificationMethod?.find(vm => vm.id === signature.key_id);
    if (!verificationMethod) {
      return false;
    }

    console.log('verificationMethod', verificationMethod);

    let publicKeyMaterial: JsonWebKey | Uint8Array | null = null;
    if (verificationMethod.publicKeyJwk) {
      publicKeyMaterial = verificationMethod.publicKeyJwk;
    } else if (verificationMethod.publicKeyMultibase) {
      publicKeyMaterial = BaseMultibaseCodec.decodeBase58btc(verificationMethod.publicKeyMultibase);
    }
    if (!publicKeyMaterial) return false;

    const canonicalData = canonicalize(signed_data);
    const dataToVerify = Bytes.stringToBytes(DEFAULT_DOMAIN_SEPARATOR + canonicalData);

    return CryptoUtils.verify(
      dataToVerify,
      signature.value,
      publicKeyMaterial,
      verificationMethod.type
    );
  };

  if (typeof (resolverOrDoc as any).resolveDID === 'function') {
    const resolver = resolverOrDoc as DIDResolver;
    let doc = await resolver.resolveDID(signature.signer_did);
    if (doc && (await attemptVerify(doc))) {
      return true;
    }
    // fallback: force refresh once
    doc = await resolver.resolveDID(signature.signer_did, { forceRefresh: true });
    if (!doc) return false;
    return attemptVerify(doc);
  } else {
    return attemptVerify(resolverOrDoc as DIDDocument);
  }
}

export async function verifyAuthHeader(
  header: string,
  resolver: DIDResolver,
  opts: VerifyHeaderOptions = {}
): Promise<
  | {
      ok: true;
      signedObject: NIP1SignedObject;
    }
  | {
      ok: false;
      error: string;
    }
> {
  if (!header || !header.startsWith(HEADER_PREFIX)) {
    return { ok: false, error: 'Unsupported or missing Authorization header' };
  }
  const b64url = header.substring(HEADER_PREFIX.length).trim();
  let payloadStr: string;
  try {
    payloadStr = Bytes.bytesToString(Base64.decodeToBytes(b64url));
  } catch (e) {
    return { ok: false, error: 'Invalid base64 credentials' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(payloadStr);
  } catch (e) {
    return { ok: false, error: 'Invalid JSON in credentials' };
  }

  // restore signature.value Uint8Array
  if (!parsed?.signature?.value) {
    return { ok: false, error: 'Missing signature value' };
  }
  parsed.signature.value = Base64.decodeToBytes(parsed.signature.value);
  const signedObj = parsed as NIP1SignedObject;

  // basic replay protection: nonce & timestamp
  const store = opts.nonceStore ?? defaultNonceStore;
  const maxSkew = opts.maxClockSkew ?? DEFAULT_MAX_CLOCK_SKEW;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - signedObj.signed_data.timestamp) > maxSkew) {
    return { ok: false, error: 'Timestamp out of window' };
  }
  const ttlSeconds = maxSkew; // allow same as window
  const stored = await store.tryStoreNonce(
    signedObj.signature.signer_did,
    DEFAULT_DOMAIN_SEPARATOR,
    signedObj.signed_data.nonce,
    ttlSeconds
  );
  if (!stored) {
    return { ok: false, error: 'Nonce replayed' };
  }

  const ok = await verifySignature(signedObj, resolver, { maxClockSkew: maxSkew });
  if (ok) {
    return { ok: true, signedObject: signedObj };
  }
  return { ok: false, error: 'Signature verification failed' };
}

export default {
  createSignature,
  toAuthorizationHeader,
  verifySignature,
  verifyAuthHeader,
};
