-- Function to handle rating a cap and updating stats atomically
-- 优化的方法：增量计算
CREATE OR REPLACE FUNCTION rate_cap(p_user_did TEXT, p_cap_id TEXT, p_rating INT)
RETURNS VOID AS $$
DECLARE
  old_rating INT;
  rating_exists BOOLEAN := FALSE;
  current_count BIGINT;
  current_sum BIGINT;
  current_avg FLOAT;
BEGIN
  -- 检查用户是否已经评过分
  SELECT rating INTO old_rating 
  FROM user_cap_ratings 
  WHERE user_did = p_user_did AND cap_id = p_cap_id;
  
  rating_exists := FOUND;
  
  -- 获取当前统计
  SELECT rating_count, average_rating INTO current_count, current_avg
  FROM cap_stats WHERE cap_id = p_cap_id;
  
  current_sum := COALESCE(current_count * current_avg, 0);
  
  -- Upsert用户评分
  INSERT INTO user_cap_ratings (user_did, cap_id, rating, updated_at)
  VALUES (p_user_did, p_cap_id, p_rating, NOW())
  ON CONFLICT (user_did, cap_id)
  DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW();
  
  -- 增量更新统计
  IF rating_exists THEN
    -- 更新现有评分：替换旧评分
    current_sum := current_sum - old_rating + p_rating;
    -- 评分数量不变
  ELSE
    -- 新增评分
    current_sum := current_sum + p_rating;
    current_count := current_count + 1;
  END IF;
  
  -- 更新cap_stats
  UPDATE cap_stats
  SET
    rating_count = current_count,
    average_rating = CASE 
      WHEN current_count > 0 THEN current_sum::FLOAT / current_count 
      ELSE 0 
    END,
    updated_at = NOW()
  WHERE cap_id = p_cap_id;
END;
$$ LANGUAGE plpgsql;