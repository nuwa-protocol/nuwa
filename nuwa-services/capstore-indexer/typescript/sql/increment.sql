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

-- Function to increment favorites count for a cap
CREATE OR REPLACE FUNCTION increment_cap_favorites(p_cap_id TEXT)
RETURNS VOID AS $$
BEGIN
  -- Insert or update the cap_stats record, incrementing favorites
  INSERT INTO cap_stats (cap_id, favorites, updated_at)
  VALUES (p_cap_id, 1, NOW())
  ON CONFLICT (cap_id)
  DO UPDATE SET 
    favorites = cap_stats.favorites + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to decrement favorites count for a cap
CREATE OR REPLACE FUNCTION decrement_cap_favorites(p_cap_id TEXT)
RETURNS VOID AS $$
BEGIN
  -- Update the cap_stats record, decrementing favorites (but not below 0)
  UPDATE cap_stats
  SET 
    favorites = GREATEST(favorites - 1, 0),
    updated_at = NOW()
  WHERE cap_id = p_cap_id;
END;
$$ LANGUAGE plpgsql;