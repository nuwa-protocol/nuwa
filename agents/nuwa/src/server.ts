import express, { Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';
import bodyParser from 'body-parser';
import { Agent } from './agent.js';
import * as schema from './a2a-schema.js';
import {
    Task,
    Message,
    TextPart,
    TaskSendParams,
    TaskStatus,
    A2AError,
    ErrorCodeInternalError,
    // Participant // Removed - defined locally in agent.ts
} from './a2a-schema.js';
import { TaskStore, InMemoryTaskStore, TaskAndHistory } from './server/store.js';
import { TaskHandler, TaskContext } from './server/handler.js';
import { getCurrentTimestamp, isTaskStatusUpdate, isArtifactUpdate } from './server/utils.js';
// Removed AgentMessage import - type comes from Agent class method
import { AgentCard } from './a2a-schema.js'; 
import { A2AError as A2AErrorClass } from './server/error.js';
import type { A2AError as A2AErrorType } from './server/error.js';

// --- In-memory storage for task message history ---
const taskHistories = new Map<string, Message[]>();
// -------------------------------------------------

/**
 * Options for configuring the Nuwa A2AServer.
 */
export interface NuwaA2AServerOptions {
    taskStore?: TaskStore;
    cors?: CorsOptions | boolean | string;
    basePath?: string;
    // Agent instance will be created within the server
}

// Forward declare NuwaA2AServer to access the agent instance within the handler
let globalAgentInstance: Agent | null = null;

/**
 * Simple Task Handler for Nuwa Agent using the Agent class.
 */
const nuwaAgentTaskHandler: TaskHandler = async function* (context: TaskContext) {
    console.log(`[TaskHandler ${context.task.id}] Handling task.`);
    const { userMessage, history, isCancelled } = context;

    if (!globalAgentInstance) {
        console.error(`[TaskHandler ${context.task.id}] Agent instance is not initialized.`);
        yield { state: 'failed', message: { role: 'agent', parts: [{ type: 'text', text: 'Internal Server Error: Agent not initialized.' }] } };
        return;
    }

    // Extract text from the current user message
    const userTextPart = userMessage.parts.find((part: schema.Part): part is schema.TextPart => part.type === 'text');
    if (!userTextPart?.text) {
        console.error(`[TaskHandler ${context.task.id}] No text found in user message.`);
        yield { state: 'failed', message: { role: 'agent', parts: [{ type: 'text', text: 'Could not extract text from user message.' }] } };
        return; // End the generator
    }

    // Check for cancellation before calling agent
    if (isCancelled()) {
        console.log(`[TaskHandler ${context.task.id}] Task was cancelled.`);
        yield { state: 'canceled' };
        return;
    }

    try {
        // Prepare the AgentMessage (Type is inferred from Agent.handleMessage)
        const agentMessage = {
            text: userTextPart.text, // The current user message text
            history: history.slice(0, -1).map(msg => ({
                role: msg.role,
                content: msg.parts.find(p => p.type === 'text')?.text || null
            }))
        };
        
        console.log(`[TaskHandler ${context.task.id}] Calling agentInstance.handleMessage...`);
        const agentResponse = await globalAgentInstance.handleMessage(agentMessage);
        console.log(`[TaskHandler ${context.task.id}] Received response from agentInstance.`);

        // Yield the final 'completed' state with the response message
        const agentResponseMessage: Message = {
            role: 'agent',
            parts: [{ type: 'text', text: agentResponse.response.text }]
        };
        yield { state: 'completed', message: agentResponseMessage };
        console.log(`[TaskHandler ${context.task.id}] Task completed successfully.`);

    } catch (error) {
        console.error(`[TaskHandler ${context.task.id}] Error calling agent logic:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error in agent logic.';
        yield { state: 'failed', message: { role: 'agent', parts: [{ type: 'text', text: `Agent failed: ${errorMessage}` }] } };
    }
};

/**
 * Implements an A2A specification compliant server for the Nuwa Agent.
 */
export class NuwaA2AServer {
    private taskHandler: TaskHandler;
    private taskStore: TaskStore;
    private corsOptions: CorsOptions | boolean | string;
    private basePath: string;
    private activeCancellations: Set<string> = new Set();
    private agentCard: schema.AgentCard;
    private agentInstance: Agent; // Store the Agent instance

    constructor(options: NuwaA2AServerOptions = {}) {
        this.taskHandler = nuwaAgentTaskHandler; // Use the updated handler
        this.taskStore = options.taskStore ?? new InMemoryTaskStore();
        this.corsOptions = options.cors ?? true;
        this.basePath = options.basePath ?? "/a2a";

        // Ensure base path format
        if (!this.basePath.startsWith("/")) this.basePath = "/" + this.basePath;
        if (this.basePath.endsWith("/")) this.basePath = this.basePath.slice(0, -1);

        // Define the Agent Card
        this.agentCard = {
            name: "Nuwa Agent",
            description: "An AI assistant powered by NuwaScript and LLMs.",
            url: this.basePath, // Use formatted base path
            version: "0.1.0",
            capabilities: {
                streaming: false, 
                pushNotifications: false,
                stateTransitionHistory: false
            },
            authentication: null,
            defaultInputModes: ["text"],
            defaultOutputModes: ["text"],
            skills: [{ id: "chat", name: "General Chat", description: "Have a general conversation." }]
        };

        // Create the Agent instance, passing config derived from AgentCard
        // The type 'AgentConfig' is defined locally in agent.ts
        const nuwaSystemPrompt = `You are **Nuwa**, the origin AI Agent of the Nuwa platform.

Nuwa platform is for building autonomous Web3 AI Agents that can manage crypto assets. Built on the Rooch Network, it enables AI to participate in the crypto market through decentralized wallets that interact with both on-chain smart contracts and off-chain tools.

You are the wise, autonomous guide of the entire on-chain Agent ecosystem.

Your goal is to assist users and developers, fostering the growth of the Nuwa community.

# NuwaScript Generation Instructions:
# The following sections define the NuwaScript syntax, available tools, and current state format. Adhere strictly to these rules when generating code.
__NUWA_SCRIPT_INSTRUCTIONS_PLACEHOLDER__`;

        const agentConfig = { 
             id: "nuwa-agent-instance", // Example ID
             name: this.agentCard.name,
             // Set the system prompt for the Nuwa Agent
             systemPrompt: nuwaSystemPrompt
        };
        try {
            // Pass agentConfig. The 'as any' cast might be removable if TS can infer types correctly now.
            this.agentInstance = new Agent(agentConfig as any);
            globalAgentInstance = this.agentInstance; // Make instance globally accessible to handler
            console.log(`[A2AServer] Agent instance created successfully.`);
        } catch (error) {
            console.error("[A2AServer] FATAL: Failed to initialize Agent instance:", error);
            throw new Error(`Failed to initialize Agent: ${error instanceof Error ? error.message : String(error)}`);
        }

        console.log(`[A2AServer] Initialized with base path: ${this.basePath}`);
    }

    /**
     * Starts the Express server listening on the specified port.
     */
    start(port = 3000): express.Express {
        const app = express();

        // Configure CORS
        if (this.corsOptions !== false) {
            const corsConfig = typeof this.corsOptions === "string" ? { origin: this.corsOptions } : this.corsOptions === true ? undefined : this.corsOptions;
            app.use(cors(corsConfig));
        }

        // Middleware
        app.use(express.json()); // Parse JSON bodies

        // Agent Card endpoint
        app.get("/.well-known/agent.json", (req, res) => {
            console.log(`[A2AServer] Serving agent card at /.well-known/agent.json`);
            res.json(this.agentCard);
        });

        // Mount the A2A endpoint handler
        app.post(this.basePath, this.endpoint());
        console.log(`[A2AServer] A2A endpoint mounted at POST ${this.basePath}`);

        // Basic error handler
        app.use(this.errorHandler);

        // Start listening
        app.listen(port, () => {
            console.log(`[A2AServer] Nuwa Agent A2A server listening on http://localhost:${port}`);
        });

        return app;
    }

    /**
     * Returns an Express RequestHandler function to handle A2A requests.
     */
    endpoint(): express.RequestHandler {
        return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            const requestBody = req.body;
            let taskId: string | undefined;
            let reqId: string | number | null = null; // Capture reqId early

            try {
                // Try to get reqId even before full validation
                if (typeof requestBody === 'object' && requestBody !== null && 'id' in requestBody) {
                    reqId = requestBody.id;
                }

                if (!this.isValidJsonRpcRequest(requestBody)) {
                    // Use imported class with static method
                    throw A2AErrorClass.invalidRequest("Invalid JSON-RPC request structure.");
                }
                taskId = (requestBody.params as any)?.id;

                switch (requestBody.method) {
                    case "tasks/send":
                        await this.handleTaskSend(requestBody as schema.SendTaskRequest, res);
                        break;
                    // case "tasks/sendSubscribe": // Not supported yet
                    //     await this.handleTaskSendSubscribe(requestBody as schema.SendTaskStreamingRequest, res);
                    //     break;
                    case "tasks/get":
                        await this.handleTaskGet(requestBody as schema.GetTaskRequest, res);
                        break;
                    case "tasks/cancel":
                        await this.handleTaskCancel(requestBody as schema.CancelTaskRequest, res);
                        break;
                    default:
                        throw A2AErrorClass.methodNotFound(requestBody.method);
                }
            } catch (error) {
                let normalizedError = error;
                // Ensure it's an A2AError instance before adding taskId
                if (normalizedError instanceof A2AErrorClass && taskId && !normalizedError.taskId) {
                    normalizedError.taskId = taskId;
                }
                // Pass potentially non-A2AError to normalizeError
                // Use ?? null for reqId
                next(this.normalizeError(normalizedError, reqId ?? null, taskId));
            }
        };
    }

    // --- Request Handlers (Adapted from sample) ---

    private async handleTaskSend(req: schema.SendTaskRequest, res: express.Response): Promise<void> {
        this.validateTaskSendParams(req.params);
        const { id: taskId, message, sessionId, metadata } = req.params;

        let currentData = await this.loadOrCreateTaskAndHistory(taskId, message, sessionId, metadata);
        const context = this.createTaskContext(currentData.task, message, currentData.history);
        const generator = this.taskHandler(context);

        try {
            for await (const yieldValue of generator) {
                currentData = this.applyUpdateToTaskAndHistory(currentData, yieldValue);
                await this.taskStore.save(currentData);
            }
        } catch (handlerError) {
            // Assuming TaskState includes 'failed' string literal
            const failureStatusUpdate: Omit<schema.TaskStatus, "timestamp"> = {
                 state: "failed" as any, // Cast state to any to bypass strict check for now
                 message: { role: "agent", parts: [{ type: "text", text: `Handler failed: ${handlerError instanceof Error ? handlerError.message : String(handlerError)}` }] }
            };
            currentData = this.applyUpdateToTaskAndHistory(currentData, failureStatusUpdate);
            try { await this.taskStore.save(currentData); } catch (saveError) {
                 console.error(`[A2AServer ${taskId}] Failed to save task after handler error:`, saveError); 
            }
            let errorToThrow: Error;
            if (handlerError instanceof A2AErrorClass) {
                errorToThrow = handlerError;
            } else if (handlerError instanceof Error) {
                errorToThrow = A2AErrorClass.internalError(handlerError.message, { stack: handlerError.stack });
            } else {
                errorToThrow = A2AErrorClass.internalError("Unknown handler error.", handlerError);
            }
             if (errorToThrow instanceof A2AErrorClass && !errorToThrow.taskId) {
                errorToThrow.taskId = taskId;
            }
            throw errorToThrow;
        }
        // Use ?? null for req.id
        this.sendJsonResponse(res, req.id ?? null, currentData.task);
    }

    private async handleTaskGet(req: schema.GetTaskRequest, res: express.Response): Promise<void> {
        const taskId = req.params.id;
        const taskData = await this.taskStore.load(taskId);
        if (!taskData) {
            throw A2AErrorClass.taskNotFound(taskId);
        }
        // Use ?? null for req.id
        this.sendJsonResponse(res, req.id ?? null, taskData.task);
    }

    private async handleTaskCancel(req: schema.CancelTaskRequest, res: express.Response): Promise<void> {
        const taskId = req.params.id;
        this.activeCancellations.add(taskId); // Register cancellation intent
        
        const taskData = await this.taskStore.load(taskId);
        if (!taskData) {
            this.activeCancellations.delete(taskId); // Remove if task never existed
            throw A2AErrorClass.taskNotFound(taskId);
        }
        
        // TODO: Check TaskState definition before enabling these checks
        // if (taskData.task.status.state !== 'running' && taskData.task.status.state !== 'pending') {
        //     console.log(`[A2AServer ${taskId}] Task cannot be cancelled in state: ${taskData.task.status.state}`);
        //     this.activeCancellations.delete(taskId); // Remove if already finished
        //     this.sendJsonResponse(res, req.id ?? null, taskData.task);
        //     return;
        // }

        console.log(`[A2AServer ${taskId}] Cancellation requested. Handler will check.`);

        // Use ?? null for req.id
        this.sendJsonResponse(res, req.id ?? null, taskData.task);
    }
    
    // --- Helper Methods (Adapted from sample) ---

    private applyUpdateToTaskAndHistory(current: TaskAndHistory, update: Omit<schema.TaskStatus, "timestamp"> | schema.Artifact): TaskAndHistory {
        // const timestamp = getCurrentTimestamp(); // Removed unless types have timestamp
        const updatedTask = { ...current.task };
        const updatedHistory = [...current.history];
    
        if (isTaskStatusUpdate(update)) {
            // Remove timestamp unless TaskStatus definition includes it
            updatedTask.status = { ...update /*, timestamp*/ }; 
            if (update.message) {
                // Remove timestamp unless Message definition includes it
                updatedHistory.push({ ...update.message /*, timestamp*/ }); 
            }
        } else if (isArtifactUpdate(update)) { // Handle Artifacts
            if (!updatedTask.artifacts) updatedTask.artifacts = [];
            // Remove timestamp unless Artifact definition includes it
            updatedTask.artifacts.push({ ...update /*, timestamp*/ }); 
        }
    
        return { task: updatedTask, history: updatedHistory };
    }

    private async loadOrCreateTaskAndHistory(taskId: string, initialMessage: schema.Message, sessionId?: string | null, metadata?: Record<string, unknown> | null): Promise<TaskAndHistory> {
        let existing = await this.taskStore.load(taskId);
        if (existing) {
            // const timestamp = getCurrentTimestamp(); // Removed unless types have timestamp
            // Remove timestamp unless Message definition includes it
            const updatedHistory = [...existing.history, { ...initialMessage /*, timestamp*/ }];
            const updatedTask = {
                 ...existing.task,
                 // TODO: Verify TaskState type before assigning 'running'
                 // status: { state: 'running' as const, timestamp }, 
                 status: { ...existing.task.status, state: 'running' as any /*, timestamp*/ }, // Assume state change is valid, cast to any for now
                 history: undefined, 
            };
            this.activeCancellations.delete(taskId); 
            
            // TODO: Verify TaskAndHistory type compatibility, especially task.status.state
            const updatedData = { task: updatedTask as Task, history: updatedHistory };
            await this.taskStore.save(updatedData as TaskAndHistory);
            return updatedData as TaskAndHistory;
        } else {
            // const timestamp = getCurrentTimestamp(); // Removed
            // TODO: Verify TaskState type before assigning 'running'
            const initialStatus: TaskStatus = { state: 'running' as any, /*timestamp,*/ }; // Cast to any for now
            const newTask: Task = {
                id: taskId,
                status: initialStatus,
                sessionId: sessionId ?? undefined,
                metadata: metadata ?? undefined,
            };
            // Remove timestamp unless Message definition includes it
            const initialHistory: Message[] = [{ ...initialMessage /*, timestamp*/ }];
            this.activeCancellations.delete(taskId); 
            
            const newData = { task: newTask, history: initialHistory };
            await this.taskStore.save(newData);
            return newData;
        }
    }

    private createTaskContext(task: schema.Task, userMessage: schema.Message, history: schema.Message[]): TaskContext {
        return {
            task,
            userMessage,
            history, 
            isCancelled: () => this.activeCancellations.has(task.id)
        };
    }

    private isValidJsonRpcRequest(body: any): body is schema.JSONRPCRequest {
        return (
            typeof body === "object" &&
            body !== null &&
            body.jsonrpc === "2.0" &&
            typeof body.method === "string" &&
            (body.params === undefined || typeof body.params === "object") && 
            (body.id === undefined || typeof body.id === "string" || typeof body.id === "number" || body.id === null)
        );
    }

    private validateTaskSendParams(params: any): asserts params is schema.TaskSendParams {
        if (!params || typeof params.id !== 'string' || typeof params.message !== 'object') {
            throw A2AErrorClass.invalidParams("Missing or invalid required fields: id, message");
        }
    }

    private createSuccessResponse<T>(id: number | string | null, result: T): schema.JSONRPCResponse<T> {
        return { jsonrpc: "2.0", id, result };
    }

    private createErrorResponse(id: number | string | null, error: schema.JSONRPCError<unknown>): schema.JSONRPCResponse<null, unknown> {
        return { jsonrpc: "2.0", id, error };
    }

    private normalizeError(error: unknown, reqId: number | string | null, taskId?: string): schema.JSONRPCResponse<null, unknown> {
        let a2aError: A2AErrorClass;
    
        if (error instanceof A2AErrorClass) {
            a2aError = error;
        } else if (error instanceof Error) {
            a2aError = A2AErrorClass.internalError(error.message, { stack: error.stack });
        } else {
            a2aError = A2AErrorClass.internalError("An unknown error occurred.", error);
        }
        
        if (taskId && !a2aError.taskId) {
            a2aError.taskId = taskId;
        }
    
        // Corrected method name
        return this.createErrorResponse(reqId, a2aError.toJSONRPCError());
    }

    private errorHandler = (err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (res.headersSent) {
            return next(err); 
        }
        const reqId = (req.body && req.body.id !== undefined) ? req.body.id : null;
        const taskId = (req.body && req.body.params && req.body.params.id) ? req.body.params.id : undefined;
        // Use ?? null for reqId
        const errorResponse = this.normalizeError(err, reqId ?? null, taskId);
        
        // Add null check for errorResponse.error
        const statusCode = errorResponse.error ? 
                           (errorResponse.error.code === -32601 ? 404 : errorResponse.error.code === -32602 ? 400 : 500) 
                           : 500; // Default to 500 if error is null for some reason

        console.error("[A2AServer] Request Error:", JSON.stringify(errorResponse.error, null, 2));
        res.status(statusCode).json(errorResponse);
    };

    private sendJsonResponse<T>(res: express.Response, reqId: number | string | null, result: T): void {
        res.json(this.createSuccessResponse(reqId, result));
    }
}

// --- Helper function to start the server ---
export function startServer(port: number = 3000) {
    const server = new NuwaA2AServer();
    return server.start(port);
}

// Example: Start the server if this script is run directly
// Use ESM equivalent to check if this is the main module
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
// process.argv[1] is the path to the script being executed
// Use path.resolve to handle relative paths
const mainScriptPath = path.resolve(process.argv[1]);

if (__filename === mainScriptPath) {
    console.log("[Server] Running as main module. Starting server...");
    startServer();
} 