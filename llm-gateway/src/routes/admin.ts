import { Router, Request, Response } from "express";
import { getPaymentKit, isPaymentKitEnabled } from "../services/paymentService.js";
import { ApiResponse } from "../types/index.js";

const router = Router();

/**
 * Admin middleware - basic auth check
 * In production, replace with proper admin authentication
 */
async function adminAuthMiddleware(req: Request, res: Response, next: any) {
  const adminKey = req.headers['x-admin-key'] as string;
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ 
      success: false, 
      error: "Unauthorized - Admin key required" 
    } as ApiResponse);
  }
  next();
}

/**
 * GET /api/v1/admin/health - Health check
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    paymentKitEnabled: isPaymentKitEnabled()
  });
});

/**
 * GET /api/v1/admin/billing/status - Get billing system status
 */
router.get('/billing/status', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!isPaymentKitEnabled()) {
      return res.json({
        success: true,
        paymentKitEnabled: false,
        message: "Payment Kit is disabled"
      });
    }

    const paymentKit = await getPaymentKit();
    const payeeClient = paymentKit.getPayeeClient();
    
    // Get basic status information
    const status = {
      success: true,
      paymentKitEnabled: true,
      clientInitialized: !!payeeClient,
      timestamp: new Date().toISOString()
    };

    res.json(status);
  } catch (error) {
    console.error('Error getting billing status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get billing status',
      details: error instanceof Error ? error.message : String(error)
    } as ApiResponse);
  }
});

/**
 * GET /api/v1/admin/billing/stats - Get billing statistics
 */
router.get('/billing/stats', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!isPaymentKitEnabled()) {
      return res.json({
        success: true,
        paymentKitEnabled: false,
        stats: null
      });
    }

    const paymentKit = await getPaymentKit();
    const payeeClient = paymentKit.getPayeeClient();
    
    // Basic stats - in a real implementation, you'd get these from the payment client
    const stats = {
      success: true,
      stats: {
        totalChannels: 0, // Would be populated from payeeClient
        totalProposals: 0,
        totalSettled: 0,
        lastActivity: new Date().toISOString()
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('Error getting billing stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get billing stats',
      details: error instanceof Error ? error.message : String(error)
    } as ApiResponse);
  }
});

/**
 * POST /api/v1/admin/billing/cleanup - Clean up expired proposals
 */
router.post('/billing/cleanup', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!isPaymentKitEnabled()) {
      return res.json({
        success: true,
        paymentKitEnabled: false,
        cleaned: 0
      });
    }

    const maxAge = parseInt(req.body.maxAge as string) || 30; // 30 minutes default
    
    // In a real implementation, you'd call cleanup methods from paymentKit
    const cleaned = 0; // Placeholder
    
    res.json({
      success: true,
      cleaned,
      maxAgeMinutes: maxAge
    });
  } catch (error) {
    console.error('Error cleaning up proposals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup proposals',
      details: error instanceof Error ? error.message : String(error)
    } as ApiResponse);
  }
});

/**
 * GET /api/v1/admin/billing/channels - List payment channels
 */
router.get('/billing/channels', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!isPaymentKitEnabled()) {
      return res.json({
        success: true,
        paymentKitEnabled: false,
        channels: []
      });
    }

    const paymentKit = await getPaymentKit();
    const payeeClient = paymentKit.getPayeeClient();
    
    // In a real implementation, you'd get channels from payeeClient
    const channels: any[] = []; // Placeholder
    
    res.json({
      success: true,
      channels,
      count: channels.length
    });
  } catch (error) {
    console.error('Error getting channels:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get channels',
      details: error instanceof Error ? error.message : String(error)
    } as ApiResponse);
  }
});

/**
 * GET /api/v1/admin/config - Get current configuration
 */
router.get('/config', adminAuthMiddleware, (req: Request, res: Response) => {
  const config = {
    success: true,
    config: {
      paymentKitEnabled: isPaymentKitEnabled(),
      didAuthOnly: process.env.DID_AUTH_ONLY === 'true',
      llmBackend: process.env.LLM_BACKEND || 'openrouter',
      roochNetwork: process.env.ROOCH_NETWORK || 'local',
      roochNodeUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      defaultAssetId: process.env.DEFAULT_ASSET_ID || '0x3::gas_coin::RGas',
      paymentStrictMode: process.env.PAYMENT_STRICT_MODE === 'true'
    }
  };
  
  res.json(config);
});

export const adminRoutes = router; 