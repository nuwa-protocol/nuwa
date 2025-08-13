import { DIDDocument, DIDResolver } from '../../types';
import { SignerInterface } from '../../signers/types';
import { NIP1SignedObject, SignedData } from '../types';
import { canonicalize } from './utils';
import { CryptoUtils } from '../../crypto';
import { NonceStore, defaultNonceStore } from './nonceStore';
import { MultibaseCodec } from '../../multibase';
import { Bytes } from '../../utils/bytes';

// Authorization scheme identifier for HTTP headers
const AUTH_SCHEME = 'DIDAuthV1';
// Prefix actually sent in the HTTP `Authorization` header, including trailing space
const HEADER_PREFIX = `${AUTH_SCHEME} `;
// Default domain separator used in hash/signature calculations (spec §2.2)
const DEFAULT_DOMAIN_SEPARATOR = `${AUTH_SCHEME}:`;

// Default maximum clock skew allowed for signature verification (spec §2.2)
const DEFAULT_MAX_CLOCK_SKEW = 300;

// Error codes for authentication failures
export enum AuthErrorCode {
  INVALID_HEADER = 'INVALID_HEADER',
  INVALID_BASE64 = 'INVALID_BASE64',
  INVALID_JSON = 'INVALID_JSON',
  MISSING_SIGNATURE = 'MISSING_SIGNATURE',
  TIMESTAMP_OUT_OF_WINDOW = 'TIMESTAMP_OUT_OF_WINDOW',
  NONCE_REPLAYED = 'NONCE_REPLAYED',
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  DID_DOCUMENT_NOT_FOUND = 'DID_DOCUMENT_NOT_FOUND',
  VERIFICATION_METHOD_NOT_FOUND = 'VERIFICATION_METHOD_NOT_FOUND',
  INVALID_PUBLIC_KEY = 'INVALID_PUBLIC_KEY',
  DID_MISMATCH = 'DID_MISMATCH',
}

interface VerifyOptions {
  maxClockSkew?: number;
}

interface VerifyHeaderOptions extends VerifyOptions {
  nonceStore?: NonceStore;
}

// Detailed verification result with error codes
export type DetailedVerifyResult =
  | {
      ok: true;
      signedObject: NIP1SignedObject;
    }
  | {
      ok: false;
      error: string;
      errorCode: AuthErrorCode;
      signedObject?: NIP1SignedObject;
    };

// New result type with error codes and optional signedObject
export type AuthVerifyResult = DetailedVerifyResult;

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
      value: MultibaseCodec.encodeBase64url(obj.signature.value),
    },
  };
  const json = JSON.stringify(cloned);
  const b64url = MultibaseCodec.encodeBase64url(json);
  return `${HEADER_PREFIX}${b64url}`;
}

// Internal detailed verification function
async function verifySignatureDetailed(
  signedObject: NIP1SignedObject,
  resolverOrDoc: DIDDocument | DIDResolver,
  opts: VerifyOptions = {}
): Promise<DetailedVerifyResult> {
  const { signed_data, signature } = signedObject;

  const attemptVerify = async (didDoc: DIDDocument): Promise<DetailedVerifyResult> => {
    // timestamp window
    const maxSkew = opts.maxClockSkew ?? DEFAULT_MAX_CLOCK_SKEW;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - signed_data.timestamp) > maxSkew) {
      return {
        ok: false,
        error: 'Timestamp out of window',
        errorCode: AuthErrorCode.TIMESTAMP_OUT_OF_WINDOW,
        signedObject,
      };
    }

    if (didDoc.id !== signature.signer_did) {
      return {
        ok: false,
        error: 'DID document ID does not match signer DID',
        errorCode: AuthErrorCode.DID_MISMATCH,
        signedObject,
      };
    }

    const verificationMethod = didDoc.verificationMethod?.find(vm => vm.id === signature.key_id);
    if (!verificationMethod) {
      return {
        ok: false,
        error: 'Verification method not found in DID document',
        errorCode: AuthErrorCode.VERIFICATION_METHOD_NOT_FOUND,
        signedObject,
      };
    }

    console.log('verificationMethod', verificationMethod);

    let publicKeyMaterial: JsonWebKey | Uint8Array | null = null;
    if (verificationMethod.publicKeyJwk) {
      publicKeyMaterial = verificationMethod.publicKeyJwk;
    } else if (verificationMethod.publicKeyMultibase) {
      publicKeyMaterial = MultibaseCodec.decodeBase58btc(verificationMethod.publicKeyMultibase);
    }
    if (!publicKeyMaterial) {
      return {
        ok: false,
        error: 'Invalid or missing public key material',
        errorCode: AuthErrorCode.INVALID_PUBLIC_KEY,
        signedObject,
      };
    }

    const canonicalData = canonicalize(signed_data);
    const dataToVerify = Bytes.stringToBytes(DEFAULT_DOMAIN_SEPARATOR + canonicalData);

    const isValid = await CryptoUtils.verify(
      dataToVerify,
      signature.value,
      publicKeyMaterial,
      verificationMethod.type
    );

    if (isValid) {
      return { ok: true, signedObject };
    } else {
      return {
        ok: false,
        error: 'Signature verification failed',
        errorCode: AuthErrorCode.SIGNATURE_VERIFICATION_FAILED,
        signedObject,
      };
    }
  };

  if (typeof (resolverOrDoc as any).resolveDID === 'function') {
    const resolver = resolverOrDoc as DIDResolver;
    let doc = await resolver.resolveDID(signature.signer_did);
    if (doc) {
      const result = await attemptVerify(doc);
      if (result.ok) return result;
    }

    // fallback: force refresh once
    doc = await resolver.resolveDID(signature.signer_did, { forceRefresh: true });
    if (!doc) {
      return {
        ok: false,
        error: 'DID document not found',
        errorCode: AuthErrorCode.DID_DOCUMENT_NOT_FOUND,
        signedObject,
      };
    }
    return attemptVerify(doc);
  } else {
    return attemptVerify(resolverOrDoc as DIDDocument);
  }
}

