import {
    JSONRPCError
} from '../a2a-schema.js';

// Define known error codes as constants
const ErrorCodeParseError = -32700;
const ErrorCodeInvalidRequest = -32600;
const ErrorCodeMethodNotFound = -32601;
const ErrorCodeInvalidParams = -32602;
const ErrorCodeInternalError = -32603;
const ErrorCodeTaskNotFound = -32000; // A2A custom range start
const ErrorCodeTaskNotCancelable = -32001;
const ErrorCodePushNotificationNotSupported = -32002;
const ErrorCodeUnsupportedOperation = -32003;

/**
 * Custom error class for A2A specific server errors.
 */
export class A2AError extends Error {
    public code: number; // Code is always number now
    public data?: unknown;
    public taskId?: string; // Optional task ID context

    constructor(code: number, message: string, data?: unknown, taskId?: string) {
        super(message);
        this.name = 'A2AError';
        this.code = code;
        this.data = data;
        this.taskId = taskId;
    }

    /**
     * Formats the error into a standard JSON-RPC error object structure.
     */
    toJSONRPCError(): JSONRPCError<unknown> {
        const errorObject: JSONRPCError<unknown> = {
            code: this.code,
            message: this.message,
        };
        if (this.data !== undefined) {
            errorObject.data = this.data;
        }
        return errorObject;
    }

    // --- Static Factory Methods ---

    static parseError(message: string, data?: unknown): A2AError {
        return new A2AError(ErrorCodeParseError, message, data);
    }

    static invalidRequest(message: string, data?: unknown): A2AError {
        return new A2AError(ErrorCodeInvalidRequest, message, data);
    }

    static methodNotFound(method: string): A2AError {
        return new A2AError(
            ErrorCodeMethodNotFound,
            `Method not found: ${method}`
        );
    }

    static invalidParams(message: string, data?: unknown): A2AError {
        return new A2AError(ErrorCodeInvalidParams, message, data);
    }

    static internalError(message: string, data?: unknown): A2AError {
        return new A2AError(ErrorCodeInternalError, message, data);
    }

    // --- A2A Specific Errors ---
    static taskNotFound(taskId: string): A2AError {
        return new A2AError(
            ErrorCodeTaskNotFound,
            `Task not found: ${taskId}`,
            undefined,
            taskId
        );
    }

    static taskNotCancelable(taskId: string): A2AError {
        return new A2AError(
            ErrorCodeTaskNotCancelable,
            `Task not cancelable: ${taskId}`,
            undefined,
            taskId
        );
    }

    static pushNotificationNotSupported(): A2AError {
        return new A2AError(
            ErrorCodePushNotificationNotSupported,
            "Push Notification is not supported"
        );
    }

    static unsupportedOperation(operation: string): A2AError {
        return new A2AError(
            ErrorCodeUnsupportedOperation,
            `Unsupported operation: ${operation}`
        );
    }
}
