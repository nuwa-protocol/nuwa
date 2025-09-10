CREATE TABLE cap_sync_state (
  event_type TEXT PRIMARY KEY,
  cursor TEXT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cap_data (
  name TEXT NOT NULL,
  id TEXT NOT NULL,
  cid TEXT NOT NULL,
  display_name TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  description TEXT NOT NULL,
  submitted_at BIGINT NULL,
  homepage TEXT NULL,
  repository TEXT NULL,
  thumbnail TEXT NULL,
  enable BOOLEAN NOT NULL DEFAULT TRUE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);

-- Create index on cid for faster queries
CREATE INDEX IF NOT EXISTS idx_cap_data_cid ON cap_data(cid);

-- Create index on name for search queries
CREATE INDEX IF NOT EXISTS idx_cap_data_name ON cap_data(name);

-- Create GIN index on tags for efficient array operations and filtering
CREATE INDEX IF NOT EXISTS idx_cap_data_tags ON cap_data USING GIN (tags);

-- Create index on display_name for search queries
CREATE INDEX IF NOT EXISTS idx_cap_data_display_name ON cap_data(display_name);

-- Table for cap statistics
CREATE TABLE cap_stats (
  cap_id TEXT NOT NULL PRIMARY KEY,
  downloads BIGINT NOT NULL DEFAULT 0,
  favorites BIGINT NOT NULL DEFAULT 0,
  rating_count BIGINT NOT NULL DEFAULT 0,
  average_rating FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (cap_id) REFERENCES cap_data(id) ON DELETE CASCADE
);

-- Table for user favorite caps
CREATE TABLE user_favorite_caps (
  user_did TEXT NOT NULL,
  cap_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_did, cap_id),
  FOREIGN KEY (cap_id) REFERENCES cap_data(id) ON DELETE CASCADE
);

-- Table for user cap ratings
CREATE TABLE user_cap_ratings (
  user_did TEXT NOT NULL,
  cap_id TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_did, cap_id),
  FOREIGN KEY (cap_id) REFERENCES cap_data(id) ON DELETE CASCADE
);

-- Indexes for user_favorite_caps
CREATE INDEX IF NOT EXISTS idx_user_favorite_caps_user_did ON user_favorite_caps(user_did);
CREATE INDEX IF NOT EXISTS idx_user_favorite_caps_cap_id ON user_favorite_caps(cap_id);
