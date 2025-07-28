-- User API Keys table
CREATE TABLE user_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  did TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openrouter',
  provider_key_id TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  key_name TEXT NOT NULL,
  credit_limit DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_user_api_keys_provider_key_id ON user_api_keys(provider_key_id);
CREATE UNIQUE INDEX idx_user_api_keys_did_provider ON user_api_keys(did, provider);

-- Request logs table (includes Usage Tracking fields)
CREATE TABLE request_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  did TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,                    -- Number of input tokens
  output_tokens INTEGER,                   -- Number of output tokens
  total_cost DECIMAL(10,6),               -- Total cost (USD)
  request_time TIMESTAMP WITH TIME ZONE NOT NULL,
  response_time TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_request_logs_did ON request_logs(did);
CREATE INDEX idx_request_logs_request_time ON request_logs(request_time);
CREATE INDEX idx_request_logs_status ON request_logs(status);
CREATE INDEX idx_request_logs_model ON request_logs(model);
CREATE INDEX idx_request_logs_cost ON request_logs(total_cost);
