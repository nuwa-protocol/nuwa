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
