import { ToolRegistry } from 'nuwa-script';
import { buildPrompt } from 'nuwa-script';

// Define a type for message history
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIServiceOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  appSpecificGuidance?: string;
  baseUrl?: string;
}

export class AIService {
  private options: AIServiceOptions;

  constructor(options: AIServiceOptions) {
    this.options = {
      model: options.model || 'gpt-4o',
      maxTokens: 4000,
      temperature: 0.3,
      baseUrl: options.baseUrl || 'https://api.openai.com',
      ...options,
    };
    if (this.options.baseUrl!.endsWith('/')) {
      this.options.baseUrl = this.options.baseUrl!.slice(0, -1);
    }
  }

  async generateNuwaScript(
    prompt: string, 
    toolRegistry: ToolRegistry,
    history: Message[] = [] // Add optional history parameter
  ): Promise<string> {
    if (!this.options.apiKey) {
      throw new Error('API key is required');
    }

    let fullUrl: string;
    const normalizedBaseUrl = this.options.baseUrl!;
    if (normalizedBaseUrl.endsWith('/v1')) {
      fullUrl = `${normalizedBaseUrl}/chat/completions`;
    } else {
      fullUrl = `${normalizedBaseUrl}/v1/chat/completions`;
    }

    console.log(`Constructed API URL: ${fullUrl}`);

    try {
      // 1. Get NuwaScript-specific instructions (syntax, tools, state format)
      const nuwaScriptInstructions = buildPrompt(toolRegistry, { 
        includeState: true // Or based on some logic if needed
      });

      // 2. Get Application-specific guidance (passed during AIService initialization)
      const appGuidance = this.options.appSpecificGuidance || ""; // Default to empty string if not provided

      // 3. Combine Application Guidance and NuwaScript Instructions for the system prompt
      let finalSystemPrompt: string;
      const placeholder = '__NUWA_SCRIPT_INSTRUCTIONS_PLACEHOLDER__';
      if (appGuidance.includes(placeholder)) {
        finalSystemPrompt = appGuidance.replace(placeholder, nuwaScriptInstructions);
      } else {
        console.warn(`Warning: appSpecificGuidance does not contain the placeholder '${placeholder}'. Appending NuwaScript instructions at the end.`);
        finalSystemPrompt = `${appGuidance}

--- NuwaScript Generation Rules ---
${nuwaScriptInstructions}`;
      }
      console.log(`Final System Prompt: ${finalSystemPrompt}`);
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: "system", content: finalSystemPrompt }, 
            ...history, // Spread the history messages
            { role: "user", content: prompt } // Current user prompt at the end
          ],
          max_tokens: this.options.maxTokens,
          temperature: this.options.temperature,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content returned from API');
      }

      return content.trim();
    } catch (error) {
      console.error('Error calling API:', error);
      throw error;
    }
  }

  async explainNuwaScript(code: string): Promise<string> {
    if (!this.options.apiKey) {
      throw new Error('API key is required');
    }

    let fullUrl: string;
    const normalizedBaseUrl = this.options.baseUrl!;
    if (normalizedBaseUrl.endsWith('/v1')) {
      fullUrl = `${normalizedBaseUrl}/chat/completions`;
    } else {
      fullUrl = `${normalizedBaseUrl}/v1/chat/completions`;
    }

    console.log(`Constructed API URL for explanation: ${fullUrl}`);

    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that explains NuwaScript code. Provide clear, concise explanations of what the code does.'
            },
            {
              role: 'user',
              content: `Explain the following NuwaScript code:

${code}`
            }
          ],
          max_tokens: this.options.maxTokens,
          temperature: this.options.temperature,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content returned from API');
      }

      return content.trim();
    } catch (error) {
      console.error('Error calling API:', error);
      throw error;
    }
  }
}