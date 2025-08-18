import { Interpreter, OutputHandler, Scope } from '../src/interpreter';
import { parse } from '../src/parser';
// Import Zod for schema definition
import { z } from 'zod';
// Remove ToolSchema, ToolFunction, SchemaInput (no longer needed here)
import {
    ToolRegistry,
    // ToolSchema, 
    // ToolFunction,
    NormalizedToolSchema,
    // SchemaInput,
    EvaluatedToolArguments
} from '../src/tools';
import { JsonValue } from '../src/values';
// Remove JSONSchema types if not directly used elsewhere in this file
// import { JSONSchema7, JSONSchema7Definition } from 'json-schema';

// --- Mock Tools Setup ---

export interface MockCallLog {
    toolName: string;
    // Use unknown because args before validation could be anything
    args: unknown; 
}

// --- Define Tool Schemas using Zod ---

const getPriceParams = z.object({
    token: z.string().describe('Crypto token symbol')
});
const getPriceReturn = z.union([z.number(), z.null()]).describe('Price in USD or null if not found');

const swapParams = z.object({
    from_token: z.string(),
    to_token: z.string(),
    amount: z.number().positive()
});
const swapReturn = z.object({
    success: z.boolean(),
    from: z.string(),
    to: z.string(),
    amount: z.number()
}).describe('Object indicating swap result');

const errorToolParams = z.object({}); // No params
const errorToolReturn = z.any().describe('Never returns successfully'); // Can return anything theoretically before error

const getListParams = z.object({});
const getListReturn = z.array(z.number()).describe('A list of numbers');

const getObjParams = z.object({});
const getObjReturn = z.object({
    nested: z.object({ value: z.number() })
}).describe('An object with nested structure');


// --- Define Tool Implementations (using inferred Zod types) ---

const mockGetPrice = (args: z.infer<typeof getPriceParams>): z.infer<typeof getPriceReturn> => {
    if (args.token === 'BTC') return 65000;
    if (args.token === 'ETH') return 3500;
    return null;
};

const mockSwap = async (args: z.infer<typeof swapParams>): Promise<z.infer<typeof swapReturn>> => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return {
        success: true,
        from: args.from_token,
        to: args.to_token,
        amount: args.amount
    };
};

const mockErrorTool = (args: z.infer<typeof errorToolParams>): z.infer<typeof errorToolReturn> => {
    throw new Error("Tool failed intentionally");
};

const mockGetList = (args: z.infer<typeof getListParams>): z.infer<typeof getListReturn> => {
    return [10, 20, 30];
};

const mockGetObj = (args: z.infer<typeof getObjParams>): z.infer<typeof getObjReturn> => {
    return { nested: { value: 99 } };
};

// --- Core runScript Helper (remains the same) ---
export async function runScript(
    scriptText: string,
    toolRegistry: ToolRegistry,
    outputHandler: OutputHandler,
    initialScope?: Record<string, JsonValue>
): Promise<Scope> {
    const interpreter = new Interpreter(toolRegistry, outputHandler);
    return await interpreter.executeScript(scriptText, initialScope);
}

// --- Setup Helper (MODIFIED) ---

export function setupTestContext(): {
    toolRegistry: ToolRegistry;
    mockOutputHandler: OutputHandler;
    capturedOutput: string[];
    callLog: MockCallLog[]; // Log remains for checking if tool was attempted
} {
    const toolRegistry = new ToolRegistry();
    const capturedOutput: string[] = [];
    const callLog: MockCallLog[] = []; // Log raw args received by adapter
    const mockOutputHandler: OutputHandler = (output: string) => {
        capturedOutput.push(output);
    };

    // Wrapper to log calls before execution (adapter function handles validation)
    const logWrapper = <P extends z.ZodTypeAny, R extends z.ZodTypeAny>(
        toolName: string, 
        func: (args: z.infer<P>) => z.infer<R> | Promise<z.infer<R>> | JsonValue | Promise<JsonValue>
    ) => {
        return async (args: z.infer<P>): Promise<any> => { // Input args are already validated by internal adapter
            // Log the validated args received by the user function
            callLog.push({ toolName, args }); 
            return await func(args);
        }
    };

    // Register mock tools using the NEW register signature
    toolRegistry.register({
        name: 'get_price', 
        description: 'Get crypto price', 
        parameters: getPriceParams, 
        returns: { schema: getPriceReturn },
        // Define execute inline, args type is inferred!
        execute: logWrapper('get_price', (args) => { 
            // No need for: args: z.infer<typeof getPriceParams>
            if (args.token === 'BTC') return 65000;
            if (args.token === 'ETH') return 3500;
            return null;
        })
    });
    toolRegistry.register({
        name: 'swap', 
        description: 'Swap tokens', 
        parameters: swapParams, 
        returns: { schema: swapReturn },
        execute: logWrapper('swap', async (args) => { 
            await new Promise(resolve => setTimeout(resolve, 10));
            return {
                success: true,
                from: args.from_token,
                to: args.to_token,
                amount: args.amount
            };
        })
    });
    toolRegistry.register({
        name: 'error_tool', 
        description: 'This tool always fails', 
        parameters: errorToolParams, 
        returns: { schema: errorToolReturn },
        execute: logWrapper('error_tool', (args) => { 
            throw new Error("Tool failed intentionally");
        })
    });
    toolRegistry.register({
        name: 'get_list', 
        description: 'Returns a list', 
        parameters: getListParams, 
        returns: { schema: getListReturn },
        execute: logWrapper('get_list', (args) => { 
            return [10, 20, 30];
        })
    });
    toolRegistry.register({
        name: 'get_obj', 
        description: 'Returns an object', 
        parameters: getObjParams, 
        returns: { schema: getObjReturn },
        execute: logWrapper('get_obj', (args) => { 
            return { nested: { value: 99 } };
        })
    });

    return { toolRegistry, mockOutputHandler, capturedOutput, callLog };
} 