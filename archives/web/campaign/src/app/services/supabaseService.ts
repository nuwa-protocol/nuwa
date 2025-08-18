
import { createServiceClient } from './supabase';
import { StandardTweet } from './twitterAdapter';
import { TweetScoreData } from '../types/scoring';

export interface LeaderboardUser {
    id: string;
    handle: string;
    name: string;
    avatar: string;
    points: number;
    rank?: number;
}

export interface PointsHistoryItem {
    id: string;
    points: number;
    missionId: string;
    createdTime: string;
    missionTitle?: string;
    missionDescription?: string;
    missionDetails?: string;
}

/**
 * Retrieves the points for a given Twitter handle.
 * Throws an error if the user is not found or if there's a database error.
 */
export async function getUserPointsByHandle(twitterHandle: string): Promise<number> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
        .from('campaign_points')
        .select('points')
        .eq('handle', twitterHandle)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            // Handle user not found specifically
            console.warn(`User not found for handle: ${twitterHandle}`);
            throw new Error(`User not found: ${twitterHandle}`);
        }
        // Handle other potential database errors
        console.error(`Error fetching user points for handle ${twitterHandle}:`, error);
        throw new Error(`Database error fetching points: ${error.message}`);
    }

    if (!data) {
        // Should ideally not happen if error is null and code is not PGRST116, but good practice to check
        console.error(`No data returned for handle ${twitterHandle} despite no error.`);
        throw new Error(`User data not found for handle: ${twitterHandle}`);
    }

    return data.points;
    // Removed the outer try...catch block as we now throw errors directly
}

export async function getUserPointsHistory(twitterHandle: string): Promise<PointsHistoryItem[]> {
    try {
        const supabase = await createServiceClient();
        const { data, error } = await supabase
            .from('points_reward_log')
            .select('*')
            .eq('reward_to', twitterHandle)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching user points history:", error);
            return [];
        }

        return data.map(item => ({
            id: item.id,
            points: item.points,
            missionId: item.mission_id,
            createdTime: item.created_at,
            missionDetails: item.mission_details || ''
        }));
    } catch (error) {
        console.error("Error in getUserPointsHistory:", error);
        return [];
    }
}

export async function getLeaderboardData(): Promise<LeaderboardUser[]> {
    try {
        const supabase = await createServiceClient();

        // 获取所有用户数据并按积分降序排序
        const { data, error } = await supabase
            .from('campaign_points')
            .select('*')
            .order('points', { ascending: false });

        if (error) {
            console.error('Error fetching leaderboard data:', error);
            return [];
        }

        // 添加排名信息
        return data.map((user, index) => ({
            ...user,
            rank: index + 1
        }));
    } catch (error) {
        console.error('Error in getLeaderboardData:', error);
        return [];
    }
}