// Backward compatible simple verification function
export async function verifySignature(
  signedObject: NIP1SignedObject,
  resolverOrDoc: DIDDocument | DIDResolver,
  opts: VerifyOptions = {}
): Promise<boolean> {
  const result = await verifySignatureDetailed(signedObject, resolverOrDoc, opts);
  return result.ok;
}

export async function verifyAuthHeader(
  header: string,
  resolver: DIDResolver,
  opts: VerifyHeaderOptions = {}
): Promise<AuthVerifyResult> {
  if (!header || !header.startsWith(HEADER_PREFIX)) {
    return {
      ok: false,
      error: 'Unsupported or missing Authorization header',
      errorCode: AuthErrorCode.INVALID_HEADER,
    };
  }
  const b64url = header.substring(HEADER_PREFIX.length).trim();
  let payloadStr: string;
  try {
    payloadStr = Bytes.bytesToString(MultibaseCodec.decodeBase64url(b64url));
  } catch (e) {
    return {
      ok: false,
      error: 'Invalid base64 credentials',
      errorCode: AuthErrorCode.INVALID_BASE64,
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(payloadStr);
  } catch (e) {
    return {
      ok: false,
      error: 'Invalid JSON in credentials',
      errorCode: AuthErrorCode.INVALID_JSON,
    };
  }

  // restore signature.value Uint8Array
  if (!parsed?.signature?.value) {
    return {
      ok: false,
      error: 'Missing signature value',
      errorCode: AuthErrorCode.MISSING_SIGNATURE,
    };
  }
  parsed.signature.value = MultibaseCodec.decodeBase64url(parsed.signature.value);
  const signedObj = parsed as NIP1SignedObject;

  // Use detailed verification function first (includes timestamp check)
  const verifyResult = await verifySignatureDetailed(signedObj, resolver, {
    maxClockSkew: opts.maxClockSkew,
  });
  if (!verifyResult.ok) {
    return verifyResult; // Return the detailed error from signature verification
  }

  // Additional replay protection: nonce check (only if signature verification passed)
  const store = opts.nonceStore ?? defaultNonceStore;
  const maxSkew = opts.maxClockSkew ?? DEFAULT_MAX_CLOCK_SKEW;
  const ttlSeconds = maxSkew; // allow same as window
  const stored = await store.tryStoreNonce(
    signedObj.signature.signer_did,
    DEFAULT_DOMAIN_SEPARATOR,
    signedObj.signed_data.nonce,
    ttlSeconds
  );
  if (!stored) {
    return {
      ok: false,
      error: 'Nonce replayed',
      errorCode: AuthErrorCode.NONCE_REPLAYED,
      signedObject: signedObj,
    };
  }

  // All checks passed
  return { ok: true, signedObject: signedObj };
}

export default {
  createSignature,
  toAuthorizationHeader,
  verifySignature,
  verifyAuthHeader,
  AuthErrorCode,
};
