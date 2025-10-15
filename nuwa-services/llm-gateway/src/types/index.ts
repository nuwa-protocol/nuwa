// DID 相关类型
export interface DIDInfo {
  did: string;
}

// 用户 API Key 相关
export interface UserApiKey {
  id: string;
  did: string;
  openrouter_key_hash: string;
  created_at: string;
  updated_at: string;
}

// OpenRouter 请求相关
export interface LLMRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: any;
}

// OpenAI Response API 请求相关
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

// Response API 输入内容类型
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

// Response API 工具定义
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

// Response API 响应相关
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

// Response API Usage 扩展
export interface ResponseUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  // 工具调用相关的 token 使用
  tool_call_tokens?: number;
  web_search_tokens?: number;
  file_search_tokens?: number;
  computer_use_tokens?: number;
  // 工具调用次数统计（用于独立计费）
  tool_calls_count?: {
    web_search?: number;
    file_search?: number;
    computer_use?: number;
    code_interpreter?: number;
  };
  // 成本信息（如果提供商支持）
  cost?: number;
  // 分解的成本信息
  cost_breakdown?: {
    model_cost?: number;      // 模型 token 成本
    tool_call_cost?: number;  // 工具调用成本
    storage_cost?: number;    // 存储成本（如 file search）
  };
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

// 请求日志
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

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// OpenRouter API Key 管理相关类型
export interface CreateApiKeyRequest {
  name: string;
  limit?: number;
}

export interface OpenRouterApiKeyData {
  name: string;
  label: string;
  limit: number;
  disabled: boolean;
  created_at: string;
  updated_at: string;
  hash: string;
}

export interface CreateApiKeyResponse {
  data: OpenRouterApiKeyData;
  key: string; // 实际的 API key，仅在创建时返回
}

export interface GetApiKeyResponse {
  data: OpenRouterApiKeyData;
}

// API Key 管理请求
export interface CreateUserApiKeyRequest {
  did: string;
  name: string;
  limit?: number;
}
