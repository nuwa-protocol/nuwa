import { createSuccessResponse } from "../../errors";
import { ApiContext, Handler, HealthResponse } from "../../types/api";

/**
 * Handle admin health endpoint requests
 * Public endpoint, no authentication required
 */
export const handleHealth: Handler<ApiContext, void, HealthResponse> = async (ctx) => {
    const response: HealthResponse = {
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        paymentKitEnabled: true
    };

    return createSuccessResponse(response);
};