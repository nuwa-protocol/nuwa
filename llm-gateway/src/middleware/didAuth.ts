import { Request, Response, NextFunction } from "express";
import { DIDAuth, VDRRegistry } from "@nuwa-ai/identity-kit";
import type { ApiResponse, DIDInfo } from "../types/index.js";

// Prefix as defined by DIDAuth v1 spec
const AUTH_SCHEME = "DIDAuthV1";
const HEADER_PREFIX = `${AUTH_SCHEME} `;

/**
 * Express middleware that validates the DIDAuthV1 Authorization header
 * and populates `req.didInfo` with the signer DID.
 */
export async function didAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers["authorization"] as string | undefined;
    if (!header || !header.startsWith(HEADER_PREFIX)) {
      res.status(401).json({ success: false, error: "Missing or invalid Authorization header" } as ApiResponse);
      return;
    }

    // Perform cryptographic verification via Nuwa Identity Kit.
    const verifyResult = await DIDAuth.v1.verifyAuthHeader(
      header,
      VDRRegistry.getInstance()
    );

    if (!verifyResult.ok) {
      res.status(401).json({ success: false, error: verifyResult.error } as ApiResponse);
      return;
    } else {
      // Success path: extract signer DID
      req.didInfo = { did: verifyResult.signedObject.signature.signer_did } as DIDInfo;
      next();
    }
  } catch (err) {
    console.error("didAuthMiddleware error", err);
    res.status(500).json({ success: false, error: "Authentication error" } as ApiResponse);
    return;
  }
}

// ---------------------------------------------------------------------------
// Express augmentation to include `didInfo` ------------------------------------------------
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      didInfo?: any;
    }
  }
} 