import { Scope } from './interpreter.js'; // For ToolContext potentially
import { JsonValue } from './values.js'; // Import JsonValue
import { JSONSchema7, JSONSchema7Definition } from 'json-schema'; // Import JSON Schema types
import { z, ZodError } from 'zod'; // Ensure z is imported from zod
import zodToJsonSchema from 'zod-to-json-schema';
import { ToolArgumentError } from './errors.js'; // Import error type

/**
 * Defines the structure for registering a tool using a single definition object.
 */
type ToolDefinition<ParamSchema extends z.ZodTypeAny, ReturnSchema extends z.ZodTypeAny> = {
  name: string;
  description: string;
  parameters: ParamSchema;
  returns: { 
      description?: string; 
      schema: ReturnSchema; 
  };
  // Execute function now uses inferred types directly from ParamSchema and ReturnSchema
  execute: (args: z.infer<ParamSchema>) => 
    | z.infer<ReturnSchema> 
    | Promise<z.infer<ReturnSchema>>
    | JsonValue 
    | Promise<JsonValue>;
};

/**
 * Describes the input interface (schema) of a callable tool.
 * NEW: Primarily expects Zod schemas now for registration, but SchemaInput 
 * type remains for flexibility elsewhere if needed.
 */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: SchemaInput; // Keep SchemaInput for broader use, register expects Zod
  returns: { description?: string; schema: SchemaInput; }; // Keep SchemaInput here too
}

/**
 * Defines the structure of the evaluated arguments passed to a tool function
 * by the interpreter BEFORE validation by the specific tool's schema.
 */
export type EvaluatedToolArguments = { [key: string]: JsonValue | undefined };

/**
 * A safer version of StateStore that can handle undefined values.
 */
export class SafeStateStore {
  private store: Map<string, JsonValue> = new Map();
  
  /**
   * Sets a value in the store, skipping undefined values
   */
  set(key: string, value: JsonValue | undefined): void {
    if (value === undefined) {
      console.warn(`Attempted to set undefined value for state key: ${key}`);
      return;
    }
    this.store.set(key, value);
  }
  
  /**
   * Gets a value from the store
   */
  get(key: string): JsonValue | undefined {
    return this.store.get(key);
  }
  
  /**
   * Checks if a key exists in the store
   */
  has(key: string): boolean {
    return this.store.has(key);
  }
  
  /**
   * Clears all values from the store
   */
  clear(): void {
    this.store.clear();
  }
  
  /**
   * Returns the size of the store
   */
  get size(): number {
    return this.store.size;
  }
  
  /**
   * Returns entries from the store
   */
  entries(): IterableIterator<[string, JsonValue]> {
    return this.store.entries();
  }
}

/**
 * Represents additional metadata associated with a state value.
 */
export interface StateMetadata {
    description?: string;
    formatter?: (value: JsonValue) => string;
    // Add other metadata like visibility, persistence hints, etc.
}

/**
 * Represents a state value bundled with its metadata, used for setting state.
 */
export interface StateValueWithMetadata {
    value: JsonValue;
    metadata: StateMetadata;
}

/**
 * Function context containing additional information like state that can be passed to tool functions.
 */
export interface ToolContext {
  setState: (key: string, value: JsonValue | StateValueWithMetadata | undefined) => void;
  getStateValue: (key: string) => JsonValue | undefined;
  hasState: (key: string) => boolean;
  getAllState: () => Map<string, JsonValue>;
  clearState: () => void;
  // Potentially add other context info like current scope (read-only?) or user info
}

/**
 * Internal type representing the function stored by the registry.
 * This function receives raw arguments from the interpreter and is 
 * responsible for validation before calling the user's typed function.
 */
export type InternalToolFunction = (
    args: EvaluatedToolArguments
) => JsonValue | Promise<JsonValue>;

/**
 * Represents a registered tool internally, pairing its *normalized* JSON schema
 * with its *internal* implementation (adapter function).
 */
export interface RegisteredTool {
  schema: NormalizedToolSchema;
  execute: InternalToolFunction; // Use the internal function type
}

