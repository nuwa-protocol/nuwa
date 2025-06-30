import axios, { AxiosResponse } from "axios";

/**
 * Minimal service adapter for proxying requests to a LiteLLM Proxy instance.
 * It mirrors the key methods used by `OpenRouterService` so the same routing
 * layer can operate on either backend.
 */
class LiteLLMService {
  private baseURL: string;

  constructor() {
    // Base URL of the LiteLLM Proxy
    this.baseURL = process.env.LITELLM_BASE_URL || "http://localhost:4000";
  }

  /**
   * Forward an arbitrary request to LiteLLM.
   * Only POST/GET are expected in practice, but other verbs are accepted.
   */
  async forwardRequest(
    apiKey: string, // ignored for now; LiteLLM uses its own auth header
    apiPath: string,
    method: string = "POST",
    requestData?: any,
    isStream: boolean = false
  ): Promise<AxiosResponse | { error: string; status?: number } | null> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // If a user-specific key is provided, forward it; otherwise assume public access or MASTER_KEY routing.
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const fullUrl = `${this.baseURL}${apiPath}`; // Note: apiPath already contains leading slash

      const response = await axios({
        method: method.toLowerCase() as any,
        url: fullUrl,
        data: requestData,
        headers,
        responseType: isStream ? "stream" : "json",
      });

      return response;
    } catch (error: any) {
      const { message, statusCode } = this.extractErrorInfo(error);
      return { error: message, status: statusCode };
    }
  }

  /**
   * Extract the JSON payload for non-stream responses.
   */
  parseResponse(response: AxiosResponse): any {
    return response.data;
  }

  /* ------------------------------------------------------------------ */
  /* Helper utils                                                       */
  /* ------------------------------------------------------------------ */

  private extractErrorInfo(error: any): { message: string; statusCode: number } {
    if (error?.response) {
      return {
        message: error.response.data?.error || error.response.data?.message || error.message || "Unknown error",
        statusCode: error.response.status || 500,
      };
    }
    if (error?.request) {
      return { message: "No response from LiteLLM", statusCode: 503 };
    }
    return { message: error?.message || "Unknown error", statusCode: 500 };
  }

  /* ---------------------------------------------------------------------------
   * Virtual Key management
   * ------------------------------------------------------------------------*/

  /**
   * Create a new virtual API key using the proxy master key.
   * Expects env LITELLM_MASTER_KEY to be set.
   * Returns the raw key (sk-...) plus the JSON payload returned by LiteLLM.
   */
  async createApiKey(request: {
    name: string;
    limit?: number;
  }): Promise<{ key: string; data: any } | null> {
    const masterKey = process.env.LITELLM_MASTER_KEY;
    if (!masterKey) {
      console.error("LITELLM_MASTER_KEY not configured");
      return null;
    }

    try {
      // Docs: POST /key/generate
      const body: Record<string, any> = {
        metadata: { name: request.name },
      };
      // LiteLLM requires `models` param; fall back to wildcard if not specified via env
      const defaultModels = process.env.LITELLM_KEY_DEFAULT_MODELS;
      if (defaultModels) {
        body.models = defaultModels.split(",").map((m) => m.trim());
      }
      if (request.limit !== undefined) {
        body.max_budget = request.limit; // USD budget
      }

      const url = `${this.baseURL.replace(/\/$/, "")}/key/generate`;
      const resp = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${masterKey}`,
          "Content-Type": "application/json",
        },
      });

      const responseData = resp.data || {};
      const key = responseData.key as string;
      if (!key) {
        console.error("LiteLLM create key response missing 'key' field");
        return null;
      }
      return { key, data: responseData };
    } catch (error: any) {
      const info = this.extractErrorInfo(error);
      console.error(`Error creating LiteLLM key: ${info.message}`);
      return null;
    }
  }

  /**
   * Deletes (or blocks) a virtual key.
   * LiteLLM doesn't have a hard delete; we call /key/block to disable the key.
   */
  async deleteApiKey(key: string): Promise<boolean> {
    const masterKey = process.env.LITELLM_MASTER_KEY;
    if (!masterKey) return false;

    try {
      const url = `${this.baseURL.replace(/\/$/, "")}/key/block`;
      await axios.post(
        url,
        { key },
        {
          headers: {
            Authorization: `Bearer ${masterKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      return true;
    } catch (error: any) {
      const info = this.extractErrorInfo(error);
      console.error(`Error deleting LiteLLM key: ${info.message}`);
      return false;
    }
  }
}

export default LiteLLMService; 