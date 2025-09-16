-- Function to get rating distribution for a specific cap
-- Returns count of users for each rating (1-5 stars)
CREATE OR REPLACE FUNCTION get_cap_rating_distribution(p_cap_id TEXT)
RETURNS TABLE (
  rating INT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.rating,
    COUNT(*)::BIGINT as count
  FROM user_cap_ratings r
  WHERE r.cap_id = p_cap_id
  GROUP BY r.rating
  ORDER BY r.rating;
END;
$$ LANGUAGE plpgsql;

-- Function to get rating distribution for all caps (for analytics)
CREATE OR REPLACE FUNCTION get_all_caps_rating_distribution()
RETURNS TABLE (
  cap_id TEXT,
  rating INT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.cap_id,
    r.rating,
    COUNT(*)::BIGINT as count
  FROM user_cap_ratings r
  GROUP BY r.cap_id, r.rating
  ORDER BY r.cap_id, r.rating;
END;
$$ LANGUAGE plpgsql;

-- Enhanced version that returns all ratings 1-5 with zero counts
CREATE OR REPLACE FUNCTION get_cap_rating_distribution_complete(p_cap_id TEXT)
RETURNS TABLE (
  rating INT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH rating_series AS (
    SELECT generate_series(1, 5) as rating_value
  )
  SELECT 
    rs.rating_value as rating,
    COALESCE(r.count, 0)::BIGINT as count
  FROM rating_series rs
  LEFT JOIN (
    SELECT 
      ucr.rating,
      COUNT(*) as count
    FROM user_cap_ratings ucr
    WHERE ucr.cap_id = p_cap_id
    GROUP BY ucr.rating
  ) r ON rs.rating_value = r.rating
  ORDER BY rs.rating_value;
END;
$$ LANGUAGE plpgsql;