/**
 * Manages the registration and lookup of available tools.
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private state: Map<string, JsonValue> = new Map();
  private stateMetadata: Map<string, StateMetadata> = new Map();

  /**
   * Registers a tool defined with Zod schemas using a single definition object.
   * This allows TypeScript to infer the argument types for the `execute` function.
   *
   * @param definition An object matching the ToolDefinition structure.
   */
  register< 
    ParamSchema extends z.ZodType<any, z.ZodTypeDef, any>, 
    ReturnSchema extends z.ZodType<any, z.ZodTypeDef, any> 
  >(
    definition: ToolDefinition<ParamSchema, ReturnSchema>
  ): void {
    const toolName = definition.name;
    const userExecute = definition.execute; // Extract userExecute from definition
    
    if (this.tools.has(toolName)) { 
      throw new Error(`Tool '${toolName}' is already registered.`); 
    }

    // Duck-type check for Zod schema (parameters)
    if (!definition.parameters || typeof definition.parameters._def !== 'object' || typeof definition.parameters.parse !== 'function') {
        throw new Error(`Tool '${toolName}' parameters must provide a valid Zod schema object (detected via duck-typing).`);
    }
    
    // Duck-type check for Zod schema (returns)
    if (!definition.returns?.schema || typeof definition.returns.schema._def !== 'object' || typeof definition.returns.schema.parse !== 'function') {
        throw new Error(`Tool '${toolName}' returns schema must provide a valid Zod schema object (detected via duck-typing).`);
    }

    let normalizedSchema: NormalizedToolSchema;
    try {
      // Normalize parameter schema (always expect object for LLM function calling)
      const normalizedParamsSchema = normalizeSchemaToJsonSchema(
        definition.parameters, 'parameters', toolName, true // true: expect object
      );
      // Normalize return schema
      const normalizedReturnsSchema = normalizeSchemaToJsonSchema(
        definition.returns.schema, 'returns.schema', toolName, false // false: don't enforce object
      );

      normalizedSchema = {
        name: toolName,
        description: definition.description,
        parameters: normalizedParamsSchema as NormalizedToolSchema['parameters'], // Cast needed after expectObject=true
        returns: {
          description: definition.returns.description,
          schema: normalizedReturnsSchema,
        },
      };
    } catch (error: any) { 
      throw new Error(`Failed to normalize schema for tool '${toolName}': ${error.message}`); 
    }

    // --- Create the Adapter Function --- 
    // This internal function will be stored and called by the interpreter.
    // It bridges the interpreter's EvaluatedToolArguments and the user's typed function.
    const internalExecute: InternalToolFunction = async (evaluatedArgs: EvaluatedToolArguments): Promise<JsonValue> => {
      try {
        // 1. Validate the raw arguments using the user's Zod schema
        let validatedArgs: z.infer<ParamSchema>;
        try {
            validatedArgs = definition.parameters.parse(evaluatedArgs); // Use definition.parameters
        } catch (validationError) {
            // If validation fails, it must be a ZodError
            if (validationError instanceof ZodError) {
                const errorMessages = validationError.errors.map(e => 
                    `Parameter '${e.path.join('.')}': ${e.message} (Expected ${e.code === 'invalid_type' ? e.expected : 'valid'}, received ${e.code === 'invalid_type' ? e.received : JSON.stringify(evaluatedArgs[e.path[0] as keyof EvaluatedToolArguments])})`
                ).join('; ');
                // Throw the specific ToolArgumentError
                throw new ToolArgumentError(`Invalid arguments for tool '${toolName}': ${errorMessages}`);
            } else {
                // If it's not a ZodError, re-throw as an unexpected validation error
                throw new Error(`Unexpected validation error for tool '${toolName}': ${validationError instanceof Error ? validationError.message : validationError}`);
            }
        }

        // 2. Call the user's type-safe function with validated arguments
        const result = await userExecute(validatedArgs);

        // 3. (Optional but recommended) Validate the return value against the return schema
        try {
            definition.returns.schema.parse(result); // Use definition.returns.schema
        } catch (returnError) {
            if (returnError instanceof ZodError) {
                console.warn(`Tool '${toolName}' return value validation failed: ${returnError.errors.map(e => `${e.path.join('.')} (${e.code}): ${e.message}`).join(', ')}. Returning raw result anyway.`);
            } else {
                console.warn(`Tool '${toolName}' return value validation failed with unknown error. Returning raw result anyway.`);
            }
        }

        // 4. Ensure the final result is JsonValue compatible
        if (typeof result === 'object' && result !== null) {
            return result as JsonValue; 
        } else if (['string', 'number', 'boolean'].includes(typeof result) || result === null) {
            return result as JsonValue;
        } else {
            console.warn(`Tool '${toolName}' returned a non-JSON compatible value of type ${typeof result}. Converting to string.`);
            return String(result);
        }

      } catch (error: any) {
        // Catch errors specifically from userExecute or the return value check/conversion
        // Zod validation errors are now handled and re-thrown above
        if (error instanceof ToolArgumentError) {
            // If it's already the specific error we want, just re-throw it
            throw error;
        } 
        
        // For any other errors (assumed to be from userExecute or internal logic after validation)
        // Wrap in a generic error message, do not throw ToolArgumentError here
        throw new Error(`Execution failed for tool '${toolName}': ${error.message || error}`);
      }
    };

    // Store the normalized schema and the INTERNAL adapter function
    this.tools.set(toolName, { 
        schema: normalizedSchema, 
        execute: internalExecute 
    });
  }

  /**
   * Retrieves a registered tool by its name.
   * @param toolName - The name of the tool.
   * @returns The RegisteredTool object or undefined if not found.
   */
  lookup(toolName: string): RegisteredTool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Retrieves the schema for a registered tool.
   * @param toolName - The name of the tool.
   * @returns The ToolSchema object (with JSON Schema) or undefined if not found.
   */
  getSchema(toolName: string): NormalizedToolSchema | undefined {
    return this.tools.get(toolName)?.schema;
  }

  /**
   * Gets a list of all registered tool schemas.
   * Useful for providing context to an LLM.
   */
  getAllSchemas(): NormalizedToolSchema[] {
    return Array.from(this.tools.values()).map(tool => tool.schema);
  }

  /**
   * Checks if a tool with the given name is registered.
   */
  isRegistered(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Gets the current state store.
   * @returns The current state store.
   */
  getState(): Map<string, JsonValue> {
    return this.state;
  }

  /**
   * Creates a tool context with access to the state management methods.
   * @returns A tool context object.
   */
  createToolContext(): ToolContext {
    return {
      setState: this.setState.bind(this),
      getStateValue: this.getStateValue.bind(this),
      hasState: this.hasState.bind(this),
      getAllState: this.getState.bind(this),
      clearState: this.clearState.bind(this),
    };
  }

  /**
   * Sets a state value with the given key, optionally including metadata.
   * Handles both direct value and StateValueWithMetadata object.
   * @param key - The state key.
   * @param valueOrObject - The state value (JsonValue) or an object containing value and metadata, or undefined.
   */
  setState(key: string, valueOrObject: JsonValue | StateValueWithMetadata | undefined): void {
    if (valueOrObject === undefined) {
      console.warn(`Attempted to set undefined value for state key: ${key}`);
      return;
    }

    if (typeof valueOrObject === 'object' &&
        valueOrObject !== null &&
        'value' in valueOrObject &&
        'metadata' in valueOrObject &&
        typeof (valueOrObject as any).metadata === 'object') {
      const { value, metadata } = valueOrObject as StateValueWithMetadata;

      if (value === undefined) {
        console.warn(`Attempted to set state key '${key}' with undefined value inside StateValueWithMetadata.`);
        return;
      }
      this.state.set(key, value);

      if (metadata) {
        this.stateMetadata.set(key, metadata);
      } else {
        this.stateMetadata.delete(key);
      }
    } else {
      this.state.set(key, valueOrObject as JsonValue);
    }
  }

  /**
   * Gets a state value by key.
   * @param key - The state key.
   * @returns The state value or undefined if not found.
   */
  getStateValue(key: string): JsonValue | undefined {
    return this.state.get(key);
  }

  /**
   * Gets the metadata associated with a state key.
   * @param key The state key.
   * @returns The StateMetadata or undefined if not found.
   */
  getStateMetadata(key: string): StateMetadata | undefined {
    return this.stateMetadata.get(key);
  }

  /**
   * Checks if a state value exists.
   * @param key - The state key.
   * @returns True if the state value exists, false otherwise.
   */
  hasState(key: string): boolean {
    return this.state.has(key);
  }

  /**
   * Clears all state values and their metadata.
   */
  clearState(): void {
    this.state.clear();
    this.stateMetadata.clear();
  }

  /**
   * Registers metadata for a state key without setting the value.
   * If state for the key doesn't exist, it won't be created here.
   * @param key - The state key.
   * @param metadata - The metadata to register.
   */
  registerStateMetadata(key: string, metadata: StateMetadata): void {
    this.stateMetadata.set(key, metadata);
  }

  /**
   * Formats the current state as a string for inclusion in prompts.
   * Uses registered metadata for descriptions and formatting where available.
   * @returns A formatted string representation of the current state.
   */
  formatStateForPrompt(): string {
    if (this.state.size === 0) {
      return "No state information available.";
    }

    const entries = Array.from(this.state.entries());
    return entries.map(([key, value]) => {
      const metadata = this.stateMetadata.get(key);
      let descriptionPart = '';
      let formattedValue: string;

      if (metadata) {
          descriptionPart = metadata.description ? ` (${metadata.description})` : '';
          formattedValue = metadata.formatter
              ? metadata.formatter(value)
              : this.defaultFormatter(key, value);
      } else {
          formattedValue = this.defaultFormatter(key, value);
      }

      return `${key}: ${formattedValue}${descriptionPart}`;
    }).join('\n');
  }

  /**
   * Default formatter for state values based on key patterns or type.
   * @param key - The state key.
   * @param value - The state value.
   * @returns Formatted value string.
   */
  private defaultFormatter(key: string, value: JsonValue): string {
    if ((key.toLowerCase().includes('time') || key.toLowerCase().includes('date')) && typeof value === 'number') {
      if (value > 1000000000 && value < 99999999999999) {
         try {
           const date = new Date(value);
           if (!isNaN(date.getTime())) {
              return `${JSON.stringify(value)} (${date.toISOString()})`;
           }
         } catch (e) {
            // Ignore errors if it's not a valid date
         }
      }
    }

    try {
        if (typeof value === 'object' && value !== null) {
            const str = JSON.stringify(value);
            if (str.length > 200) {
                return `${str.substring(0, 197)}...`;
            }
            return JSON.stringify(value, null, 2);
        }
        return JSON.stringify(value);
    } catch (e) {
        return "[Unserializable Value]";
    }
  }
}

