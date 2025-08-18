import { Interpreter, OutputHandler, ToolRegistry, parse } from "nuwa-script";
import { AIService } from './aiService.js';
import OpenAI from 'openai';

// --- Locally Defined Types --- 

// Rename Participant to AgentConfig
interface AgentConfig {
    id: string; 
    name: string;
    systemPrompt?: string; // Optional: Add system prompt here if it's part of the config
    // Add other fields if needed by Agent
}

// Define AgentMessage based on usage in handleMessage and server.ts
interface AgentMessage {
    text: string;
    history: { // Structure based on server.ts mapping
        role: string;
        content: string | null;
    }[];
}

// Define AgentResponse based on usage in handleMessage return type
interface AgentResponse {
    response: {
        from: string; // Agent's name
        text: string;
        // history?: any[]; // Optional: if history needs to be passed back
    };
    // stream?: any; // Add if streaming is implemented
}

// Optional: Define AgentStreamEvent if streaming is needed later
// interface AgentStreamEvent { ... }

// --- End Locally Defined Types ---

// Define a simple type for history messages used in the map
interface HistoryMessage {
    role: string;
    content: string | null;
    // Add other potential fields if needed from AgentMessage history structure
}

// Implement OutputHandler to buffer PRINT statements
class AgentOutputHandler implements OutputHandler {
    private buffer: string[] = [];

    handlePrint(value: any): void {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        this.buffer.push(`${stringValue}`);
    }

    getBufferedOutput(): string {
        return this.buffer.join('\n');
    }

    clearBuffer(): void {
        this.buffer = [];
    }
    
    // Method to get the bound handler function, similar to playground
    getHandler(): (value: any) => void {
        return this.handlePrint.bind(this);
    }
}

export class Agent {
    private interpreter: Interpreter;
    private aiService: AIService;
    private outputHandler: AgentOutputHandler;
    private toolRegistry: ToolRegistry; // Store ToolRegistry instance
    private agentConfig: AgentConfig; // Rename participant to agentConfig

    constructor(agentConfig: AgentConfig) {
        this.agentConfig = agentConfig; // Store config
        this.toolRegistry = new ToolRegistry(); // Initialize ToolRegistry
        this.outputHandler = new AgentOutputHandler();
        // Pass the handler function to the Interpreter constructor
        this.interpreter = new Interpreter(this.toolRegistry, this.outputHandler.getHandler()); 
        
        // TODO: Register actual tools into this.toolRegistry based on participant or config
        // Example registration (replace with actual tools):
        // this.toolRegistry.register(calculatorSchema, calculatorExecutor);

        // Initialize AIService (ensure required env vars like OPENAI_API_KEY are set)
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
             console.error("FATAL: OPENAI_API_KEY environment variable is not set.");
             throw new Error("OPENAI_API_KEY environment variable is not set.");
        }
        this.aiService = new AIService({
            apiKey: apiKey,
            baseUrl: process.env.OPENAI_API_BASE, // Optional: read from env
            model: process.env.OPENAI_MODEL, // Optional: read from env
            // Use systemPrompt directly from agentConfig
            systemPrompt: this.agentConfig.systemPrompt 
        });
    }

    async handleMessage(message: AgentMessage): Promise<AgentResponse> {
        console.log(`[Agent] Handling message:`, message.text);
        this.outputHandler.clearBuffer();

        // Map history
        const history = message.history.reduce((acc: OpenAI.Chat.Completions.ChatCompletionMessageParam[], msg: HistoryMessage) => {
            if (msg.role === 'user') {
                acc.push({ role: 'user', content: msg.content ?? "" });
            } else if (msg.role === 'assistant') {
                acc.push({ role: 'assistant', content: msg.content }); 
            } else if (msg.role === 'system') {
                acc.push({ role: 'system', content: msg.content ?? "" });
            }
            return acc;
        }, [] as OpenAI.Chat.Completions.ChatCompletionMessageParam[]); 

        // Add current user message
        const currentUserMessage: OpenAI.Chat.Completions.ChatCompletionUserMessageParam = {
            role: 'user',
            content: message.text
        };
        history.push(currentUserMessage);

        let scriptToExecute: string | null = null;
        let finalContent = ""; 

        try {
            // Get script from AI
            scriptToExecute = await this.aiService.generateOrGetResponse(
                history,
                this.toolRegistry 
            );
            console.log("[Agent] Received script from AIService.");
            
            // Execute script
            console.log(`[Agent] Executing script:\n--- Script Start ---\n${scriptToExecute}\n--- Script End ---`);
            try {
                const ast = parse(scriptToExecute); 
                console.log("[Agent] Script parsed successfully.");
                const exec_scope = await this.interpreter.execute(ast);
                console.log("[Agent] Script execution successful. Scope:", exec_scope);
                const bufferedOutput = this.outputHandler.getBufferedOutput();
                finalContent = bufferedOutput || "(Script executed successfully, no output)";
                console.log("[Agent] Script execution successful.");
                
                // TODO: Decide how to represent script execution in history.

            } catch (execError: any) {
                // Handle script parsing or execution errors separately
                console.error("[Agent] Script parsing or execution error:", execError);
                const bufferedOutput = this.outputHandler.getBufferedOutput();
                finalContent = bufferedOutput ? `Partial Output:\n${bufferedOutput}\n\n` : ''; 
                finalContent += `Error parsing or executing script: ${execError.message || execError}`;
            }
            // --- End Script Execution ---
            
        } catch (error) {
            // This catches errors from AIService (e.g., empty response, format error) 
            // or other errors during the process before script execution.
            console.error("[Agent] Error getting script from AIService or processing message:", error);
            let errorMessage = "An error occurred while processing your request.";
            if (error instanceof Error && error.message.startsWith('AIServiceError:')) {
                errorMessage = `Failed to get valid response from AI: ${error.message.substring('AIServiceError: '.length)}`;
            }
            finalContent = errorMessage;
        }
        
        // Return response
        console.log("[Agent] Sending final response:", finalContent);
        return {
            response: {
                from: this.agentConfig.name,
                text: finalContent,
            }
        };
    }
}