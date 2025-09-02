-- Add functions to handle favorites count updates
-- This script adds the necessary functions for updating favorites count when users add/remove favorites

-- Function to increment favorites count for a cap
CREATE OR REPLACE FUNCTION increment_favorites(p_cap_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  current_favorites INTEGER;
BEGIN
  -- Get current favorites count
  SELECT favorites INTO current_favorites 
  FROM cap_stats 
  WHERE cap_id = p_cap_id;
  
  -- Return incremented value
  RETURN COALESCE(current_favorites, 0) + 1;
END;
$$ LANGUAGE plpgsql;

-- Function to decrement favorites count for a cap
CREATE OR REPLACE FUNCTION decrement_favorites(p_cap_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  current_favorites INTEGER;
BEGIN
  -- Get current favorites count
  SELECT favorites INTO current_favorites 
  FROM cap_stats 
  WHERE cap_id = p_cap_id;
  
  -- Return decremented value, but not below 0
  RETURN GREATEST(COALESCE(current_favorites, 0) - 1, 0);
END;
$$ LANGUAGE plpgsql;

-- Verify the functions were created
SELECT 'Functions created successfully' as status;
SELECT proname, prosrc FROM pg_proc WHERE proname IN ('increment_favorites', 'decrement_favorites');
