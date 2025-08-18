import { ToolSchema } from '../services/interpreter';

// Component state management interfaces
export interface ComponentStateManager<T = unknown> {
  // Get current state
  getState(): T;
  
  // Subscribe to state changes
  subscribe(listener: () => void): () => void;
  
  // Update state in registry for AI
  updateStateInRegistry(context?: unknown): void;
  
  // Reset state
  resetState?: () => void;
}

export interface ExampleConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  script: string;
  tools: ToolSchema[];
  aiPrompt?: string;
  tags?: string[];
  componentId?: string;
  // Optional state manager for the component
  stateManager?: ComponentStateManager;
}