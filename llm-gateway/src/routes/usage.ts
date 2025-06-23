import { Router, Request, Response } from "express";
import SupabaseService from "../database/supabase.js";
import { didAuthMiddleware } from "../middleware/didAuth.js";
import { ApiResponse, DIDInfo } from "../types/index.js";

const supabaseService = new SupabaseService();
const router = Router();

router.get("/", didAuthMiddleware, async (req: Request, res: Response) => {
  const didInfo = req.didInfo as DIDInfo;
  const { start_date, end_date } = req.query as {
    start_date?: string;
    end_date?: string;
  };

  try {
    const usageStats = await supabaseService.getUserUsageStats(
      didInfo.did,
      start_date,
      end_date
    );

    if (!usageStats) {
      const response: ApiResponse = {
        success: false,
        error: "Failed to get usage statistics",
      };
      res.status(500).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      data: usageStats,
    };

    res.json(response);
  } catch (error) {
    console.error("Error getting usage statistics:", error);
    const response: ApiResponse = {
      success: false,
      error: "Internal server error",
    };
    res.status(500).json(response);
  }
});

export const usageRoutes = router;
