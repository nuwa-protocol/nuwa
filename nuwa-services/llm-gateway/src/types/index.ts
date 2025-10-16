export interface DIDInfo {
  did: string;
}

export interface UserApiKey {
  id: string;
  did: string;
  openrouter_key_hash: string;
  created_at: string;
  updated_at: string;
}

export interface LLMRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: any;
}

export interface ResponseAPIRequest {
  model: string;
  messages?: Message[];
  input?: string | Array<InputContent>;
  tools?: Tool[];
  tool_choice?: string | ToolChoice;
  store?: boolean;
  metadata?: Record<string, any>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: any;
}

export interface InputContent {
  type: 'text' | 'image' | 'audio';
  text?: string;
  image?: {
    url?: string;
    base64?: string;
  };
  audio?: {
    url?: string;
    base64?: string;
  };
}

export interface Tool {
  type: 'function' | 'web_search' | 'file_search' | 'computer_use';
  function?: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
  web_search?: {
    enabled: boolean;
  };
  file_search?: {
    enabled: boolean;
  };
  computer_use?: {
    enabled: boolean;
  };
}

export interface ToolChoice {
  type: 'function';
  function: {
    name: string;
  };
}

export interface ResponseAPIResponse {
  id: string;
  object: 'response';
  created: number;
  model: string;
  choices?: ResponseChoice[];
  output?: ResponseOutput;
  usage?: ResponseUsage;
  metadata?: Record<string, any>;
}

export interface ResponseChoice {
  index: number;
  message?: Message;
  finish_reason?: string;
}

export interface ResponseOutput {
  type: 'text' | 'image' | 'audio';
  text?: string;
  image?: {
    url: string;
  };
  audio?: {
    url: string;
  };
}

// Response API Usage - OpenAI official fields
export interface ResponseUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  
  input_tokens_details?: {
    cached_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
  
  // tool token fields(OpenAI may provide these fields)
  tool_call_tokens?: number;
  web_search_tokens?: number; // web_search
  file_search_tokens?: number; // file_search
  computer_use_tokens?: number; // computer_use
}

export interface ExtendedUsage extends ResponseUsage {
  tool_calls_count?: {
    web_search?: number;
    file_search?: number;
    computer_use?: number;
    code_interpreter?: number;
  };
  
  cost?: number;
  
  cost_breakdown?: {
    model_cost?: number;
    tool_call_cost?: number;
    storage_cost?: number;
  };
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolCall {
  id: string;
  type: string;
  status: 'in_progress' | 'completed' | 'failed';
  action?: any;
}

export interface WebSearchCall extends ToolCall {
  type: 'web_search_call';
  action: {
    type: 'search';
    query: string;
  };
}

export interface FileSearchCall extends ToolCall {
  type: 'file_search_call';
  queries?: string[];
  search_results?: any;
}

export interface CodeInterpreterCall extends ToolCall {
  type: 'code_interpreter_call';
}

export interface ComputerUseCall extends ToolCall {
  type: 'computer_use_call';
}

export interface ToolCallCounts {
  web_search?: number;
  file_search?: number;
  code_interpreter?: number;
  computer_use?: number;
}

export type SupportedToolType = 'web_search' | 'file_search' | 'code_interpreter' | 'computer_use';

export interface ToolValidationResult {
  valid: boolean;
  unsupportedTools: string[];
}

export interface RequestLog {
  id?: string;
  did: string;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  total_cost?: number;
  request_time: string;
  response_time?: string;
  status: "pending" | "completed" | "failed";
  error_message?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}