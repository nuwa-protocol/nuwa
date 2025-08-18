import { BaseNode } from './ast.js'; // Optional: include node for location info
import { JsonValue } from './values.js'; // Optional: include value details

/**
 * Base class for all NuwaScript interpreter errors.
 */
export class InterpreterError extends Error {
  public node?: BaseNode; // Optional: AST Node where error occurred

  constructor(message: string, node?: BaseNode) {
    super(message);
    this.name = 'InterpreterError';
    this.node = node;
    // Set the prototype explicitly for correct instanceof checks
    Object.setPrototypeOf(this, InterpreterError.prototype);
  }
}

/**
 * Generic runtime error during interpretation.
 */
export class RuntimeError extends InterpreterError {
  constructor(message: string, node?: BaseNode) {
    super(message, node);
    this.name = 'RuntimeError';
    Object.setPrototypeOf(this, RuntimeError.prototype);
  }
}

/**
 * Error related to type mismatches during operations.
 */
export class TypeError extends InterpreterError {
    public leftValue?: JsonValue;
    public rightValue?: JsonValue;
    public operator?: string;

    constructor(
        message: string,
        details?: {
            leftValue?: JsonValue;
            rightValue?: JsonValue;
            operator?: string;
            node?: BaseNode;
        }
    ) {
        super(message, details?.node);
        this.name = 'TypeError';
        this.leftValue = details?.leftValue;
        this.rightValue = details?.rightValue;
        this.operator = details?.operator;
        Object.setPrototypeOf(this, TypeError.prototype);
    }
}

/**
 * Error when trying to access an undefined variable.
 */
export class UndefinedVariableError extends InterpreterError {
    public variableName: string;

    constructor(variableName: string, node?: BaseNode) {
        super(`Variable '${variableName}' not defined.`, node);
        this.name = 'UndefinedVariableError';
        this.variableName = variableName;
        Object.setPrototypeOf(this, UndefinedVariableError.prototype);
    }
}

/**
 * Error when attempting member access on an invalid type or non-existent member.
 */
export class MemberAccessError extends InterpreterError {
    constructor(message: string, node?: BaseNode) {
        super(message, node);
        this.name = 'MemberAccessError';
        Object.setPrototypeOf(this, MemberAccessError.prototype);
    }
}

/**
 * Error when a tool called in the script is not found in the registry.
 */
export class ToolNotFoundError extends InterpreterError {
    public toolName: string;

    constructor(
      message: string, 
      details?: { 
        toolName: string; 
        node?: BaseNode 
      }
    ) {
        super(message, details?.node);
        this.name = 'ToolNotFoundError';
        this.toolName = details?.toolName || '';
        Object.setPrototypeOf(this, ToolNotFoundError.prototype);
    }
}

/**
 * Error related to incorrect arguments passed to a tool.
 */
export class ToolArgumentError extends InterpreterError {
    public toolName: string;
    public parameter?: string;

    constructor(
      message: string, 
      details?: { 
        toolName: string; 
        parameter?: string; 
        node?: BaseNode 
      }
    ) {
        super(message, details?.node);
        this.name = 'ToolArgumentError';
        this.toolName = details?.toolName || '';
        this.parameter = details?.parameter;
        Object.setPrototypeOf(this, ToolArgumentError.prototype);
    }
}

/**
 * Error occurring during the execution of a tool's implementation function.
 */
export class ToolExecutionError extends InterpreterError {
    public toolName: string;
    public originalError?: Error; // Keep the original error if available

    constructor(
      message: string, 
      details?: { 
        toolName: string; 
        error?: Error | unknown; 
        node?: BaseNode 
      }
    ) {
        super(message, details?.node);
        this.name = 'ToolExecutionError';
        this.toolName = details?.toolName || '';
        
        if (details?.error instanceof Error) {
            this.originalError = details.error;
            this.stack = details.error.stack; // Preserve original stack if possible
        }
        
        Object.setPrototypeOf(this, ToolExecutionError.prototype);
    }
}

/**
 * Error for unsupported operators or operations.
 */
export class UnsupportedOperationError extends InterpreterError {
    public operation: string;

    constructor(operation: string, node?: BaseNode) {
        super(`Operation '${operation}' is not supported.`, node);
        this.name = 'UnsupportedOperationError';
        this.operation = operation;
        Object.setPrototypeOf(this, UnsupportedOperationError.prototype);
    }
}

/**
 * Error for division by zero.
 */
export class DivisionByZeroError extends RuntimeError {
    constructor(node?: BaseNode) {
        super("Division by zero.", node);
        this.name = 'DivisionByZeroError';
        Object.setPrototypeOf(this, DivisionByZeroError.prototype);
    }
}

/**
 * Error when an IF statement condition does not evaluate to a boolean.
 */
export class InvalidConditionError extends TypeError {
    constructor(message: string = 'IF condition did not evaluate to a boolean.', node?: BaseNode) {
        super(message, node);
        this.name = 'InvalidConditionError';
        Object.setPrototypeOf(this, InvalidConditionError.prototype);
    }
}

/**
 * Error when the iterable in a FOR statement is not a list/array.
 */
export class InvalidIterableError extends InterpreterError {
    constructor(message: string = 'FOR loop expected an iterable list.', node?: BaseNode) {
        super(message, node);
        this.name = 'InvalidIterableError';
        Object.setPrototypeOf(this, InvalidIterableError.prototype);
    }
}

// Add IndexOutOfBoundsError
export class IndexOutOfBoundsError extends RuntimeError {
    constructor(index: number, length: number, node?: BaseNode) {
        super(`Index ${index} is out of bounds for array of length ${length}.`, node);
        this.name = 'IndexOutOfBoundsError';
        Object.setPrototypeOf(this, IndexOutOfBoundsError.prototype);
    }
}

// Add other specific error types as needed (e.g., ParserError, LexerError)
