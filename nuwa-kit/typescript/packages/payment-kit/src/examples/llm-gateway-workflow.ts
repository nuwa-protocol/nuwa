/**
 * Example: LLM Gateway / MCP API Payment Workflow
 * 
 * This example demonstrates the complete payment flow for API services where:
 * 1. Client makes API request without knowing the cost upfront
 * 2. Gateway processes request, calculates cost, and generates SubRAV
 * 3. Client signs the SubRAV and includes it in subsequent requests
 */

import { PaymentChannelPayerClient } from '../client/PaymentChannelPayerClient';
import { PaymentChannelPayeeClient } from '../client/PaymentChannelPayeeClient';
import type { SignedSubRAV, SubRAV } from '../core/types';
import type { IPaymentChannelContract } from '../contracts/IPaymentChannelContract';
import type { SignerInterface, DIDResolver } from '@nuwa-ai/identity-kit';

// -------- Gateway (Server) Side Implementation --------

export class LLMGatewayPaymentHandler {
  private payeeClient: PaymentChannelPayeeClient;

  constructor(payeeClient: PaymentChannelPayeeClient) {
    this.payeeClient = payeeClient;
  }

  /**
   * Create a properly configured PayeeClient with DID resolver
   */
  static async create(options: {
    contract: IPaymentChannelContract;
    signer: SignerInterface;
    didResolver: DIDResolver; // Now required
  }): Promise<LLMGatewayPaymentHandler> {
    const payeeClient = new PaymentChannelPayeeClient({
      contract: options.contract,
      signer: options.signer,
      didResolver: options.didResolver, // Pass required didResolver
    });
    
    return new LLMGatewayPaymentHandler(payeeClient);
  }

  /**
   * Process API request and generate payment request
   */
  async processAPIRequest(params: {
    channelId: string;
    payerKeyId: string; // e.g., "did:example:client#key1"
    request: any; // API request payload
    previousSignedRAV?: SignedSubRAV; // Optional: previous payment proof
  }): Promise<{
    response: any;
    subRAV: SubRAV; // Unsigned SubRAV for client to sign
    totalCost: bigint;
  }> {
    // 1. Verify previous payment if provided
    if (params.previousSignedRAV) {
      await this.payeeClient.processSignedSubRAV(params.previousSignedRAV);
    }

    // 2. Process the actual request (e.g., LLM inference)
    const response = await this.processLLMRequest(params.request);

    // 3. Calculate cost based on actual usage
    const cost = this.calculateCost(params.request, response);

    // 4. Generate SubRAV for this consumption
    const subRAV = await this.payeeClient.generateSubRAV({
      channelId: params.channelId,
      payerKeyId: params.payerKeyId,
      amount: cost,
      description: `LLM API call - ${this.getRequestDescription(params.request)}`,
    });

    return {
      response,
      subRAV,
      totalCost: cost,
    };
  }

  /**
   * Verify signed SubRAV from client
   */
  async verifyPayment(signedSubRAV: SignedSubRAV): Promise<boolean> {
    const verification = await this.payeeClient.verifySubRAV(signedSubRAV);
    if (verification.isValid) {
      await this.payeeClient.processSignedSubRAV(signedSubRAV);
      return true;
    }
    return false;
  }

  // Mock implementations
  private async processLLMRequest(request: any): Promise<any> {
    // Simulate LLM processing
    return {
      text: `Response to: ${request.prompt}`,
      tokens_used: Math.floor(Math.random() * 1000) + 100, // Random token count
    };
  }

  private calculateCost(request: any, response: any): bigint {
    // Calculate cost based on tokens used
    const tokensUsed = response.tokens_used;
    const costPerToken = BigInt(100); // 100 micro-units per token
    return BigInt(tokensUsed) * costPerToken;
  }

  private getRequestDescription(request: any): string {
    return `${request.model || 'default'} model`;
  }
}

// -------- Client Side Implementation --------

export class LLMGatewayClient {
  private payerClient: PaymentChannelPayerClient;
  private channelId: string;
  private gatewayUrl: string;

  constructor(
    payerClient: PaymentChannelPayerClient,
    channelId: string,
    gatewayUrl: string
  ) {
    this.payerClient = payerClient;
    this.channelId = channelId;
    this.gatewayUrl = gatewayUrl;
  }

  /**
   * Make an API call with automatic payment handling
   */
  async callAPI(params: {
    prompt: string;
    model?: string;
    maxCost?: bigint; // Optional: maximum cost client is willing to pay
  }): Promise<{
    response: any;
    cost: bigint;
    signedSubRAV: SignedSubRAV;
  }> {
    // 1. Make initial API request
    const apiResponse = await this.makeAPIRequest({
      prompt: params.prompt,
      model: params.model,
    });

    // 2. Check if cost is acceptable
    if (params.maxCost && apiResponse.totalCost > params.maxCost) {
      throw new Error(`Cost ${apiResponse.totalCost} exceeds maximum ${params.maxCost}`);
    }

    // 3. Sign the SubRAV
    const signedSubRAV = await this.payerClient.signSubRAV(apiResponse.subRAV, {
      validateBeforeSigning: true,
      maxAmount: params.maxCost,
    });

    // 4. Send signed SubRAV back to gateway for confirmation
    await this.confirmPayment(signedSubRAV);

    return {
      response: apiResponse.response,
      cost: apiResponse.totalCost,
      signedSubRAV,
    };
  }

