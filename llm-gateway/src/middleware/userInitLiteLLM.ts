import { Request, Response, NextFunction } from "express";
import SupabaseService from "../database/supabase.js";
import LiteLLMService from "../services/litellm.js";
import { ApiResponse, DIDInfo } from "../types/index.js";
import * as crypto from "crypto";

const supabaseService = new SupabaseService();
const litellmService = new LiteLLMService();

/**
 * Middleware to lazily create a LiteLLM virtual key for the authenticated DID.
 * The key is created once per DID and stored in the `user_api_keys` table.
 */
export async function userInitLiteLLMMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const didInfo = req.didInfo as DIDInfo;
    if (!didInfo) {
      const response: ApiResponse = {
        success: false,
        error: "DID information not found in request",
      };
      res.status(401).json(response);
      return;
    }

    // Check existing record
    const existing = await supabaseService.getUserApiKeyInfo(didInfo.did);
    if (existing) {
      next();
      return;
    }

    // Create new key via LiteLLM
    const keyName = `nuwa-litellm-did_${didInfo.did}`;
    const createResp = await litellmService.createApiKey({ name: keyName });

    if (!createResp) {
      const response: ApiResponse = {
        success: false,
        error: "Failed to create LiteLLM key",
      };
      res.status(500).json(response);
      return;
    }

    const { key } = createResp;
    // Derive a stable hash for storage: SHA-256 of the key string, first 16 chars for brevity
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");

    const saved = await supabaseService.createUserApiKey(
      didInfo.did,
      keyHash,
      key,
      keyName
    );

    if (!saved) {
      // attempt cleanup
      await litellmService.deleteApiKey(key);
      const response: ApiResponse = {
        success: false,
        error: "Failed to save LiteLLM key for user",
      };
      res.status(500).json(response);
      return;
    }

    console.log(`✅ Created LiteLLM virtual key for DID: ${didInfo.did}`);
    next();
  } catch (error) {
    console.error("userInitLiteLLM middleware error", error);
    const response: ApiResponse = {
      success: false,
      error: "User initialization failed",
    };
    res.status(500).json(response);
  }
} 