// Function to reward points to a user
export async function rewardUserPoints({ userName, points, missionId, missionDetails }: { userName: string, points: number, missionId: string, missionDetails?: string }) {
    try {
        const supabase = await createServiceClient();

        // Find user
        const { data: userData, error: userError } = await supabase
            .from('campaign_points')
            .select('id, points')
            .eq('handle', userName)
            .single();

        if (userError) {
            console.error('Error finding user in Supabase:', userError);
            return {
                success: false,
                message: `Failed to find user ${userName}`
            };
        }

        if (!userData) {
            return {
                success: false,
                message: `User ${userName} not found in campaign_points table`
            };
        }

        // Add reward record
        const { error: rewardError } = await supabase
            .from('points_reward_log')
            .insert({
                reward_to: userName,
                points: points,
                mission_id: missionId,
                mission_details: missionDetails || '',
            });

        if (rewardError) {
            console.error('Error adding reward record to Supabase:', rewardError);
            return {
                success: false,
                message: `Failed to add reward record for user ${userName}`
            };
        }

        // Update user points
        const newPoints = userData.points + points;
        const { error: updateError } = await supabase
            .from('campaign_points')
            .update({ points: newPoints })
            .eq('id', userData.id);

        if (updateError) {
            console.error('Error updating user points in Supabase:', updateError);
            return {
                success: false,
                message: `Failed to update points for user ${userName}`
            };
        }

        return {
            success: true,
            message: `Successfully rewarded ${points} points to user ${userName} for completing mission: ${missionId} : ${missionDetails}`
        };
    } catch (error) {
        return {
            success: false,
            message: `Error rewarding points: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// Function to check user reward history for a specific mission
export async function checkUserRewardHistory({ userName, missionId }: { userName: string, missionId: string }) {
    try {
        const supabase = await createServiceClient();

        // Query records
        const { data, error } = await supabase
            .from('points_reward_log')
            .select('mission_details')
            .eq('reward_to', userName)
            .eq('mission_id', missionId)
            .limit(1);

        if (error) {
            console.error('Error checking user reward history from Supabase:', error);
            return {
                hasReceivedReward: false,
                message: `Error checking reward history: ${error.message}`
            };
        }

        const hasReceived = data && data.length > 0;
        return {
            hasReceivedReward: hasReceived,
            missionDetails: hasReceived ? data[0].mission_details || '' : '',
            message: hasReceived
                ? `User ${userName} has already received rewards for mission: ${missionId}`
                : `User ${userName} has not received rewards for mission: ${missionId} yet`
        };
    } catch (error) {
        return {
            hasReceivedReward: false,
            message: `Error checking reward history: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// Function to deduct points from a user
export async function deductUserPoints({ userName, points, missionId, missionDetails }: { userName: string, points: number, missionId: string, missionDetails?: string }) {
    try {
        if (points <= 0) {
            return {
                success: false,
                message: `Points to deduct must be a positive number`
            };
        }

        const supabase = await createServiceClient();

        // Find user
        const { data: userData, error: userError } = await supabase
            .from('campaign_points')
            .select('id, points')
            .eq('handle', userName)
            .single();

        if (userError && userError.code !== 'PGRST116') { // Allow user not found error
            console.error('Error finding user in Supabase:', userError);
            return {
                success: false,
                message: `Failed to find user ${userName}`
            };
        }

        if (!userData || userData.points < points) {
            return {
                success: false,
                message: `User ${userName} does not have enough points to deduct or does not exist`
            };
        }

        // Add deduction record
        const { error: rewardError } = await supabase
            .from('points_reward_log')
            .insert({
                reward_to: userName,
                points: -points, // Negative points for deduction
                mission_id: missionId,
                mission_details: missionDetails || '',
            });

        if (rewardError) {
            console.error('Error adding deduction record to Supabase:', rewardError);
            return {
                success: false,
                message: `Failed to add deduction record for user ${userName}`
            };
        }

        // Update user points
        const newPoints = userData.points - points;
        const { error: updateError } = await supabase
            .from('campaign_points')
            .update({ points: newPoints })
            .eq('id', userData.id);

        if (updateError) {
            console.error('Error updating user points in Supabase:', updateError);
            // Attempt to rollback deduction log entry if update fails?
            return {
                success: false,
                message: `Failed to update points for user ${userName}`
            };
        }

        return {
            success: true,
            message: `Successfully deducted ${points} points from user ${userName} for mission: ${missionId} : ${missionDetails}`
        };
    } catch (error) {
        return {
            success: false,
            message: `Error deducting points: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// --- Tweet Scoring Table Operations --- //

/**
 * Interface for the data structure in the 'tweet' table with enhanced fields.
 */
export interface TweetScoreRecord {
    id: string;                // Tweet ID
    tweet_data: object;        // JSON data of the tweet (latest version)
    score: number;             // Current score
    content_score: number;     // Content portion of score (0-75)
    engagement_score: number;  // Engagement portion of score (0-25)
    reasoning: string;         // Explanation for the score
    
    // Current engagement metrics
    engagement_metrics: {
        likes: number;
        retweets: number;
        replies: number;
        quotes?: number;
        impressions?: number;
    };
    
    // Previous scoring data
    previous_score?: number;
    previous_content_score?: number;
    previous_engagement_score?: number;
    previous_reasoning?: string;
    previous_engagement_metrics?: {
        likes: number;
        retweets: number;
        replies: number;
        quotes?: number;
        impressions?: number;
    };
    
    score_change?: number;     // Difference between current and previous score
    created_at: string;        // First scoring time
    updated_at?: string;       // Last scoring time
}

/**
 * Adds or updates a tweet score record with enhanced scoring data.
 * 
 * @param tweetId The ID of the tweet
 * @param tweetData The JSON data of the tweet
 * @param score The overall score
 * @param contentScore The content portion of the score (0-75)
 * @param engagementScore The engagement portion of the score (0-25)
 * @param reasoning The explanation for the score
 * @returns {Promise<{isUpdate: boolean, scoreChange?: number}>} Result of the operation
 */
export async function saveTweetScoreRecord(
    tweetId: string,
    tweetData: StandardTweet,
    score: number,
    contentScore: number,
    engagementScore: number,
    reasoning: string
): Promise<{isUpdate: boolean, scoreChange?: number}> {
    const supabase = await createServiceClient();
    
    // Extract engagement metrics
    const engagementMetrics = {
        likes: tweetData.public_metrics?.like_count || 0,
        retweets: tweetData.public_metrics?.retweet_count || 0,
        replies: tweetData.public_metrics?.reply_count || 0,
        quotes: tweetData.public_metrics?.quote_count || 0,
        impressions: tweetData.public_metrics?.impression_count
    };
    
    // Check if record exists
    const { data: existingRecord, error: fetchError } = await supabase
        .from('tweet')
        .select('score, content_score, engagement_score, reasoning, engagement_metrics')
        .eq('id', tweetId)
        .maybeSingle();
    
    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "not found" which is fine
        console.error(`Error checking for existing tweet score: ${fetchError.message}`);
        throw new Error(`Database error: ${fetchError.message}`);
    }
    
    const now = new Date().toISOString();
    
    // If record exists, update it with previous data preserved
    if (existingRecord) {
        const scoreChange = score - existingRecord.score;
        
        const { error: updateError } = await supabase
            .from('tweet')
            .update({
                tweet_data: tweetData,
                score: score,
                content_score: contentScore,
                engagement_score: engagementScore,
                reasoning: reasoning,
                engagement_metrics: engagementMetrics,
                previous_score: existingRecord.score,
                previous_content_score: existingRecord.content_score,
                previous_engagement_score: existingRecord.engagement_score,
                previous_reasoning: existingRecord.reasoning,
                previous_engagement_metrics: existingRecord.engagement_metrics,
                score_change: scoreChange,
                updated_at: now
            })
            .eq('id', tweetId);
        
        if (updateError) {
            console.error(`Error updating tweet score: ${updateError.message}`);
            throw new Error(`Failed to update tweet score: ${updateError.message}`);
        }
        
        return { isUpdate: true, scoreChange };
    }
    
    // If record doesn't exist, create new one
    const { error: insertError } = await supabase
        .from('tweet')
        .insert({
            id: tweetId,
            tweet_data: tweetData,
            score: score,
            content_score: contentScore,
            engagement_score: engagementScore,
            reasoning: reasoning,
            engagement_metrics: engagementMetrics,
            created_at: now
        });
    
    if (insertError) {
        console.error(`Error inserting tweet score: ${insertError.message}`);
        throw new Error(`Failed to insert tweet score: ${insertError.message}`);
    }
    
    return { isUpdate: false };
}

/**
 * Retrieves a tweet score with all enhanced data.
 * 
 * @param tweetId The ID of the tweet
 * @returns {Promise<TweetScoreRecord | null>} The enhanced tweet score or null if not found
 */
export async function getTweetScore(tweetId: string): Promise<TweetScoreRecord | null> {
    const supabase = await createServiceClient();
    
    const { data, error } = await supabase
        .from('tweet')
        .select('*')
        .eq('id', tweetId)
        .maybeSingle();
    
    if (error) {
        console.error(`Error retrieving tweet score: ${error.message}`);
        throw new Error(`Database error: ${error.message}`);
    }
    
    return data;
}

/**
 * Gets previous scoring data for a tweet in the format needed by the scorer.
 * 
 * @param tweetId The ID of the tweet
 * @returns {Promise<TweetScoreData | null>} Previous score data or null if not applicable
 */
export async function getPreviousTweetScoreData(tweetId: string): Promise<TweetScoreData | null> {
    const tweet = await getTweetScore(tweetId);
    
    if (!tweet || !tweet.previous_score || !tweet.previous_engagement_metrics) {
        return null;
    }
    
    return {
        tweet_id: tweetId,
        score: tweet.previous_score,
        content_score: tweet.previous_content_score || 0,  
        engagement_score: tweet.previous_engagement_score || 0, 
        engagement_metrics: tweet.previous_engagement_metrics,
        scored_at: tweet.updated_at || tweet.created_at
    };
}

// --- Twitter Profile Scoring Table Operations --- //

/**
 * Interface for the data structure in the 'twitter_profile_score' table.
 */
export interface TwitterProfileScore {
    handle: string;       // Twitter handle as primary key
    score: number;        // AI assigned score
    reasoning: string;    // Explanation for the score
    created_at?: string;  // Automatically added timestamp
    updated_at?: string;  // Last update time
}

/**
 * Adds or updates a Twitter profile score in the 'twitter_profile_score' table.
 * If the handle already exists, the existing record will be updated.
 * 
 * @param handle The Twitter handle
 * @param profileData The JSON data of the Twitter profile
 * @param score The score assigned to the profile
 * @param reasoning The explanation for the score
 * @returns {Promise<void>} Resolves when the insertion or update is successful
 * @throws {Error} Throws an error with a specific message on failure
 */
export async function addTwitterProfileScore(
    handle: string, 
    score: number, 
    reasoning: string,
    summary?: string,
): Promise<void> {
    const supabase = await createServiceClient(); // Use service client for write operations
    
    // First check if the profile already exists
    const exists = await checkTwitterProfileExists(handle);
    
    if (exists) {
        // If it exists, update the record
        const { error } = await supabase
            .from('twitter_profile_score') 
            .update({
                score: score,
                reasoning: reasoning,
                summary: summary,
                updated_at: new Date().toISOString()
            })
            .eq('handle', handle);

        if (error) {
            console.error(`Error updating Twitter profile score for handle ${handle}:`, error);
            throw new Error(`Failed to update Twitter profile score: ${error.message}`);
        }
        
        console.log(`Successfully updated score for Twitter profile ${handle}.`);
    } else {
        // If it doesn't exist, create a new record
        const { error } = await supabase
            .from('twitter_profile_score')
            .insert({
                handle: handle,
                score: score,
                reasoning: reasoning,
                summary: summary,
            });

        if (error) {
            console.error(`Error adding Twitter profile score for handle ${handle}:`, error);
            throw new Error(`Failed to add Twitter profile score: ${error.message}`);
        }
        
        console.log(`Successfully added score for Twitter profile ${handle}.`);
    }
}

/**
 * Checks if a Twitter profile score exists in the 'twitter_profile_score' table.
 * 
 * @param handle The Twitter handle to check
 * @returns A boolean indicating whether the profile record exists
 * @throws Throws an error if there is a database error during the check
 */
export async function checkTwitterProfileExists(handle: string): Promise<boolean> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
        .from('twitter_profile_score')
        .select('handle')
        .eq('handle', handle)
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error(`Error checking existence for Twitter profile ${handle}:`, error);
        throw new Error(`Database error checking Twitter profile existence: ${error.message}`);
    }

    return !!data;
}

/**
 * Gets the Twitter profile score record for a handle
 * 
 * @param handle The Twitter handle
 * @returns An object containing score and reasoning, or null if not found
 */
export async function getTwitterProfileScore(handle: string): Promise<{ score: number; reasoning: string } | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
        .from('twitter_profile_score')
        .select('score, reasoning')
        .eq('handle', handle)
        .maybeSingle();

    if (error) {
        console.error(`Error fetching Twitter profile score for ${handle}:`, error);
        throw new Error(`Database error fetching Twitter profile score: ${error.message}`);
    }

    return data;
}

/**
 * Checks if a Twitter profile has been scored recently (within the specified days)
 * 
 * @param handle The Twitter handle to check
 * @returns An object with the score and reasoning if found, null otherwise
 */
export async function checkTwitterProfileScore(
    handle: string,
): Promise<{ score: number; reasoning: string; summary?: string } | null> {
    const supabase = await createServiceClient();
    
    const { data, error } = await supabase
        .from('twitter_profile_score')
        .select('score, reasoning, summary')
        .eq('handle', handle)
        .maybeSingle();
    
    if (error) {
        console.error(`Error checking recent Twitter profile score for ${handle}:`, error);
        throw new Error(`Database error checking recent Twitter profile score: ${error.message}`);
    }
    
    return data;
} 