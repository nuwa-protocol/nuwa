import { Request, Response, NextFunction } from "express";
import SupabaseService from "../database/supabase.js";
import OpenRouterService from "../services/openrouter.js";
import { ApiResponse, DIDInfo } from "../types/index.js";

const supabaseService = new SupabaseService();
const openRouterService = new OpenRouterService();

export async function userInitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 从认证 middleware 中获取 DID 信息
    const didInfo = req.didInfo as DIDInfo;

    if (!didInfo) {
      const response: ApiResponse = {
        success: false,
        error: "DID information not found in request",
      };
      res.status(401).json(response);
      return;
    }

    // 检查用户是否已经有 API key 记录
    const existingApiKey = await supabaseService.getUserApiKeyInfo(didInfo.did, "openrouter");

    if (existingApiKey) {
      // 用户已存在，继续处理
      console.log(`✅ User ${didInfo.did} already exists, continuing...`);
      next();
      return;
    }

    // 用户不存在，为其创建新的 API key
    console.log(`🆕 Creating new user record for DID: ${didInfo.did}`);

    const keyName = `nuwa-generated-did_${didInfo.did}`;

    // 1. 在 OpenRouter 创建 API key
    const openRouterResponse = await openRouterService.createApiKey({
      name: keyName,
    });

    if (!openRouterResponse) {
      console.error(
        `❌ Failed to create OpenRouter API key for DID: ${didInfo.did}`
      );
      const response: ApiResponse = {
        success: false,
        error: "Failed to create API key",
      };
      res.status(500).json(response);
      return;
    }

    // 2. 在数据库中保存用户记录
    const createSuccess = await supabaseService.createUserApiKey(
      didInfo.did,
      openRouterResponse.data.hash,
      openRouterResponse.key,
      keyName,
      "openrouter"
    );

    if (!createSuccess) {
      console.error(`❌ Failed to save user record for DID: ${didInfo.did}`);

      // 如果数据库保存失败，尝试删除在 OpenRouter 创建的 key
      try {
        await openRouterService.deleteApiKey(openRouterResponse.data.hash);
        console.log(
          `🧹 Cleaned up OpenRouter API key for failed user creation: ${didInfo.did}`
        );
      } catch (cleanupError) {
        console.error("Failed to cleanup OpenRouter API key:", cleanupError);
      }

      const response: ApiResponse = {
        success: false,
        error: "Failed to save user record",
      };
      res.status(500).json(response);
      return;
    }

    console.log(
      `✅ Successfully created user record and API key for DID: ${didInfo.did}`
    );
    console.log(
      `📊 API Key Info: Name=${keyName}, Hash=${openRouterResponse.data.hash}`
    );

    // 用户创建成功，继续处理请求
    next();
  } catch (error) {
    console.error("User initialization middleware error:", error);
    const response: ApiResponse = {
      success: false,
      error: "User initialization failed",
    };
    res.status(500).json(response);
  }
}
