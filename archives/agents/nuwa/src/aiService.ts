import OpenAI from 'openai';
import { ToolRegistry, ToolSchema, JsonValue, buildPrompt } from 'nuwa-script'; // Import buildPrompt
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface AIServiceOptions {
    apiKey: string;
    model?: string;
    temperature?: number;
    baseUrl?: string;
    systemPrompt?: string; // Base system prompt, potentially containing the placeholder
}

// Removed AIResponse type definition - function now returns string or throws
// export type AIResponse = 
//     | { type: 'script'; script: string } 
//     | { type: 'text'; content: string };

const DEFAULT_MODEL = 'gpt-3.5-turbo';
// Removed SCRIPT_BLOCK_REGEX - no longer extracting from code blocks
// const SCRIPT_BLOCK_REGEX = /```nuwa\\n([\\s\\S]+?)\\n```/;
const NUWA_PLACEHOLDER = '__NUWA_SCRIPT_INSTRUCTIONS_PLACEHOLDER__'; // Define placeholder constant

export class AIService {
    private openaiClient: OpenAI;
    private model: string;
    private temperature?: number;
    private baseSystemPrompt?: string; // Store the user-provided base system prompt

    constructor(options: AIServiceOptions) {
        if (!options.apiKey) {
            throw new Error('OpenAI API key is required for AIService.');
        }
        this.openaiClient = new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseUrl || undefined,
        });
        this.model = options.model || DEFAULT_MODEL;
        this.temperature = options.temperature;
        this.baseSystemPrompt = options.systemPrompt; 
        console.log(`[AIService] Initialized with model: ${this.model}, temp: ${this.temperature}, baseURL: ${options.baseUrl || 'default'}`);
    }

    // Removed extractScript - no longer needed
    // private extractScript(content: string): string | null { ... }

    /**
     * Gets response from LLM, expecting raw NuwaScript code as the direct response.
     * Throws an error if the response is empty.
     */
    async generateOrGetResponse(
        history: ChatCompletionMessageParam[], // Full history including the latest user message
        toolRegistry: ToolRegistry
    ): Promise<string> { // Return type is Promise<string>
        
        // 1. Get NuwaScript instructions 
        const nuwaInstructionsPrompt = buildPrompt(toolRegistry, { 
            includeState: true 
        });

        // 2. Combine base system prompt with nuwa instructions
        let finalSystemContent = "";
        const basePrompt = this.baseSystemPrompt || "";

        if (basePrompt.includes(NUWA_PLACEHOLDER)) {
            finalSystemContent = basePrompt.replace(NUWA_PLACEHOLDER, nuwaInstructionsPrompt);
            console.log("[AIService] Replaced placeholder in base system prompt.");
        } else {
            finalSystemContent = basePrompt ? `${basePrompt}\n\n${nuwaInstructionsPrompt}` : nuwaInstructionsPrompt;
            if (basePrompt) {
                console.warn(`[AIService] Placeholder ${NUWA_PLACEHOLDER} not found. Appending Nuwa instructions.`);
            } else {
                 console.log("[AIService] No base system prompt. Using Nuwa instructions.");
            }
        }
        finalSystemContent = finalSystemContent.trim();
        // IMPORTANT: Ensure this final prompt instructs the AI to return ONLY raw NuwaScript code.
        console.log("[AIService] Final System Prompt:", finalSystemContent); 

        // 3. Prepare messages
        const messagesForAPI: ChatCompletionMessageParam[] = [
            { role: 'system', content: finalSystemContent },
            ...history 
        ];
        console.log(`[AIService] Calling OpenAI ${this.model} with ${messagesForAPI.length} messages.`);

        try {
            // 4. Call OpenAI API
            const completion = await this.openaiClient.chat.completions.create({
                model: this.model,
                messages: messagesForAPI,
                temperature: this.temperature,
            });

            // 5. Validate response content
            const responseMessage = completion.choices[0]?.message;
            if (!responseMessage || !responseMessage.content) {
                 console.error('[AIService] OpenAI response message is missing or has no content.');
                 throw new Error("AIServiceError: OpenAI returned an empty response.");
            }
            const content = responseMessage.content.trim(); // Trim the raw content
            console.log(`[AIService] Received raw content length: ${content.length}`);

            // 6. Validate if content is not empty after trimming
            if (content) {
                console.log(`[AIService] Returning trimmed AI response as NuwaScript.`);
                return content; // Return the trimmed content directly
            } else {
                // Throw error if content becomes empty after trimming
                console.error('[AIService] OpenAI response content was empty after trimming.');
                throw new Error("AIServiceError: OpenAI returned an empty response content.");
            }

        } catch (error) {
            console.error(`[AIService] Error calling OpenAI API or processing response:`, error);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`AIServiceError: ${message}`);
        }
    }
} 