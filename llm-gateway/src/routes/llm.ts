import { Router, Request, Response } from "express";
import SupabaseService from "../database/supabase.js";
import { ApiResponse, RequestLog, DIDInfo } from "../types/index.js";
import OpenRouterService from "../services/openrouter.js";
import { didAuthMiddleware } from "../middleware/didAuth.js";
import { userInitMiddleware } from "../middleware/userInit.js";
import { userInitLiteLLMMiddleware } from "../middleware/userInitLiteLLM.js";
import { parse } from "url";
import { setImmediate } from "timers";
import LiteLLMService from "../services/litellm.js";

const supabaseService = new SupabaseService();
const litellmProvider = new LiteLLMService();
const router = Router();

// Define supported HTTP methods
const SUPPORTED_METHODS = ["get", "post", "put", "delete", "patch"] as const;

// Environment variable: LLM_BACKEND=openrouter | litellm | both  (default both)
const backendEnv = (process.env.LLM_BACKEND || "both").toLowerCase();
const OPENROUTER_ENABLED = backendEnv === "openrouter" || backendEnv === "both";
const LITELLM_ENABLED = backendEnv === "litellm" || backendEnv === "both";

// Provider instances
const openrouterProvider = new OpenRouterService();

// -----------------------------------------------------------------------------
// Header-based routing – unified path `/api/v1/*`
// -----------------------------------------------------------------------------

// Helper to run an Express middleware manually inside async handler
const runMiddleware = (
  req: Request,
  res: Response,
  fn: (req: Request, res: Response, next: (err?: any) => void) => void
) =>
  new Promise<void>((resolve, reject) => {
    fn(req, res, (err?: any) => {
      if (err) return reject(err);
      resolve();
    });
  });

for (const method of SUPPORTED_METHODS) {
  router[method](
    "/*", // match everything under /api/v1 from index.ts
    didAuthMiddleware,
    async (req: Request, res: Response) => {
      // Determine provider from header or fallback env
      const providerHeader = (req.headers["x-llm-provider"] as string | undefined)?.toLowerCase();
      let backendEnvVar = (process.env.LLM_BACKEND || "openrouter").toLowerCase();
      if (backendEnvVar === "both") backendEnvVar = "openrouter"; // default provider when both enabled
      const providerName = providerHeader || backendEnvVar;

      let provider: any = openrouterProvider;

      try {
        if (providerName === "litellm" && LITELLM_ENABLED) {
          await runMiddleware(req, res, userInitLiteLLMMiddleware);
          provider = litellmProvider;
        } else if (OPENROUTER_ENABLED) {
          await runMiddleware(req, res, userInitMiddleware);
        } else {
          return res.status(503).json({ success: false, error: "Requested provider not enabled" });
        }
      } catch (err) {
        console.error("Middleware error:", err);
        return res.status(500).json({ success: false, error: "Middleware failed" });
      }

      return handleLLMProxy(req, res, provider, providerName);
    }
  );
}

export const llmRoutes = router;

