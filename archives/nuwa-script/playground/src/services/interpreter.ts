// Import everything directly from the nuwa-script package (assuming ESM exports now work)
import { 
    Interpreter, 
    ToolRegistry, 
    ToolSchema,
    JsonValue, 
    EvaluatedToolArguments,
    OutputHandler,
    Scope,
    parse,
    AST,
    StateMetadata,
    StateValueWithMetadata,
    ToolContext,
    NormalizedToolSchema
} from 'nuwa-script';

// Define the Interpreter instance type - Removed as not needed
// type NuwaInterpreterInstance = InstanceType<typeof Interpreter>;

// Helper type for interpreter creation result
export interface NuwaInterface {
  interpreter: Interpreter;
  outputBuffer: string[];
  toolRegistry: ToolRegistry;
}

// Factory function to create and configure a NuwaScript interpreter
export function createInterpreter(): NuwaInterface {
  const toolRegistry = new ToolRegistry(); 
  const outputBuffer: string[] = [];
  
  const outputHandler: OutputHandler = (message) => { 
    outputBuffer.push(message);
  };

  const interpreter = new Interpreter(toolRegistry, outputHandler);

  return {
    interpreter,
    outputBuffer,
    toolRegistry,
  };
} 

// Re-export classes/values
export { 
    Interpreter, 
    ToolRegistry, 
    parse
}; 

// Re-export types
export type { 
    ToolSchema,
    JsonValue, 
    EvaluatedToolArguments, 
    OutputHandler, 
    Scope,
    Interpreter as InterpreterType, 
    ToolRegistry as ToolRegistryType,
    AST,
    StateMetadata,
    StateValueWithMetadata,
    ToolContext,
    // NuwaType,
    NormalizedToolSchema
}; 

// Remove debug logs
// console.log(...); 