// --- Input Schema Definition ---
/**
 * Represents a schema definition that can be either a Zod schema
 * or a standard JSON Schema definition object.
 */
export type SchemaInput = z.ZodTypeAny | JSONSchema7Definition;

// --- Normalized Internal Schema ---
/**
 * Represents the tool schema after normalization, always using JSON Schema 7.
 * This is the format used internally by the registry and potentially passed to LLMs.
 */
export interface NormalizedToolSchema {
  name: string;
  description: string;
  parameters: JSONSchema7 & { type: 'object'; properties?: { [key: string]: JSONSchema7Definition }; };
  returns: { description?: string; schema: JSONSchema7Definition; };
}

// --- normalizeSchemaToJsonSchema function remains the same --- 
export function normalizeSchemaToJsonSchema(
    schemaInput: SchemaInput,
    schemaName: string,
    toolName: string,
    expectObject: boolean
): JSONSchema7Definition {
    let resultSchema: JSONSchema7Definition;

    // Use duck-typing to check if it looks like a Zod schema
    if (schemaInput && typeof (schemaInput as any)._def === 'object' && typeof (schemaInput as any).parse === 'function') {
        try {
            // Ensure zod-to-json-schema options are suitable
            const converted = zodToJsonSchema(schemaInput as z.ZodTypeAny, { // Cast needed for zodToJsonSchema
                 target: 'jsonSchema7', 
                 $refStrategy: 'none', // Avoid internal refs for LLM compatibility
                 definitionPath: 'definitions', // Standard path
                 errorMessages: true // Include Zod error messages if possible
            }) as any; // Cast needed as output structure varies
            
            // Handle cases where the main schema is under definitions (common for complex types)
            const { $schema, definitions, ...rest } = converted;
            let extractedSchema = rest;

            if (Object.keys(rest).length === 0 && definitions && typeof definitions === 'object' && Object.keys(definitions).length === 1) {
                const defKey = Object.keys(definitions)[0];
                if (defKey !== undefined) {
                   extractedSchema = definitions[defKey];
                } else {
                    // Should not happen if definitions has one key
                    extractedSchema = rest;
                }
            } else {
                extractedSchema = rest;
            }

            // Add description from Zod schema if missing in JSON schema
            if (typeof extractedSchema === 'object' && extractedSchema !== null) {
                if (typeof schemaInput === 'object' && schemaInput !== null && schemaInput.description && !extractedSchema.description) {
                    extractedSchema.description = schemaInput.description;
                }
                // Ensure top-level object has type: 'object' if properties exist
                if (!extractedSchema.type && extractedSchema.properties) {
                    extractedSchema.type = 'object';
                }
            } else if (typeof extractedSchema !== 'boolean') {
                // zod-to-json-schema should ideally throw or return valid schema.
                // If conversion result is unexpected, log a warning.
                console.warn(`Unexpected output from zod-to-json-schema for tool '${toolName}' schema '${schemaName}'. Result was not an object or boolean.`);
            }

            resultSchema = extractedSchema as JSONSchema7Definition;

        } catch (error: any) {
            throw new Error(`Failed to convert Zod schema '${schemaName}' for tool '${toolName}': ${error.message}`);
        }
    } else if (typeof schemaInput === 'object' || typeof schemaInput === 'boolean') {
        // Handle direct JSON Schema input (remove $schema keyword)
        if (typeof schemaInput === 'object' && schemaInput !== null) {
           const directSchema = { ...schemaInput };
           delete (directSchema as any).$schema;
           resultSchema = directSchema as JSONSchema7Definition;
        } else {
           resultSchema = schemaInput;
        }
    } else {
        throw new Error(`Invalid schema format for '${schemaName}' of tool '${toolName}'. Expected Zod schema, JSON Schema object, or boolean.`);
    }

    // --- Enforce object type if required (specifically for parameters for LLM function calling) --- 
    if (expectObject) {
        let finalObjectSchema: JSONSchema7 & { type: 'object'; properties?: { [key: string]: JSONSchema7Definition }; required?: string[] };

        if (typeof resultSchema === 'object' && resultSchema !== null && resultSchema.type === 'object') {
            finalObjectSchema = resultSchema as typeof finalObjectSchema;
        } else if (typeof resultSchema === 'object' && resultSchema !== null && !resultSchema.type && resultSchema.properties) {
            // If type is missing but properties exist, assume object
            finalObjectSchema = { ...resultSchema, type: 'object' } as typeof finalObjectSchema;
        } else if (resultSchema === true || (typeof resultSchema === 'object' && resultSchema !== null && Object.keys(resultSchema).length === 0)) {
            // Allow `true` or empty object `{}` to mean any object (no specific props)
            finalObjectSchema = { type: 'object', properties: {} };
        } else {
            // If it's not clearly an object schema, reject it for parameters
            throw new Error(`Tool parameters schema for '${toolName}' must resolve to type 'object' or boolean 'true'. Received: ${JSON.stringify(resultSchema)}`);
        }

        // Ensure properties object exists, even if empty
        if (!finalObjectSchema.properties) {
            finalObjectSchema.properties = {};
        }
        return finalObjectSchema as JSONSchema7Definition;
    }

    // Return the normalized schema if object type wasn't enforced
    return resultSchema;
}
