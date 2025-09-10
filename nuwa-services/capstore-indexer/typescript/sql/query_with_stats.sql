CREATE OR REPLACE FUNCTION query_caps_with_stats(
  p_tags TEXT[] DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_id TEXT DEFAULT NULL, 
  p_cid TEXT DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'downloads',
  p_sort_order TEXT DEFAULT 'desc',
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  -- cap_data fields (must match exact order in SELECT)
  id TEXT,
  name TEXT,
  cid TEXT,
  display_name TEXT,
  description TEXT,
  tags JSONB,
  submitted_at BIGINT,
  homepage TEXT,
  repository TEXT,
  thumbnail TEXT,
  enable BOOLEAN,
  "timestamp" TIMESTAMPTZ,  -- Use quotes for reserved keyword
  version INTEGER,
  -- cap_stats fields (must match exact order in SELECT)
  cap_id TEXT,
  downloads BIGINT,
  favorites BIGINT,
  rating_count BIGINT,
  average_rating FLOAT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- full count for pagination
  full_count BIGINT
) AS $$
DECLARE
  sql_query TEXT;
  where_conditions TEXT[] := ARRAY['cap_data.enable = true'];
  order_clause TEXT := '';
BEGIN
  -- Build WHERE conditions
  IF p_name IS NOT NULL AND trim(p_name) != '' THEN
    where_conditions := array_append(where_conditions, 
      format('cap_data.name ILIKE %L', '%' || p_name || '%'));
  END IF;
  
  IF p_id IS NOT NULL AND trim(p_id) != '' THEN
    where_conditions := array_append(where_conditions,
      format('cap_data.id = %L', p_id));
  END IF;
  
  IF p_cid IS NOT NULL AND trim(p_cid) != '' THEN
    where_conditions := array_append(where_conditions,
      format('cap_data.cid = %L', p_cid));
  END IF;
  
  -- Handle tags filtering (OR condition)
  IF p_tags IS NOT NULL AND array_length(p_tags, 1) > 0 THEN
    DECLARE
      tag_conditions TEXT[] := '{}';
      tag_item TEXT;
    BEGIN
      FOREACH tag_item IN ARRAY p_tags LOOP
        tag_conditions := array_append(tag_conditions,
          format('cap_data.tags @> %L::jsonb', '[' || to_json(tag_item)::TEXT || ']'));
      END LOOP;
      
      where_conditions := array_append(where_conditions,
        '(' || array_to_string(tag_conditions, ' OR ') || ')');
    END;
  END IF;
  
  -- Build ORDER BY clause
  IF p_sort_by IS NOT NULL AND p_sort_by != 'updated_at' THEN
    order_clause := format('ORDER BY cap_stats.%I %s NULLS %s',
      p_sort_by,
      CASE WHEN upper(p_sort_order) = 'ASC' THEN 'ASC' ELSE 'DESC' END,
      CASE WHEN upper(p_sort_order) = 'ASC' THEN 'FIRST' ELSE 'LAST' END
    );
  ELSIF p_sort_by = 'updated_at' THEN
    order_clause := format('ORDER BY cap_data."timestamp" %s',
      CASE WHEN upper(p_sort_order) = 'ASC' THEN 'ASC' ELSE 'DESC' END
    );
  ELSE
    order_clause := 'ORDER BY cap_data."timestamp" DESC';
  END IF;
  
  -- Construct the full SQL query with proper column order and types
  sql_query := format('
    SELECT 
      cap_data.id,
      cap_data.name,
      cap_data.cid,
      cap_data.display_name,
      cap_data.description,
      cap_data.tags,
      cap_data.submitted_at,
      cap_data.homepage,
      cap_data.repository,
      cap_data.thumbnail,
      cap_data.enable,
      cap_data."timestamp",
      cap_data.version,
      cap_stats.cap_id,
      COALESCE(cap_stats.downloads, 0)::BIGINT as downloads,
      COALESCE(cap_stats.favorites, 0)::BIGINT as favorites,
      COALESCE(cap_stats.rating_count, 0)::BIGINT as rating_count,
      COALESCE(cap_stats.average_rating, 0.0)::FLOAT as average_rating,
      cap_stats.created_at,
      cap_stats.updated_at,
      COUNT(*) OVER()::BIGINT as full_count
    FROM cap_data
    LEFT JOIN cap_stats ON cap_data.id = cap_stats.cap_id
    WHERE %s
    %s
    LIMIT %s OFFSET %s',
    array_to_string(where_conditions, ' AND '),
    order_clause,
    p_limit,
    p_offset
  );
  
  -- Execute the dynamic query
  RETURN QUERY EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql;

