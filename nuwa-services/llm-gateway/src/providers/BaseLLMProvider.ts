import { AxiosResponse } from "axios";
import { LLMProvider, ExecuteResponse, ExecuteStreamResponse } from "./LLMProvider.js";
import { UsageExtractor } from "../billing/usage/interfaces/UsageExtractor.js";
import { StreamProcessor } from "../billing/usage/interfaces/StreamProcessor.js";
import { UsageInfo, PricingResult } from "../billing/pricing.js";
import { CostCalculator } from "../billing/usage/CostCalculator.js";

/**
 * Base abstract class for LLM providers
 * Implements common high-level request methods that handle the complete request-response-usage cycle
 */
export abstract class BaseLLMProvider implements LLMProvider {
  /**
   * Paths supported by this provider
   * Must be implemented by each provider
   */
  abstract readonly SUPPORTED_PATHS: readonly string[];

  /**
   * Forward a request to the provider
   * Must be implemented by each provider
   */
  abstract forwardRequest(
    apiKey: string | null,
    path: string,
    method: string,
    data?: any,
    isStream?: boolean
  ): Promise<AxiosResponse | { error: string; status?: number; details?: any } | null>;

  /**
   * Parse non-streaming response and extract usage information
   * Must be implemented by each provider
   */
  abstract parseResponse(response: AxiosResponse): any;

  /**
   * Extract USD cost from provider response (optional)
   * Can be overridden by providers that support native USD cost
   */
  extractProviderUsageUsd?(response: AxiosResponse): number | undefined;

  /**
   * Prepare request data for this provider (optional)
   * Can be overridden by providers that need custom request preparation
   */
  prepareRequestData?(data: any, isStream: boolean): any;

  /**
   * Create a usage extractor for this provider (optional)
   * Can be overridden by providers that have custom usage extraction logic
   */
  createUsageExtractor?(): UsageExtractor;

  /**
   * Create a stream processor for this provider (optional)
   * Can be overridden by providers that have custom stream processing logic
   */
  createStreamProcessor?(model: string, initialCost?: number): StreamProcessor;

  /**
   * High-level request method for non-streaming requests
   * Handles forward request, parsing, and usage extraction
   */
  async executeRequest(
    apiKey: string | null,
    path: string,
    method: string,
    data?: any
  ): Promise<ExecuteResponse> {
    try {
      // Prepare request data using provider-specific logic
      let finalRequestData = data;
      if (finalRequestData && this.prepareRequestData) {
        finalRequestData = this.prepareRequestData(finalRequestData, false);
      }

      // Forward the request
      const response = await this.forwardRequest(apiKey, path, method, finalRequestData, false);

      // Handle null response
      if (!response) {
        return {
          success: false,
          statusCode: 502,
          error: 'No response received from provider'
        };
      }

      // Handle error response
      if ('error' in response) {
        return {
          success: false,
          statusCode: response.status || 500,
          error: response.error,
          details: response.details
        };
      }

      // Parse the response
      const responseData = this.parseResponse(response);

      // Extract usage and calculate cost
      const model = finalRequestData?.model || 'unknown';
      const providerCostUsd = this.extractProviderUsageUsd ? this.extractProviderUsageUsd(response) : undefined;
      
      let usage: UsageInfo | undefined;
      let cost: PricingResult | undefined;

      // Get provider-specific usage extractor
      if (this.createUsageExtractor) {
        const extractor = this.createUsageExtractor();
        const extractedUsage = extractor.extractFromResponseBody(responseData);
        usage = extractedUsage || undefined;
        
        if (usage) {
          const calculatedCost = CostCalculator.calculateRequestCost(model, providerCostUsd, usage);
          cost = calculatedCost || undefined;
          console.log(`[${this.constructor.name}] Extracted usage for non-stream response`);
        }
      }

      return {
        success: true,
        statusCode: response.status,
        response: responseData,
        usage,
        cost,
        rawResponse: response
      };

    } catch (error) {
      console.error(`[${this.constructor.name}] Error in executeRequest:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      };
    }
  }

  /**
   * High-level request method for streaming requests
   * Automatically forwards stream to destination and returns final statistics
   */
  async executeStreamRequest(
    apiKey: string | null,
    path: string,
    method: string,
    data: any,
    destination: NodeJS.WritableStream
  ): Promise<ExecuteStreamResponse> {
    try {
      // Prepare request data using provider-specific logic
      const finalRequestData = this.prepareRequestData 
        ? this.prepareRequestData(data, true) 
        : data;

      // Forward the streaming request
      const response = await this.forwardRequest(apiKey, path, method, finalRequestData, true);

      // Handle null response
      if (!response) {
        return {
          success: false,
          statusCode: 502,
          totalBytes: 0,
          error: 'No response received from provider'
        };
      }

      // Handle error response
      if ('error' in response) {
        return {
          success: false,
          statusCode: response.status || 500,
          totalBytes: 0,
          error: response.error,
          details: response.details
        };
      }

      // Create stream processor if available
      const model = finalRequestData.model || 'unknown';
      const providerCostUsd = this.extractProviderUsageUsd ? this.extractProviderUsageUsd(response) : undefined;
      const processor = this.createStreamProcessor ? this.createStreamProcessor(model, providerCostUsd) : undefined;

      if (processor) {
        console.log(`[${this.constructor.name}] Created stream processor for model: ${model}`);
      }

      // Automatically forward stream to destination and wait for completion
      return new Promise((resolve, reject) => {
        let totalBytes = 0;
        
        response.data.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          
          // Automatically call processor if available
          if (processor) {
            processor.processChunk(chunk.toString());
          }
          
          // Forward to destination stream
          destination.write(chunk);
        });

        response.data.on('end', () => {
          const finalUsage = processor?.getFinalUsage();
          const finalCost = processor?.getFinalCost();
          
          // End the destination stream
          destination.end();
          
          resolve({
            success: true,
            statusCode: response.status,
            totalBytes,
            usage: finalUsage || undefined,
            cost: finalCost || undefined,
            rawResponse: response
          });
        });

        response.data.on('error', (error: Error) => {
          console.error(`[${this.constructor.name}] Stream error:`, error);
          try {
            destination.end();
          } catch (e) {
            // Ignore errors when ending the stream (it might already be closed)
          }
          reject(error);
        });
      });

    } catch (error) {
      console.error(`[${this.constructor.name}] Error in executeStreamRequest:`, error);
      return {
        success: false,
        statusCode: 502,
        totalBytes: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      };
    }
  }
}