  /**
   * Make streaming API call with progressive payments
   */
  async callStreamingAPI(params: {
    prompt: string;
    model?: string;
    onChunk?: (chunk: any, cumulativeCost: bigint) => void;
    maxCost?: bigint;
  }): Promise<{
    fullResponse: any;
    totalCost: bigint;
    payments: SignedSubRAV[];
  }> {
    const payments: SignedSubRAV[] = [];
    let cumulativeCost = BigInt(0);
    let fullResponse = '';

    // For streaming, we might make multiple micro-payments
    // This is a simplified example - real implementation would be more complex
    const chunks = await this.makeStreamingAPIRequest(params);

    for (const chunk of chunks) {
      // Each chunk comes with its cost and SubRAV
      if (params.maxCost && cumulativeCost + chunk.cost > params.maxCost) {
        throw new Error(`Cumulative cost would exceed maximum`);
      }

      const signedSubRAV = await this.payerClient.signSubRAV(chunk.subRAV);
      payments.push(signedSubRAV);
      
      cumulativeCost += chunk.cost;
      fullResponse += chunk.text;

      params.onChunk?.(chunk, cumulativeCost);
    }

    return {
      fullResponse,
      totalCost: cumulativeCost,
      payments,
    };
  }

  // Mock HTTP implementations
  private async makeAPIRequest(request: any): Promise<{
    response: any;
    subRAV: SubRAV;
    totalCost: bigint;
  }> {
    // In real implementation, this would be an HTTP request to the gateway
    // For now, simulate the response structure
    return {
      response: { text: `Mock response to: ${request.prompt}`, tokens_used: 150 },
      subRAV: {
        version: 1,
        chainId: BigInt(1),
        channelId: this.channelId,
        channelEpoch: BigInt(0),
        vmIdFragment: 'key1',
        accumulatedAmount: BigInt(15000), // 150 tokens * 100 units/token
        nonce: BigInt(1),
      },
      totalCost: BigInt(15000),
    };
  }

  private async makeStreamingAPIRequest(params: any): Promise<Array<{
    text: string;
    cost: bigint;
    subRAV: SubRAV;
  }>> {
    // Mock streaming response
    return [
      {
        text: 'Hello',
        cost: BigInt(5000),
        subRAV: {
          version: 1,
          chainId: BigInt(1),
          channelId: this.channelId,
          channelEpoch: BigInt(0),
          vmIdFragment: 'key1',
          accumulatedAmount: BigInt(5000),
          nonce: BigInt(1),
        },
      },
      {
        text: ' World!',
        cost: BigInt(3000),
        subRAV: {
          version: 1,
          chainId: BigInt(1),
          channelId: this.channelId,
          channelEpoch: BigInt(0),
          vmIdFragment: 'key1',
          accumulatedAmount: BigInt(8000),
          nonce: BigInt(2),
        },
      },
    ];
  }

  private async confirmPayment(signedSubRAV: SignedSubRAV): Promise<void> {
    // In real implementation, send the signed SubRAV back to the gateway
    console.log(`Payment confirmed for amount ${signedSubRAV.subRav.accumulatedAmount}`);
  }
}

// -------- Usage Example --------

export async function demonstrateAPIPaymentFlow() {
  // This would be initialized with actual contract and signer instances
  const mockPayerClient = {} as PaymentChannelPayerClient;
  const mockContract = {} as IPaymentChannelContract; // IPaymentChannelContract
  const mockPayeeSigner = {} as SignerInterface; // SignerInterface  
  const mockDIDResolver = {} as DIDResolver; // DIDResolver

  // Gateway side - with proper DID resolver for signature verification
  const gateway = await LLMGatewayPaymentHandler.create({
    contract: mockContract,
    signer: mockPayeeSigner,
    didResolver: mockDIDResolver, // Essential for verifying payer signatures
  });
  
  // Client side
  const client = new LLMGatewayClient(
    mockPayerClient,
    'channel-123',
    'https://api.llm-gateway.example.com'
  );

  try {
    // Make API call with automatic payment
    const result = await client.callAPI({
      prompt: 'Explain quantum computing',
      model: 'gpt-4',
      maxCost: BigInt(100000), // Maximum willing to pay
    });

    console.log('API Response:', result.response);
    console.log('Cost:', result.cost);
    console.log('Payment completed:', result.signedSubRAV.subRav.nonce);

    // Gateway can now verify the signature properly
    const isValid = await gateway.verifyPayment(result.signedSubRAV);
    console.log('Payment verification:', isValid);

  } catch (error) {
    console.error('API call failed:', error);
  }
} 