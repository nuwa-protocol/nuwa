import "dotenv/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { RequestLog } from "../types/index.js";

class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);

  }
  
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
