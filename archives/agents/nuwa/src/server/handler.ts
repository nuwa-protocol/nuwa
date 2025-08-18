import * as schema from '../a2a-schema.js'; // Use .js extension if needed for NodeNext

/**
 * Context object passed to the TaskHandler.
 */
export interface TaskContext {
  /** The current state of the task (read-only snapshot). */
  readonly task: schema.Task;
  /** The user message that triggered this handler invocation. */
  readonly userMessage: schema.Message;
  /** The historical messages for this task (including the current userMessage). */
  readonly history: readonly schema.Message[];
  /** Function to check if the task has been signaled for cancellation. */
  isCancelled(): boolean;
}

/**
 * Defines the signature for the core agent logic handler.
 * It receives the task context and yields status updates or artifacts.
 */
export type TaskHandler = (
  context: TaskContext
) => AsyncGenerator<
  | Omit<schema.TaskStatus, 'timestamp'> // Yield status updates (timestamp added automatically)
  | schema.Artifact, // Yield artifacts
  void, // Return type (usually void)
  unknown // Next argument type (usually unknown)
>; 