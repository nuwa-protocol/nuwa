import "dotenv/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { RequestLog } from "../types/index.js";
import * as crypto from "crypto";

class SupabaseService {
  private supabase: SupabaseClient;
  private encryptionKey: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);

    // 用于加密 API keys 的密钥，从环境变量获取
    this.encryptionKey =
      process.env.API_KEY_ENCRYPTION_KEY || "default-key-change-in-production";
  }

  // 加密函数
  private encrypt(text: string): string {
    const algorithm = "aes-256-cbc";
    const key = crypto.scryptSync(this.encryptionKey, "salt", 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    return iv.toString("hex") + ":" + encrypted;
  }

  // 解密函数
  private decrypt(encryptedText: string): string {
    const algorithm = "aes-256-cbc";
    const key = crypto.scryptSync(this.encryptionKey, "salt", 32);
    const [ivHex, encrypted] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(algorithm, key, iv);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  // 根据 DID 获取用户的 OpenRouter API Key 哈希
  async getUserApiKeyHash(did: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from("user_api_keys")
        .select("openrouter_key_hash")
        .eq("did", did)
        .single();

      if (error) {
        console.error("Error fetching user API key:", error);
        return null;
      }

      return data?.openrouter_key_hash || null;
    } catch (error) {
      console.error("Error in getUserApiKeyHash:", error);
      return null;
    }
  }

  // 根据 DID 获取用户的实际 API Key（解密后）
  async getUserActualApiKey(did: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from("user_api_keys")
        .select("encrypted_api_key")
        .eq("did", did)
        .single();

      if (error) {
        console.error("Error fetching user actual API key:", error);
        return null;
      }

      if (!data?.encrypted_api_key) {
        return null;
      }

      // 解密 API key
      try {
        return this.decrypt(data.encrypted_api_key);
      } catch (decryptError) {
        console.error("Error decrypting API key:", decryptError);
        return null;
      }
    } catch (error) {
      console.error("Error in getUserActualApiKey:", error);
      return null;
    }
  }

  // 创建用户 API Key 记录
  async createUserApiKey(
    did: string,
    openrouterKeyHash: string,
    actualApiKey: string,
    name: string,
    limit?: number
  ): Promise<boolean> {
    try {
      // 加密实际的 API key
      const encryptedApiKey = this.encrypt(actualApiKey);

      const { error } = await this.supabase.from("user_api_keys").insert({
        did: did,
        openrouter_key_hash: openrouterKeyHash,
        encrypted_api_key: encryptedApiKey,
        key_name: name,
        credit_limit: limit,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Error creating user API key:", error);
        return false;
      }

      console.log(`✅ Created API key record for DID: ${did}`);
      return true;
    } catch (error) {
      console.error("Error in createUserApiKey:", error);
      return false;
    }
  }

  // 更新用户 API Key
  async updateUserApiKey(
    did: string,
    updates: {
      openrouter_key_hash?: string;
      actualApiKey?: string;
      name?: string;
      limit?: number;
    }
  ): Promise<boolean> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.openrouter_key_hash) {
        updateData.openrouter_key_hash = updates.openrouter_key_hash;
      }

      if (updates.actualApiKey) {
        updateData.encrypted_api_key = this.encrypt(updates.actualApiKey);
      }

      if (updates.name) {
        updateData.key_name = updates.name;
      }

      if (updates.limit !== undefined) {
        updateData.credit_limit = updates.limit;
      }

      const { error } = await this.supabase
        .from("user_api_keys")
        .update(updateData)
        .eq("did", did);

      if (error) {
        console.error("Error updating user API key:", error);
        return false;
      }

      console.log(`✅ Updated API key for DID: ${did}`);
      return true;
    } catch (error) {
      console.error("Error in updateUserApiKey:", error);
      return false;
    }
  }

  // 删除用户 API Key
  async deleteUserApiKey(did: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from("user_api_keys")
        .delete()
        .eq("did", did);

      if (error) {
        console.error("Error deleting user API key:", error);
        return false;
      }

      console.log(`✅ Deleted API key for DID: ${did}`);
      return true;
    } catch (error) {
      console.error("Error in deleteUserApiKey:", error);
      return false;
    }
  }

  // 获取用户 API Key 的完整信息
  async getUserApiKeyInfo(did: string): Promise<any | null> {
    try {
      const { data, error } = await this.supabase
        .from("user_api_keys")
        .select(
          "did, openrouter_key_hash, key_name, credit_limit, created_at, updated_at"
        )
        .eq("did", did)
        .single();

      if (error) {
        console.error("Error fetching user API key info:", error);
        return null;
      }

      return data;
    } catch (error) {
      console.error("Error in getUserApiKeyInfo:", error);
      return null;
    }
  }

  // 记录请求日志
  async logRequest(requestLog: Omit<RequestLog, "id">): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from("request_logs")
        .insert(requestLog);

      if (error) {
        console.error("Error logging request:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error in logRequest:", error);
      return false;
    }
  }

  // 更新请求日志状态
  async updateRequestLog(
    did: string,
    requestTime: string,
    updates: Partial<RequestLog>
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from("request_logs")
        .update(updates)
        .eq("did", did)
        .eq("request_time", requestTime);

      if (error) {
        console.error("Error updating request log:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error in updateRequestLog:", error);
      return false;
    }
  }

  // 获取用户的使用统计
  async getUserUsageStats(
    did: string,
    startDate?: string,
    endDate?: string
  ): Promise<any | null> {
    try {
      let query = this.supabase.from("request_logs").select("*").eq("did", did);

      if (startDate) {
        query = query.gte("request_time", startDate);
      }

      if (endDate) {
        query = query.lte("request_time", endDate);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching user usage stats:", error);
        return null;
      }

      // 计算统计信息
      const stats = {
        total_requests: data.length,
        successful_requests: data.filter((r) => r.status === "completed")
          .length,
        failed_requests: data.filter((r) => r.status === "failed").length,
        total_input_tokens: data.reduce(
          (sum, r) => sum + (r.input_tokens || 0),
          0
        ),
        total_output_tokens: data.reduce(
          (sum, r) => sum + (r.output_tokens || 0),
          0
        ),
        total_cost: data.reduce((sum, r) => sum + (r.total_cost || 0), 0),
        requests_by_model: data.reduce((acc, r) => {
          acc[r.model] = (acc[r.model] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      return stats;
    } catch (error) {
      console.error("Error in getUserUsageStats:", error);
      return null;
    }
  }
}

export default SupabaseService;
