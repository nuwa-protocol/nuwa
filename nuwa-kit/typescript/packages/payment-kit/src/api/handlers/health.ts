import { createSuccessResponse } from "../../errors";
import type { ApiContext, Handler } from "../../types/api";
import type { HealthResponse } from "../../schema";

/**
 * Handle admin health endpoint requests
 * Public endpoint, no authentication required
 */
export const handleHealth: Handler<ApiContext, {}, HealthResponse> = async (ctx, req) => {
    const response: HealthResponse = {
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        paymentKitEnabled: true
    };

    return createSuccessResponse(response);
};