-- Test suite for query_caps_with_stats function
-- Run these tests after creating the function to ensure it works correctly

-- ============================================================================
-- Test 1: Basic function execution (no parameters)
-- ============================================================================
SELECT 'Test 1: Basic function execution' as test_name;
SELECT 
  count(*) as total_records,
  min(downloads) as min_downloads,
  max(downloads) as max_downloads
FROM query_caps_with_stats();

-- ============================================================================
-- Test 2: Tag filtering with single tag
-- ============================================================================
SELECT 'Test 2: Single tag filtering (AI Model)' as test_name;
SELECT 
  name,
  tags,
  downloads,
  full_count
FROM query_caps_with_stats(
  p_tags := ARRAY['AI Model'],
  p_limit := 5
);

-- Verify that all returned records contain the specified tag
SELECT 'Test 2 Verification: All records should contain AI Model tag' as test_name;
SELECT 
  name,
  CASE 
    WHEN tags @> '["AI Model"]'::jsonb THEN 'PASS' 
    ELSE 'FAIL' 
  END as tag_check
FROM query_caps_with_stats(
  p_tags := ARRAY['AI Model'],
  p_limit := 10
);

-- ============================================================================
-- Test 3: Multiple tags filtering (OR condition)
-- ============================================================================
SELECT 'Test 3: Multiple tags filtering (OR condition)' as test_name;
SELECT 
  name,
  tags,
  downloads
FROM query_caps_with_stats(
  p_tags := ARRAY['AI Model', 'LLM', 'Machine Learning'],
  p_limit := 8
);

-- ============================================================================
-- Test 4: Sorting by downloads (DESC)
-- ============================================================================
SELECT 'Test 4: Sorting by downloads DESC' as test_name;
SELECT 
  name,
  downloads,
  LAG(downloads) OVER() as prev_downloads,
  CASE 
    WHEN LAG(downloads) OVER() IS NULL OR LAG(downloads) OVER() >= downloads 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as sort_check
FROM query_caps_with_stats(
  p_sort_by := 'downloads',
  p_sort_order := 'desc',
  p_limit := 10
);

-- ============================================================================
-- Test 5: Sorting by downloads (ASC)
-- ============================================================================
SELECT 'Test 5: Sorting by downloads ASC' as test_name;
SELECT 
  name,
  downloads,
  LAG(downloads) OVER() as prev_downloads,
  CASE 
    WHEN LAG(downloads) OVER() IS NULL OR LAG(downloads) OVER() <= downloads 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as sort_check
FROM query_caps_with_stats(
  p_sort_by := 'downloads',
  p_sort_order := 'asc',
  p_limit := 10
);

-- ============================================================================
-- Test 6: Sorting by other stats fields
-- ============================================================================
SELECT 'Test 6a: Sorting by favorites DESC' as test_name;
SELECT 
  name,
  favorites,
  downloads
FROM query_caps_with_stats(
  p_sort_by := 'favorites',
  p_sort_order := 'desc',
  p_limit := 5
);

SELECT 'Test 6b: Sorting by rating_count DESC' as test_name;
SELECT 
  name,
  rating_count,
  average_rating
FROM query_caps_with_stats(
  p_sort_by := 'rating_count',
  p_sort_order := 'desc',
  p_limit := 5
);

SELECT 'Test 6c: Sorting by average_rating DESC' as test_name;
SELECT 
  name,
  average_rating,
  rating_count
FROM query_caps_with_stats(
  p_sort_by := 'average_rating',
  p_sort_order := 'desc',
  p_limit := 5
);

-- ============================================================================
-- Test 7: Sorting by timestamp (updated_at)
-- ============================================================================
SELECT 'Test 7: Sorting by updated_at DESC' as test_name;
SELECT 
  name,
  "timestamp",
  LAG("timestamp") OVER() as prev_timestamp,
  CASE 
    WHEN LAG("timestamp") OVER() IS NULL OR LAG("timestamp") OVER() >= "timestamp" 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END as sort_check
FROM query_caps_with_stats(
  p_sort_by := 'updated_at',
  p_sort_order := 'desc',
  p_limit := 8
);

-- ============================================================================
-- Test 8: Name filtering
-- ============================================================================
SELECT 'Test 8: Name filtering' as test_name;
SELECT 
  name,
  display_name,
  downloads
FROM query_caps_with_stats(
  p_name := 'gpt',
  p_limit := 5
);

