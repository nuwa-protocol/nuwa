// Re-export core classes
export { Interpreter } from './interpreter.js';
export { ToolRegistry } from './tools.js';
export { parse } from './parser.js';
export { buildPrompt } from './prompts.js';

// Re-export types from tools.ts
export type {
    ToolSchema,
    StateMetadata,
    StateValueWithMetadata,
    ToolContext,
    EvaluatedToolArguments,
    RegisteredTool,
    SchemaInput,
    NormalizedToolSchema,
} from './tools.js';

// Re-export types and functions from values.ts
export type { JsonValue } from './values.js';
export { 
    isJsonObject, 
    isJsonArray, 
    isString, 
    isNumber, 
    isBoolean, 
    isNull, 
    jsonValuesAreEqual, 
    jsonValueToString 
} from './values.js';

// Re-export AST namespace
export * as AST from './ast.js';

// Re-export additional types
export type { Scope, OutputHandler } from './interpreter.js';

export {
    InterpreterError,
    RuntimeError,
    TypeError,
    UndefinedVariableError,
    MemberAccessError,
    ToolNotFoundError,
    ToolArgumentError,
    ToolExecutionError,
    UnsupportedOperationError,
    DivisionByZeroError,
    InvalidConditionError,
    InvalidIterableError,
    IndexOutOfBoundsError,
} from './errors.js';