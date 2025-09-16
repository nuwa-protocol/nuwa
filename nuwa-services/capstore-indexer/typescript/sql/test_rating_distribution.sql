-- Test SQL for rating distribution functions
-- This file tests the rating distribution functions in rating_distribution.sql

BEGIN;

-- Clean up any existing test data
DELETE FROM user_cap_ratings WHERE cap_id IN ('test_cap_1', 'test_cap_2', 'test_cap_empty');
DELETE FROM cap_stats WHERE cap_id IN ('test_cap_1', 'test_cap_2', 'test_cap_empty');  
DELETE FROM cap_data WHERE id IN ('test_cap_1', 'test_cap_2', 'test_cap_empty');

-- Insert test caps
INSERT INTO cap_data (id, name, cid, display_name, description) VALUES 
('test_cap_1', 'test-cap-1', 'QmTest1', 'Test Cap 1', 'First test cap'),
('test_cap_2', 'test-cap-2', 'QmTest2', 'Test Cap 2', 'Second test cap'),
('test_cap_empty', 'test-cap-empty', 'QmTestEmpty', 'Empty Test Cap', 'Cap with no ratings');

-- Insert test cap stats
INSERT INTO cap_stats (cap_id, downloads, favorites, rating_count, average_rating) VALUES
('test_cap_1', 100, 20, 0, 0),
('test_cap_2', 50, 5, 0, 0),
('test_cap_empty', 10, 1, 0, 0);

-- Insert test rating data for test_cap_1 (diverse distribution)
INSERT INTO user_cap_ratings (user_did, cap_id, rating) VALUES
-- 5-star ratings (3 users)
('user_1', 'test_cap_1', 5),
('user_2', 'test_cap_1', 5),
('user_3', 'test_cap_1', 5),
-- 4-star ratings (2 users)
('user_4', 'test_cap_1', 4),
('user_5', 'test_cap_1', 4),
-- 3-star ratings (1 user)
('user_6', 'test_cap_1', 3),
-- 2-star ratings (1 user)
('user_7', 'test_cap_1', 2),
-- 1-star ratings (2 users)
('user_8', 'test_cap_1', 1),
('user_9', 'test_cap_1', 1);

-- Insert test rating data for test_cap_2 (only high ratings)
INSERT INTO user_cap_ratings (user_did, cap_id, rating) VALUES
('user_10', 'test_cap_2', 5),
('user_11', 'test_cap_2', 5),
('user_12', 'test_cap_2', 4),
('user_13', 'test_cap_2', 4);

-- test_cap_empty has no ratings (testing edge case)

-- Test 1: Basic rating distribution for test_cap_1
SELECT 'Test 1: Basic rating distribution for test_cap_1' as test_name;
SELECT * FROM get_cap_rating_distribution('test_cap_1');
-- Expected: rating 1->2, rating 2->1, rating 3->1, rating 4->2, rating 5->3

-- Test 2: Basic rating distribution for test_cap_2
SELECT 'Test 2: Basic rating distribution for test_cap_2' as test_name;
SELECT * FROM get_cap_rating_distribution('test_cap_2');
-- Expected: rating 4->2, rating 5->2

-- Test 3: Basic rating distribution for empty cap
SELECT 'Test 3: Basic rating distribution for empty cap' as test_name;
SELECT * FROM get_cap_rating_distribution('test_cap_empty');
-- Expected: no rows

-- Test 4: Complete rating distribution for test_cap_1 (should show all 1-5 ratings)
SELECT 'Test 4: Complete rating distribution for test_cap_1' as test_name;
SELECT * FROM get_cap_rating_distribution_complete('test_cap_1');
-- Expected: rating 1->2, rating 2->1, rating 3->1, rating 4->2, rating 5->3

-- Test 5: Complete rating distribution for test_cap_2 (should show 0 for missing ratings)
SELECT 'Test 5: Complete rating distribution for test_cap_2' as test_name;
SELECT * FROM get_cap_rating_distribution_complete('test_cap_2');
-- Expected: rating 1->0, rating 2->0, rating 3->0, rating 4->2, rating 5->2

-- Test 6: Complete rating distribution for empty cap (should show all 0s)
SELECT 'Test 6: Complete rating distribution for empty cap' as test_name;
SELECT * FROM get_cap_rating_distribution_complete('test_cap_empty');
-- Expected: rating 1->0, rating 2->0, rating 3->0, rating 4->0, rating 5->0

-- Test 7: All caps rating distribution
SELECT 'Test 7: All caps rating distribution' as test_name;
SELECT * FROM get_all_caps_rating_distribution() 
WHERE cap_id IN ('test_cap_1', 'test_cap_2', 'test_cap_empty')
ORDER BY cap_id, rating;
-- Expected: All ratings for test_cap_1 and test_cap_2, nothing for test_cap_empty

-- Test 8: Non-existent cap
SELECT 'Test 8: Non-existent cap' as test_name;
SELECT * FROM get_cap_rating_distribution('non_existent_cap');
-- Expected: no rows

-- Test 9: Complete distribution for non-existent cap
SELECT 'Test 9: Complete distribution for non-existent cap' as test_name;
SELECT * FROM get_cap_rating_distribution_complete('non_existent_cap');
-- Expected: rating 1->0, rating 2->0, rating 3->0, rating 4->0, rating 5->0

-- Test 10: Verify total counts
SELECT 'Test 10: Verify total counts' as test_name;
SELECT 
  'test_cap_1' as cap_id,
  SUM(count) as total_ratings
FROM get_cap_rating_distribution('test_cap_1')
UNION ALL
SELECT 
  'test_cap_2' as cap_id,
  SUM(count) as total_ratings
FROM get_cap_rating_distribution('test_cap_2');
-- Expected: test_cap_1->9, test_cap_2->4

-- Test 11: Verify average rating calculation
SELECT 'Test 11: Verify average rating calculation' as test_name;
SELECT 
  'test_cap_1' as cap_id,
  SUM(rating * count)::FLOAT / SUM(count) as calculated_average
FROM get_cap_rating_distribution('test_cap_1')
UNION ALL
SELECT 
  'test_cap_2' as cap_id,
  SUM(rating * count)::FLOAT / SUM(count) as calculated_average
FROM get_cap_rating_distribution('test_cap_2');
-- Expected: test_cap_1->3.44 (approx), test_cap_2->4.5

-- Clean up test data
DELETE FROM user_cap_ratings WHERE cap_id IN ('test_cap_1', 'test_cap_2', 'test_cap_empty');
DELETE FROM cap_stats WHERE cap_id IN ('test_cap_1', 'test_cap_2', 'test_cap_empty');
DELETE FROM cap_data WHERE id IN ('test_cap_1', 'test_cap_2', 'test_cap_empty');

ROLLBACK; -- Use ROLLBACK to not persist test data, or COMMIT if you want to keep it for debugging
