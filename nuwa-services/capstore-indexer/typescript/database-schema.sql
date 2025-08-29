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

-- Function to handle rating a cap and updating stats atomically
CREATE OR REPLACE FUNCTION rate_cap(p_user_did TEXT, p_cap_id TEXT, p_rating INT)
RETURNS VOID AS $$
DECLARE
  new_rating_count BIGINT;
  new_average_rating FLOAT;
BEGIN
  -- Upsert the user's rating
  INSERT INTO user_cap_ratings (user_did, cap_id, rating, updated_at)
  VALUES (p_user_did, p_cap_id, p_rating, NOW())
  ON CONFLICT (user_did, cap_id)
  DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW();

  -- Recalculate the average rating and count
  SELECT
    COUNT(*),
    AVG(rating)
  INTO
    new_rating_count,
    new_average_rating
  FROM
    user_cap_ratings
  WHERE
    cap_id = p_cap_id;

  -- Update the cap_stats table
  UPDATE cap_stats
  SET
    rating_count = new_rating_count,
    average_rating = COALESCE(new_average_rating, 0),
    updated_at = NOW()
  WHERE
    cap_id = p_cap_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment download count for a cap
CREATE OR REPLACE FUNCTION increment_cap_downloads(p_cap_id TEXT)
RETURNS VOID AS $$
BEGIN
  -- Insert or update the cap_stats record, incrementing downloads
  INSERT INTO cap_stats (cap_id, downloads, updated_at)
  VALUES (p_cap_id, 1, NOW())
  ON CONFLICT (cap_id)
  DO UPDATE SET 
    downloads = cap_stats.downloads + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

--
-- ALTER TABLE cap_data
-- ADD COLUMN enable BOOLEAN NOT NULL DEFAULT TRUE;
