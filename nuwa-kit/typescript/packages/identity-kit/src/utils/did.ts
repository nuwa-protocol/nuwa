/**
 * DID utility helpers (method, identifier & fragment parsing)
 * Used across SDK layers (VDR, Signer, KeyManager, etc.)
 */

/**
 * Parsed DID parts
 */
export interface ParsedDID {
  /** DID method, e.g. 'key', 'rooch' */
  method: string;
  /** Unique identifier part (method-specific id, without fragment) */
  identifier: string;
  /** Optional fragment (ver. method / service id) */
  fragment?: string;
}

/**
 * Parse a DID or DID-URL into its components.
 *
 * @param did Full DID string: `did:<method>:<identifier>[#fragment]`
 * @throws Error if input does not start with `did:` or lacks method / identifier parts.
 */
export function parseDid(did: string): ParsedDID {
  if (!did.startsWith('did:')) {
    throw new Error(`Invalid DID: ${did}`);
  }

  // Strip leading `did:` and split once by ':'
  const afterPrefix = did.slice(4);
  const methodEnd = afterPrefix.indexOf(':');
  if (methodEnd === -1) {
    throw new Error(`Invalid DID – missing method/identifier separator: ${did}`);
  }
  const method = afterPrefix.slice(0, methodEnd);
  const idPlusFrag = afterPrefix.slice(methodEnd + 1);
  if (!method || !idPlusFrag) {
    throw new Error(`Invalid DID: ${did}`);
  }

  const hashIdx = idPlusFrag.indexOf('#');
  return hashIdx === -1
    ? { method, identifier: idPlusFrag }
    : {
        method,
        identifier: idPlusFrag.slice(0, hashIdx),
        fragment: idPlusFrag.slice(hashIdx + 1),
      };
}

/** Get DID method string */
export function extractMethod(did: string): string {
  return parseDid(did).method;
}

/** Get method-specific identifier (without fragment) */
export function extractIdentifier(did: string): string {
  return parseDid(did).identifier;
}

/**
 * Extract the fragment from a DID URL or any string containing `#`.
 * Throws an error if no fragment present.
 */
export function extractFragment(idOrDid: string): string {
  const idx = idOrDid.indexOf('#');
  if (idx === -1) {
    throw new Error(`No fragment found in ${idOrDid}`);
  }
  return idOrDid.slice(idx + 1);
}

/** Alias kept for back-compat with existing imports */
export const extractFragmentFromId = extractFragment;

/** Build a canonical DID string from method & identifier */
export function buildDid(method: string, identifier: string): string {
  return `did:${method}:${identifier}`;
}

/**
 * Compare two DIDs ignoring their fragments.
 */
export function sameDid(a: string, b: string): boolean {
  const pa = parseDid(a);
  const pb = parseDid(b);
  return pa.method === pb.method && pa.identifier === pb.identifier;
}

/**
 * Return the canonical DID (strip any `#fragment`).
 */
export function getDidWithoutFragment(did: string): string {
  const { method, identifier } = parseDid(did);
  return buildDid(method, identifier);
} 