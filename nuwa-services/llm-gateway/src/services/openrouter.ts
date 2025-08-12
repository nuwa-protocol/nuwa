import "dotenv/config";
import axios, { AxiosResponse } from "axios";
import {
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  GetApiKeyResponse,
} from "../types/index.js";

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

interface CurrentApiKeyResponse {
  data: {
    label: string;
    usage: number;
    is_free_tier: boolean;
    is_provisioning_key: boolean;
    limit: number;
    limit_remaining: number;
  };
}

interface DeleteApiKeyResponse {
  data: {
    success: boolean;
  };
}

class OpenRouterService {
  private baseURL: string;
  private provisioningApiKey: string | null;

  constructor() {
    this.baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai";
    this.provisioningApiKey = process.env.OPENROUTER_PROVISIONING_KEY || null;
  }

  // Extract error information from axios error
  private async extractErrorInfo(error: any): Promise<{
    message: string;
    statusCode: number;
  }> {
    let errorMessage = "Unknown error occurred";
    let statusCode = 500;

    if (error.response) {
      statusCode = error.response.status;

      if (error.response.data) {
        let data = error.response.data;

        // Handle Buffer
        if (Buffer.isBuffer(data)) {
          try {
            data = data.toString("utf-8");
            data = JSON.parse(data);
          } catch (e) {
            errorMessage = data.toString();
            return { message: errorMessage, statusCode };
          }
        }

        // Handle Stream
        if (
          data &&
          typeof data === "object" &&
          typeof data.pipe === "function"
        ) {
          try {
            const str = await streamToString(data);
            try {
              const json = JSON.parse(str);
              errorMessage = json?.error?.message || str;
            } catch {
              errorMessage = str;
            }
          } catch (e) {
            errorMessage = "Failed to read error stream";
          }
          return { message: errorMessage, statusCode };
        }

        // Handle normal object
        if (typeof data === "object" && data !== null) {
          errorMessage =
            data.error?.message || data.message || JSON.stringify(data);
        } else if (typeof data === "string") {
          errorMessage = data;
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

    return { message: errorMessage, statusCode };
  }

  // Create a new OpenRouter API Key
  async createApiKey(
    request: CreateApiKeyRequest
  ): Promise<CreateApiKeyResponse | null> {
    if (!this.provisioningApiKey) {
      console.error("Provisioning API key not configured");
      return null;
    }

    try {
      const response = await axios.post<CreateApiKeyResponse>(
        `${this.baseURL}/api/v1/keys`,
        request,
        {
          headers: {
            Authorization: `Bearer ${this.provisioningApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`✅ Created OpenRouter API key: ${request.name}`);
      return response.data;
    } catch (error: any) {
      const errorInfo = await this.extractErrorInfo(error);
      console.error(`Error creating OpenRouter API key: ${errorInfo.message}`);
      return null;
    }
  }

  // Get API key metadata by hash (won't return the actual key)
  async getApiKeyFromHash(keyHash: string): Promise<GetApiKeyResponse | null> {
    if (!this.provisioningApiKey) {
      console.error("Provisioning API key not configured");
      return null;
    }
    try {
      const response = await axios.get<GetApiKeyResponse>(
        `${this.baseURL}/api/v1/keys/${keyHash}`,
        {
          headers: {
            Authorization: `Bearer ${this.provisioningApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error: any) {
      const errorInfo = await this.extractErrorInfo(error);
      console.error(
        `Error getting OpenRouter API key info: ${errorInfo.message}`
      );
      return null;
    }
  }

  // Get current API key information (only for current Bearer Token)
  async getCurrentApiKey(): Promise<CurrentApiKeyResponse | null> {
    if (!this.provisioningApiKey) {
      console.error("Provisioning API key not configured");
      return null;
    }
    try {
      const response = await axios.get<CurrentApiKeyResponse>(
        `${this.baseURL}/api/v1/key`,
        {
          headers: {
            Authorization: `Bearer ${this.provisioningApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error: any) {
      const errorInfo = await this.extractErrorInfo(error);
      console.error(
        `Error getting current OpenRouter API key info: ${errorInfo.message}`
      );
      return null;
    }
  }

  // Update API key information (name, disabled status, limit)
  async updateApiKey(
    keyHash: string,
    update: { name?: string; disabled?: boolean; limit?: number }
  ): Promise<GetApiKeyResponse | null> {
    if (!this.provisioningApiKey) {
      console.error("Provisioning API key not configured");
      return null;
    }
    try {
      const response = await axios.patch<GetApiKeyResponse>(
        `${this.baseURL}/api/v1/keys/${keyHash}`,
        update,
        {
          headers: {
            Authorization: `Bearer ${this.provisioningApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error: any) {
      const errorInfo = await this.extractErrorInfo(error);
      console.error(`Error updating OpenRouter API key: ${errorInfo.message}`);
      return null;
    }
  }

  // List all API Keys (supports offset/include_disabled parameters)
  async listApiKeys(
    offset?: number,
    include_disabled?: boolean
  ): Promise<GetApiKeyResponse[] | null> {
    if (!this.provisioningApiKey) {
      console.error("Provisioning API key not configured");
      return null;
    }
    try {
      const params: any = {};
      if (offset !== undefined) params.offset = offset;
      if (include_disabled !== undefined)
        params.include_disabled = include_disabled;

      const response = await axios.get<{ data: GetApiKeyResponse[] }>(
        `${this.baseURL}/api/v1/keys`,
        {
          headers: {
            Authorization: `Bearer ${this.provisioningApiKey}`,
            "Content-Type": "application/json",
          },
          params,
        }
      );
      return response.data.data;
    } catch (error: any) {
      const errorInfo = await this.extractErrorInfo(error);
      console.error(`Error listing OpenRouter API keys: ${errorInfo.message}`);
      return null;
    }
  }

  // Delete API Key
  async deleteApiKey(keyHash: string): Promise<boolean> {
    if (!this.provisioningApiKey) {
      console.error("Provisioning API key not configured");
      return false;
    }

    try {
      const response = await axios.delete<DeleteApiKeyResponse>(
        `${this.baseURL}/api/v1/keys/${keyHash}`,
        {
          headers: {
            Authorization: `Bearer ${this.provisioningApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`✅ Deleted OpenRouter API key: ${keyHash}`);
      return response.data.data.success;
    } catch (error: any) {
      const errorInfo = await this.extractErrorInfo(error);
      console.error(`Error deleting OpenRouter API key: ${errorInfo.message}`);
      return false;
    }
  }

  // Generic forwarding request to OpenRouter - supports any path
  async forwardRequest(
    apiKey: string,
    apiPath: string,
    method: string = "POST",
    requestData?: any,
    isStream: boolean = false
  ): Promise<AxiosResponse | { error: string; status?: number } | null> {
    try {
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.HTTP_REFERER || "https://llm-gateway.local",
        "X-Title": process.env.X_TITLE || "LLM Gateway",
      };

      // Always concatenate baseURL and apiPath
      const fullUrl = `${this.baseURL}/api/v1${apiPath}`;

      console.log(`🔄 Forwarding ${method} request to: ${fullUrl}`);

      const response = await axios({
        method: method.toLowerCase() as any,
        url: fullUrl,
        data: requestData,
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

      // Extract error information to return to client
      return { error: errorInfo.message, status: errorInfo.statusCode };
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