// -----------------------------------------------------------------------------
// General-purpose proxy handler supporting arbitrary LLM providers
// -----------------------------------------------------------------------------
async function handleLLMProxy(
  req: Request,
  res: Response,
  provider: {
    forwardRequest: (
      apiKey: string,
      apiPath: string,
      method: string,
      data?: any,
      isStream?: boolean
    ) => Promise<any>;
    parseResponse: (response: any) => any;
  },
  providerName: string
): Promise<void> {
  const requestTime = new Date().toISOString();
  const didInfo = req.didInfo as DIDInfo;
  const method = req.method;

  // Only take pathname part
  const { pathname } = parse(req.url);

  // Only pass path part, not concatenate baseURL
  let apiPath = pathname || "";

  // Get request data and enable usage tracking
  let requestData = ["GET", "DELETE"].includes(method) ? undefined : req.body;

  // Enable usage tracking only when forwarding to OpenRouter
  const isOpenRouterProvider = provider instanceof (OpenRouterService as any);
  if (
    isOpenRouterProvider &&
    requestData &&
    (apiPath.includes("/chat/completions") || apiPath.includes("/completions"))
  ) {
    requestData = {
      ...requestData,
      usage: {
        include: true,
      },
    };
    console.log("✅ Usage tracking enabled (OpenRouter)");
  }

  // Check if it's a stream request
  const isStream = (requestData as any)?.stream || false;

  // Determine model name (for logging)
  const model = (requestData as any)?.model || "unknown";

  console.log(
    `📨 Received ${method} request to ${req.url}, forwarding to ${providerName}: ${apiPath}`
  );

  // Usage tracking data
  let usageData: {
    input_tokens?: number;
    output_tokens?: number;
    total_cost?: number;
  } = {};

  // Asynchronous log update function, not blocking main process
  const asyncUpdateLog = (logData: any) => {
    setImmediate(async () => {
      try {
        await supabaseService.updateRequestLog(
          didInfo.did,
          requestTime,
          logData
        );
      } catch (error) {
        console.error("Error updating request log:", error);
      }
    });
  };

  // Extract usage info from response
  const extractUsageInfo = (responseData: any) => {
    if (responseData && responseData.usage) {
      const usage = responseData.usage;
      usageData = {
        input_tokens: usage.prompt_tokens || 0,
        output_tokens: usage.completion_tokens || 0,
        total_cost: usage.cost ?? undefined, // Directly store usage.cost, in dollars
      };
      console.log("📊 Extracted usage info:", usageData);
      return usageData;
    }
    return null;
  };

  // Process usage info in stream response
  let streamUsageBuffer = "";
  const extractStreamUsage = (chunk: string) => {
    // In stream response, usage info is usually in the last chunk
    streamUsageBuffer += chunk;

    // Find lines containing usage info
    const lines = streamUsageBuffer.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ") && line.includes('"usage"')) {
        try {
          const data = JSON.parse(line.slice(6)); // Remove 'data: ' prefix
          if (data.usage) {
            const extracted = extractUsageInfo(data);
            if (extracted) {
              console.log("📊 Extracted usage info from stream:", extracted);
              return extracted;
            }
          }
        } catch (error) {
          // Ignore parsing errors, continue processing
        }
      }
    }
    return null;
  };

  try {
    // 1. Get user's actual API Key (from encrypted storage)
    const apiKey = await supabaseService.getUserActualApiKey(didInfo.did, providerName);
    if (!apiKey) {
      const response: ApiResponse = {
        success: false,
        error: "User API key not found",
      };
      res.status(404).json(response);
      return;
    }

    // 2. Record request start (only for POST, PUT, PATCH requests that may incur costs)
    if (["POST", "PUT", "PATCH"].includes(method)) {
      const requestLog: Omit<RequestLog, "id"> = {
        did: didInfo.did,
        model: model,
        request_time: requestTime,
        status: "pending",
      };
      // Asynchronous logging, not waiting for completion
      setImmediate(async () => {
        try {
          await supabaseService.logRequest(requestLog);
        } catch (error) {
          console.error("Error logging request:", error);
        }
      });
    }

    // 3. Forward request to OpenRouter
    const response = await provider.forwardRequest(
      apiKey,
      apiPath,
      method,
      requestData,
      isStream
    );

    if (!response) {
      // Asynchronous update request log to failed status
      if (["POST", "PUT", "PATCH"].includes(method)) {
        asyncUpdateLog({
          status: "failed",
          error_message: "Failed to forward request to OpenRouter",
          response_time: new Date().toISOString(),
        });
      }

      const errorResponse: ApiResponse = {
        success: false,
        error: "Failed to process request",
      };
      res.status(500).json(errorResponse);
      return;
    }

    // Check if response contains error information
    if ("error" in response) {
      // Asynchronous update request log to failed status
      if (["POST", "PUT", "PATCH"].includes(method)) {
        asyncUpdateLog({
          status: "failed",
          error_message: response.error,
          response_time: new Date().toISOString(),
        });
      }

      const errorResponse: ApiResponse = {
        success: false,
        error: response.error,
      };
      res.status(response.status || 500).json(errorResponse);
      return;
    }

    // 4. Process response
    if (isStream) {
      // Stream response processing - Express has better support for streams
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Transfer-Encoding", "chunked");

      // Add response status tracking
      let requestLogUpdated = false;

      // Safe log update function (asynchronous, not blocking stream)
      const safeUpdateLog = (logData: any) => {
        if (!requestLogUpdated && ["POST", "PUT", "PATCH"].includes(method)) {
          requestLogUpdated = true;
          asyncUpdateLog({
            ...logData,
            ...usageData, // Include usage info
          });
        }
      };

      // Stream processing in Express is more intuitive and stable
      try {
        // Set error handling
        response.data.on("error", (error: Error) => {
          console.error("OpenRouter stream error:", error);
          safeUpdateLog({
            status: "failed",
            error_message: error.message,
            response_time: new Date().toISOString(),
          });
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: "Stream error" });
          }
        });

        res.on("error", (error: Error) => {
          console.error("Response stream error:", error);
        });

        res.on("close", () => {
          console.log("Client disconnected");
          response.data.destroy(); // Clean up upstream stream
        });

        // Process stream data and extract usage info
        let streamBuffer = "";
        response.data.on("data", (chunk: Buffer) => {
          const chunkStr = chunk.toString();
          streamBuffer += chunkStr;

          // Try to extract usage info
          const extracted = extractStreamUsage(chunkStr);
          if (extracted) {
            Object.assign(usageData, extracted);
          }

          // Forward data to client
          if (!res.destroyed) {
            res.write(chunk);
          }
        });

        // Listen to stream end
        response.data.on("end", () => {
          console.log("Stream completed successfully");
          if (!res.destroyed) {
            res.end();
          }
          safeUpdateLog({
            status: "completed",
            response_time: new Date().toISOString(),
          });
        });
      } catch (error) {
        console.error("Stream setup error:", error);
        safeUpdateLog({
          status: "failed",
          error_message:
            error instanceof Error ? error.message : "Stream setup failed",
          response_time: new Date().toISOString(),
        });
        if (!res.headersSent) {
          res
            .status(500)
            .json({ success: false, error: "Stream processing failed" });
        }
      }
    } else {
      // Non-stream response processing
      const responseData = provider.parseResponse(response);

      // Extract usage info
      extractUsageInfo(responseData);

      // Set response status code
      res.status(response.status);

      // Copy important response headers
      const headersToForward = [
        "content-type",
        "cache-control",
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
      ];
      headersToForward.forEach((headerName) => {
        const headerValue = response.headers[headerName];
        if (headerValue) {
          res.setHeader(headerName, headerValue);
        }
      });

      // Send response
      res.json(responseData);

      // Asynchronous update request log to completed status, including usage info
      if (["POST", "PUT", "PATCH"].includes(method)) {
        asyncUpdateLog({
          status: "completed",
          response_time: new Date().toISOString(),
          ...usageData, // Include extracted usage info
        });
      }
    }
  } catch (error) {
    console.error("OpenRouter proxy error:", error);

    // Asynchronous update request log to failed status
    if (["POST", "PUT", "PATCH"].includes(method)) {
      asyncUpdateLog({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
        response_time: new Date().toISOString(),
      });
    }

    const errorResponse: ApiResponse = {
      success: false,
      error: "Internal server error",
    };
    if (!res.headersSent) {
      res.status(500).json(errorResponse);
    }
  }
}
