-- ALTER TABLE cap_data
-- ADD COLUMN enable BOOLEAN NOT NULL DEFAULT TRUE;

-- Script to create default cap_stats records for all existing cap_data records
-- This ensures that all CAPs have stats records for proper sorting and querying

-- Insert default cap_stats records for cap_data records that don't have stats yet
INSERT INTO cap_stats (cap_id, downloads, favorites, rating_count, average_rating, created_at, updated_at)
SELECT 
  id as cap_id,
  0 as downloads,
  0 as favorites,
  0 as rating_count,
  0.0 as average_rating,
  NOW() as created_at,
  NOW() as updated_at
FROM cap_data
WHERE id NOT IN (
  SELECT cap_id FROM cap_stats
)
ON CONFLICT (cap_id) DO NOTHING;

-- Verify the result
-- SELECT COUNT(*) as total_caps FROM cap_data;
-- SELECT COUNT(*) as total_stats FROM cap_stats;
-- SELECT COUNT(*) as caps_without_stats FROM cap_data WHERE id NOT IN (SELECT cap_id FROM cap_stats);