-- ============================================================================
-- Test 9: ID filtering
-- ============================================================================
SELECT 'Test 9: ID filtering (if you have a specific ID)' as test_name;
-- Replace 'your_cap_id_here' with an actual cap ID from your database
-- SELECT 
--   name,
--   id,
--   downloads
-- FROM query_caps_with_stats(
--   p_id := 'your_cap_id_here'
-- );
SELECT 'Skipped - replace with actual cap ID' as result;

-- ============================================================================
-- Test 10: Combined filtering (tags + name)
-- ============================================================================
SELECT 'Test 10: Combined filtering (tags + name)' as test_name;
SELECT 
  name,
  tags,
  downloads
FROM query_caps_with_stats(
  p_tags := ARRAY['AI Model'],
  p_name := 'chat',
  p_sort_by := 'downloads',
  p_sort_order := 'desc',
  p_limit := 5
);

-- ============================================================================
-- Test 11: Pagination
-- ============================================================================
SELECT 'Test 11a: Pagination - Page 1' as test_name;
SELECT 
  name,
  downloads,
  full_count
FROM query_caps_with_stats(
  p_tags := ARRAY['AI Model'],
  p_sort_by := 'downloads',
  p_sort_order := 'desc',
  p_limit := 3,
  p_offset := 0
);

SELECT 'Test 11b: Pagination - Page 2' as test_name;
SELECT 
  name,
  downloads,
  full_count
FROM query_caps_with_stats(
  p_tags := ARRAY['AI Model'],
  p_sort_by := 'downloads',
  p_sort_order := 'desc',
  p_limit := 3,
  p_offset := 3
);

-- ============================================================================
-- Test 12: Edge cases
-- ============================================================================
SELECT 'Test 12a: Empty tags array' as test_name;
SELECT count(*) as record_count
FROM query_caps_with_stats(
  p_tags := ARRAY[]::TEXT[],
  p_limit := 5
);

SELECT 'Test 12b: Non-existent tag' as test_name;
SELECT count(*) as record_count
FROM query_caps_with_stats(
  p_tags := ARRAY['NonExistentTag12345'],
  p_limit := 5
);

SELECT 'Test 12c: Large limit' as test_name;
SELECT count(*) as record_count
FROM query_caps_with_stats(
  p_limit := 1000
);

-- ============================================================================
-- Test 13: Data type verification
-- ============================================================================
SELECT 'Test 13: Data type verification' as test_name;
SELECT 
  pg_typeof(id) as id_type,
  pg_typeof(name) as name_type,
  pg_typeof(tags) as tags_type,
  pg_typeof(downloads) as downloads_type,
  pg_typeof(favorites) as favorites_type,
  pg_typeof(average_rating) as avg_rating_type,
  pg_typeof("timestamp") as timestamp_type,
  pg_typeof(full_count) as full_count_type
FROM query_caps_with_stats(p_limit := 1);

-- ============================================================================
-- Test 14: Performance test
-- ============================================================================
SELECT 'Test 14: Performance test' as test_name;
EXPLAIN ANALYZE
SELECT count(*) 
FROM query_caps_with_stats(
  p_tags := ARRAY['AI Model'],
  p_sort_by := 'downloads',
  p_sort_order := 'desc',
  p_limit := 50
);

-- ============================================================================
-- Test 15: NULL value handling
-- ============================================================================
SELECT 'Test 15: NULL value handling in stats' as test_name;
SELECT 
  name,
  downloads,
  favorites,
  rating_count,
  average_rating,
  CASE 
    WHEN downloads IS NULL THEN 'FAIL - downloads is NULL'
    WHEN favorites IS NULL THEN 'FAIL - favorites is NULL' 
    WHEN rating_count IS NULL THEN 'FAIL - rating_count is NULL'
    WHEN average_rating IS NULL THEN 'FAIL - average_rating is NULL'
    ELSE 'PASS - no NULL values'
  END as null_check
FROM query_caps_with_stats(p_limit := 10);

-- ============================================================================
-- Summary Report
-- ============================================================================
SELECT 'Test Summary: Function created and basic tests completed' as summary;

-- Check if we have any caps with the AI Model tag
SELECT 
  'Total caps with AI Model tag: ' || count(*) as ai_model_count
FROM cap_data 
WHERE tags @> '["AI Model"]'::jsonb AND enable = true;

-- Check total enabled caps
SELECT 
  'Total enabled caps: ' || count(*) as total_enabled_caps
FROM cap_data 
WHERE enable = true;

-- Check caps with stats data
SELECT 
  'Caps with stats data: ' || count(*) as caps_with_stats
FROM cap_data cd
INNER JOIN cap_stats cs ON cd.id = cs.cap_id
WHERE cd.enable = true;
