CREATE TABLE rooch_cursor_state (
  event_type TEXT PRIMARY KEY,
  cursor TEXT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ipfs_data (
  car_uri TEXT NOT NULL,
  name TEXT NOT NULL,
  id TEXT NOT NULL,
  cid TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (car_uri)
);

-- Create index on cid for faster queries
CREATE INDEX IF NOT EXISTS idx_ipfs_data_cid ON ipfs_data(cid);

-- Create index on name for search queries
CREATE INDEX IF NOT EXISTS idx_ipfs_data_name ON ipfs_data(name);

