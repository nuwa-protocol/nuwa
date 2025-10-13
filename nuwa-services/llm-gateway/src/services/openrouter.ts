import "dotenv/config";
import axios, { AxiosResponse } from "axios";
import { LLMProvider } from "../providers/LLMProvider.js";

// Native streamToString tool function, placed outside the class
function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", reject);
  });
}

interface OpenRouterErrorInfo {
  message: string;
  statusCode: number;
  statusText?: string;
  code?: string;
  type?: string;
  headers?: Record<string, any>;
  requestId?: string;
  rawBody?: string;
  details?: any;
}

// Typed error return for forwardRequest
interface UpstreamErrorResponse {
  error: string;
  status?: number;
  details: OpenRouterErrorInfo;
}

class OpenRouterService implements LLMProvider {
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai";
  }

  // Extract error information from axios error (handles Buffer/Stream/object) and log structured details
  private async extractErrorInfo(error: any): Promise<OpenRouterErrorInfo> {
    let errorMessage = "Unknown error occurred";
    let statusCode = 500;
    let statusText: string | undefined;
    let headers: Record<string, any> | undefined;
    let requestId: string | undefined;
    let rawBody: string | undefined;
    let code: string | undefined;
    let type: string | undefined;
    let details: any;

    if (error.response) {
      statusCode = error.response.status;
      statusText = error.response.statusText;
      headers = error.response.headers || undefined;
      try {
        const hdr: any = headers || {};
        requestId =
          hdr["x-request-id"] ||
          hdr["x-openai-request-id"] ||
          hdr["openrouter-request-id"] ||
          hdr["request-id"]; 
      } catch {}

      if (error.response.data) {
        let data = error.response.data;

        // Handle Buffer
        if (Buffer.isBuffer(data)) {
          try {
            const s = data.toString("utf-8");
            rawBody = s;
            data = JSON.parse(s);
          } catch (e) {
            errorMessage = data.toString();
            rawBody = errorMessage;
            this.logUpstreamError({
              statusCode,
              statusText,
              message: errorMessage,
              headers,
              requestId,
              rawBody: rawBody?.slice(0, 2000),
            });
            return { message: errorMessage, statusCode, statusText, headers, requestId, rawBody };
          }
        }

        // Handle Stream
        if (
          data &&
          typeof data === "object" &&
          typeof (data as any).pipe === "function"
        ) {
          try {
            const str = await streamToString(data);
            rawBody = str;
            try {
              const json = JSON.parse(str);
              errorMessage = json?.error?.message || json?.message || str;
              code = json?.error?.code || json?.code;
              type = json?.error?.type || json?.type;
              details = json?.error || json;
            } catch {
              errorMessage = str;
            }
          } catch (e) {
            errorMessage = "Failed to read error stream";
          }
          this.logUpstreamError({
            statusCode,
            statusText,
            message: errorMessage,
            code,
            type,
            headers,
            requestId,
            rawBody: rawBody?.slice(0, 2000),
          });
          return { message: errorMessage, statusCode, statusText, code, type, headers, requestId, rawBody, details };
        }

        // Handle normal object
        if (typeof data === "object" && data !== null) {
          try {
            const anyData: any = data;
            errorMessage = anyData?.error?.message || anyData?.message || JSON.stringify(anyData);
            code = anyData?.error?.code || anyData?.code;
            type = anyData?.error?.type || anyData?.type;
            details = anyData?.error || anyData;
          } catch {
            errorMessage = JSON.stringify(data);
          }
        } else if (typeof data === "string") {
          errorMessage = data;
          rawBody = data;
        }
      } else {
        errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
      }
    } else if (error.request) {
      errorMessage = "No response received from OpenRouter";
      statusCode = 503; // Service Unavailable
    } else {
      errorMessage = error.message;
    }

    this.logUpstreamError({
      statusCode,
      statusText,
      message: errorMessage,
      code,
      type,
      headers,
      requestId,
      rawBody: rawBody?.slice(0, 2000),
    });

    return { message: errorMessage, statusCode, statusText, code, type, headers, requestId, rawBody, details };
  }

  // Minimal structured logger for upstream errors
  private logUpstreamError(info: {
    statusCode?: number;
    statusText?: string;
    message: string;
    code?: string;
    type?: string;
    headers?: Record<string, any>;
    requestId?: string;
    rawBody?: string;
  }) {
    try {
      const headersSubset = info.headers
        ? {
            "x-request-id": (info.headers as any)["x-request-id"],
            "x-openai-request-id": (info.headers as any)["x-openai-request-id"],
            "openrouter-request-id": (info.headers as any)["openrouter-request-id"],
            "x-usage": (info.headers as any)["x-usage"],
            "x-ratelimit-limit": (info.headers as any)["x-ratelimit-limit"],
            "x-ratelimit-remaining": (info.headers as any)["x-ratelimit-remaining"],
            "cf-ray": (info.headers as any)["cf-ray"],
          }
        : undefined;
      const payload: Record<string, any> = {
        statusCode: info.statusCode,
        statusText: info.statusText,
        message: info.message,
        code: info.code,
        type: info.type,
        requestId: info.requestId,
        headers: headersSubset,
        rawBodyPreview: info.rawBody,
      };
      console.error("[openrouter] upstream error:", JSON.stringify(payload));
    } catch {
      console.error("[openrouter] upstream error:", info.message);
    }
  }

  /**
   * Prepare request data for OpenRouter API
   * Injects usage.include=true for usage tracking
   */
  prepareRequestData(data: any, isStream: boolean): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // For OpenRouter, always inject usage tracking
    return {
      ...data,
      usage: { 
        include: true, 
        ...(data.usage || {}) 
      }
    };
  }

  // Generic forwarding request to OpenRouter - supports any path
  async forwardRequest(
    apiKey: string | null,
    apiPath: string,
    method: string = "POST",
    requestData?: any,
    isStream: boolean = false
  ): Promise<AxiosResponse | UpstreamErrorResponse | null> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.HTTP_REFERER || "https://llm-gateway.local",
        "X-Title": process.env.X_TITLE || "LLM Gateway",
      };

      // Add Authorization header only if API key is provided
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      // Prepare request data using provider-specific logic
      const finalData = this.prepareRequestData(requestData, isStream);

      // Always concatenate baseURL and apiPath
      const fullUrl = `${this.baseURL}/api/v1${apiPath}`;

      console.log(`🔄 Forwarding ${method} request to: ${fullUrl}`);

      const response = await axios({
        method: method.toLowerCase() as any,
        url: fullUrl,
        data: finalData,
        headers,
        responseType: isStream ? "stream" : "json",
      });
      try {
        const u = (response.headers || {})['x-usage'];
        if (u) console.log('[openrouter] x-usage header:', u);
      } catch {}

      return response;
    } catch (error: any) {
      const errorInfo = await this.extractErrorInfo(error);
      console.error(
        `Error forwarding request to OpenRouter: ${errorInfo.message}`
      );

      // Extract error information to return to client (attach details for higher-level logging)
      return { error: errorInfo.message, status: errorInfo.statusCode, details: errorInfo };
    }
  }

  // Pipe stream response to target stream
  pipeStreamResponse(
    response: AxiosResponse,
    targetStream: NodeJS.WritableStream,
    onEnd?: () => void,
    onError?: (error: Error) => void
  ): void {
    // Use default pipe settings, let Node.js automatically manage stream end
    const sourceStream = response.data;

    // Set error handling
    sourceStream.on("error", (error: Error) => {
      console.error("Source stream error:", error);
      onError?.(error);
    });

    targetStream.on("error", (error: Error) => {
      console.error("Target stream error:", error);
      onError?.(error);
    });

    // Use pipe and call callback on completion
    sourceStream.pipe(targetStream);

    // Listen to source stream end event
    sourceStream.on("end", () => {
      console.log("Source stream ended");
      onEnd?.();
    });

    // Listen to pipe end event
    sourceStream.on("close", () => {
      console.log("Source stream closed");
    });
  }

  /**
   * Extract USD cost from OpenRouter response
   * OpenRouter provides native USD cost in usage.cost or x-usage header
   */
  extractProviderUsageUsd(response: AxiosResponse): number | undefined {
    try {
      const data = response.data;
      
      // First try to get cost from response body
      if (data && typeof data === 'object' && data.usage && typeof data.usage.cost === 'number') {
        return data.usage.cost;
      }

      // Fallback to x-usage header
      const headers = response.headers || {};
      const usageHeader = headers['x-usage'] || headers['X-Usage'];
      if (typeof usageHeader === 'string' && usageHeader.length > 0) {
        try {
          const parsed = JSON.parse(usageHeader);
          const cost = parsed?.total_cost ?? parsed?.total_cost_usd ?? parsed?.cost ?? parsed?.usd;
          if (cost != null) {
            const n = Number(cost);
            if (Number.isFinite(n)) return n;
          }
        } catch {
          // Try regex fallback
          const m = usageHeader.match(/total[_-]?cost[_usd]*=([0-9.]+)/i) || usageHeader.match(/cost=([0-9.]+)/i);
          if (m && m[1]) {
            const n = Number(m[1]);
            if (Number.isFinite(n)) return n;
          }
        }
      }
    } catch (error) {
      console.error("Error extracting USD cost from OpenRouter response:", error);
    }
    return undefined;
  }

  // Parse non-stream response
  parseResponse(response: AxiosResponse): any {
    try {
      const data: any = response.data;
      // Try to augment usage.cost (USD) from provider headers when not present in body
      const headers = (response.headers || {}) as Record<string, string>;

      const usage = (data && typeof data === 'object' && data.usage) ? { ...data.usage } : {} as any;

      if (usage.cost == null) {
        // Heuristics for OpenRouter usage header
        // Common: 'x-usage' header containing JSON: { total_cost: "0.000001234", ... }
        const usageHeader = (headers['x-usage'] as any) || (headers['X-Usage'] as any);
        let parsedCost: number | undefined;
        if (typeof usageHeader === 'string' && usageHeader.length > 0) {
          try {
            const parsed = JSON.parse(usageHeader);
            const raw =
              parsed?.total_cost ??
              parsed?.total_cost_usd ??
              parsed?.cost ??
              parsed?.usd;
            if (raw != null) {
              const n = Number(raw);
              if (Number.isFinite(n)) parsedCost = n;
            }
          } catch {
            // Fallback: try to extract number from a simple "key=value" string format
            const m = usageHeader.match(/total[_-]?cost[_usd]*=([0-9.]+)/i) || usageHeader.match(/cost=([0-9.]+)/i);
            if (m && m[1]) {
              const n = Number(m[1]);
              if (Number.isFinite(n)) parsedCost = n;
            }
          }
        }

        if (parsedCost != null) {
          usage.cost = parsedCost;
        }
      }

      if (Object.keys(usage).length > 0) {
        return { ...data, usage };
      }
      return data;
    } catch (error) {
      console.error("Error parsing OpenRouter response:", error);
      return null;
    }
  }
}

export default OpenRouterService;
