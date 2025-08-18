import { tool } from 'ai';
import { z } from 'zod';
import {
    rewardUserPoints,
    checkUserRewardHistory,
    deductUserPoints,
    getUserPointsByHandle,
    getTweetScore,
    saveTweetScoreRecord,
    checkTwitterProfileScore,
    addTwitterProfileScore,
} from '@/app/services/supabaseService';
import { assessTweetScore, calculateEngagementScore } from './scoring-agent';
// Import the profile scoring function
import { getProfileScore } from './profile-scoring-agent';
import * as twitterAdapter from '@/app/services/twitterAdapter';


export const tools: Record<string, any> = {

    // --- Twitter Tools (now wrappers around twitterAdapter) ---

    // 1. 批量获取用户信息
    twitterBatchGetUsers: tool({
        description: 'Get information about multiple Twitter users by their user IDs in a standardized format',
        parameters: z.object({
            userIds: z.string().describe('Comma-separated list of Twitter user IDs'),
        }),
        // Call the adapter function
        // execute: async ({ userIds }) => twitterService.batchGetUsers(userIds), // Old call
        execute: async ({ userIds }) => twitterAdapter.getStandardUsersByIds(userIds), // Use adapter
    }),

    // 2. 通过用户名获取用户信息
    twitterGetUserByUsername: tool({
        description: 'Get information about a Twitter user by username in a standardized format',
        parameters: z.object({
            userName: z.string().describe('The Twitter username to get information for'),
        }),
        // Call the adapter function
        execute: async ({ userName }) => twitterAdapter.getStandardUserByUsername(userName),
    }),

    // 3. 获取用户最新推文
    twitterGetUserLastTweets: tool({
        description: 'Retrieve latest tweets by user name (excluding replies) in a standardized format. Results paginated.',
        parameters: z.object({
            userName: z.string().describe('The Twitter username to get tweets from'),
            cursor: z.string().optional().describe('Pagination cursor'),
        }),
        // Call the adapter function
        execute: async ({ userName, cursor }) => twitterAdapter.getStandardUserLastTweets(userName, cursor),
    }),

    // 4. 获取用户关注者
    twitterGetUserFollowers: tool({
        description: 'Get user followers in a standardized format (newest first). Results paginated.',
        parameters: z.object({
            userName: z.string().describe('The Twitter username'),
            cursor: z.string().optional().describe('Pagination cursor'),
        }),
        // Call the adapter function
        execute: async ({ userName, cursor }) => twitterAdapter.getStandardUserFollowers(userName, cursor),
    }),

    // 5. 获取用户关注的人
    twitterGetUserFollowings: tool({
        description: 'Get user followings in a standardized format. Results paginated.',
        parameters: z.object({
            userName: z.string().describe('The Twitter username'),
            cursor: z.string().optional().describe('Pagination cursor'),
        }),
        // Call the adapter function
        execute: async ({ userName, cursor }) => twitterAdapter.getStandardUserFollowings(userName, cursor),
    }),

    // 6. 获取用户提及
    twitterGetUserMentions: tool({
        description: 'Get tweet mentions for a user in a standardized format (newest first). Results paginated.',
        parameters: z.object({
            userName: z.string().describe('The user screen name'),
            sinceTime: z.number().optional().describe('Unix timestamp (seconds)'),
            untilTime: z.number().optional().describe('Unix timestamp (seconds)'),
            cursor: z.string().optional().describe('Pagination cursor'),
        }),
        // Call the adapter function
        execute: async ({ userName, sinceTime, untilTime, cursor }) =>
            twitterAdapter.getStandardUserMentions(userName, sinceTime, untilTime, cursor),
    }),

    // 7. 通过ID获取推文
    twitterGetTweetsByIds: tool({
        description: 'Get a single tweet by its ID in a standardized format.',
        parameters: z.object({
            // tweet_ids: z.string().describe('A single tweet ID.'), // Renamed parameter
            tweetId: z.string().describe('A single tweet ID.'),
        }),
        // Call the adapter function, handle potential null return
        execute: async ({ tweetId }) => {
            const tweet = await twitterAdapter.getStandardTweetById(tweetId); // Use adapter
            if (!tweet) {
                // Return an error structure if tweet not found
                return { error: 'Tweet not found', message: `Tweet with ID ${tweetId} could not be fetched or does not exist.` };
            }
            return tweet; // Return StandardTweet
        },
    }),

    // 8. 获取推文回复
    twitterGetTweetReplies: tool({
        description: 'Get tweet replies by tweet ID in a standardized format (newest first). Results paginated.',
        parameters: z.object({
            tweetId: z.string().describe('The original tweet ID'),
            sinceTime: z.number().optional().describe('Unix timestamp (seconds)'),
            untilTime: z.number().optional().describe('Unix timestamp (seconds)'),
            cursor: z.string().optional().describe('Pagination cursor'),
        }),
        // Call the adapter function
        execute: async ({ tweetId, sinceTime, untilTime, cursor }) =>
            twitterAdapter.getStandardTweetReplies(tweetId, sinceTime, untilTime, cursor),
    }),

    // 9. 获取推文引用
    twitterGetTweetQuotes: tool({
        description: 'Get tweet quotes by tweet ID in a standardized format (newest first). Results paginated.',
        parameters: z.object({
            tweetId: z.string().describe('The tweet ID'),
            sinceTime: z.number().optional().describe('Unix timestamp (seconds)'),
            untilTime: z.number().optional().describe('Unix timestamp (seconds)'),
            includeReplies: z.boolean().optional().default(true).describe('Include replies?'),
            cursor: z.string().optional().describe('Pagination cursor'),
        }),
        // Call the adapter function
        execute: async ({ tweetId, sinceTime, untilTime, includeReplies, cursor }) =>
            twitterAdapter.getStandardTweetQuotes(tweetId, sinceTime, untilTime, includeReplies, cursor),
    }),

    // 10. 获取推文转发者
    twitterGetTweetRetweeters: tool({
        description: 'Get tweet retweeters by tweet ID in a standardized format. Results paginated.',
        parameters: z.object({
            tweetId: z.string().describe('The tweet ID'),
            cursor: z.string().optional().describe('Pagination cursor'),
        }),
        // Call the adapter function
        execute: async ({ tweetId, cursor }) => twitterAdapter.getStandardTweetRetweeters(tweetId, cursor),
    }),

    // --- Other Tools ---

    // 11. 奖励用户代币 (No change)
    rewardUserPoints: tool({
        description: 'Reward points to a user for completing a mission',
        parameters: z.object({
            userName: z.string().describe('The username of the reward receiver'),
            points: z.number().describe('The amount of points to be rewarded'),
            missionId: z.string().describe('The id of the mission that was completed'),
            missionDetails: z.string().optional().describe('Additional details about the completed mission'),
        }),
        execute: async ({ userName, points, missionId, missionDetails }) => {
            try {
                await rewardUserPoints({ userName, points, missionId, missionDetails });
                return { success: true, message: `Successfully rewarded ${points} points to ${userName}.` };
            } catch (error) {
                console.error('Error in rewardUserPoints tool:', error);
                return { success: false, message: `Failed to reward points: ${error instanceof Error ? error.message : String(error)}` };
            }
        },
    }),

    // 12. 检查用户是否已经从特定任务获得过奖励 (No change in call, added try-catch)
    checkUserRewardHistory: tool({
        description: 'Check if a user has already received rewards for a specific mission',
        parameters: z.object({
            userName: z.string().describe('The username to check'),
            missionId: z.string().describe('The id of the mission to check'),
        }),
        execute: async ({ userName, missionId }) => {
            // Call the function from supabaseService
            // No try-catch needed here as checkUserRewardHistory in service returns object, doesn't throw
            // Re-check supabaseService: checkUserRewardHistory does NOT throw, it returns object. OK.
            return checkUserRewardHistory({ userName, missionId });
        },
    }),

    // 13. 扣除用户积分 (No change in call, added try-catch)
    deductUserPoints: tool({
        description: 'Deduct points from a user',
        parameters: z.object({
            userName: z.string().describe('The username of the user to deduct points from'),
            points: z.number().describe('The amount of points to be deducted (positive number)'),
            missionId: z.string().describe('The id of the mission that is deducting the points'),
            missionDetails: z.string().optional().describe('Additional details about why points are being deducted'),
        }),
        execute: async ({ userName, points, missionId, missionDetails }) => {
            // Call the function from supabaseService
            try {
                await deductUserPoints({ userName, points, missionId, missionDetails });
                return { success: true, message: `Successfully deducted ${points} points from ${userName}.` };
            } catch (error) {
                console.error('Error in deductUserPoints tool:', error);
                return { success: false, message: `Failed to deduct points: ${error instanceof Error ? error.message : String(error)}` };
            }
        },
    }),

    // 14. 生成随机数（支持批量生成）
    generateRandomNumber: tool({
        description: 'Generate one or more random integers between 0 and 100. Specify count to generate multiple numbers.',
        parameters: z.object({
            count: z.number().int().min(1).max(100).optional().default(1).describe('How many random numbers to generate (default 1, max 100)')
        }),
        execute: async ({ count = 1 }) => {
            try {
                // 生成 count 个 0 到 100 之间的随机整数
                const randomNumbers = Array.from({ length: count }, () => Math.floor(Math.random() * 101));
                return randomNumbers;
            } catch (error) {
                return {
                    error: `Error generating random numbers: ${error instanceof Error ? error.message : String(error)}`
                };
            }
        },
    }),

    // 15. 获取用户当前积分 (No change, already handles errors)
    getUserCurrentPoints: tool({
        description: 'Get the current points of a user from the Campaign Points table. Returns an object with points and potentially error/message fields.',
        parameters: z.object({
            userName: z.string().describe('The username to get points for'),
        }),
        execute: async ({ userName }) => {
            try {
                const points = await getUserPointsByHandle(userName);
                return {
                    points: points,
                    message: `User ${userName} has ${points} points.`
                };
            } catch (error) {
                console.error(`Tool Error: Failed to get points for ${userName}:`, error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    points: 0,
                    error: errorMessage,
                };
            }
        },
    }),

    // 16. 检查用户是否关注了NuwaDev
    checkUserFollowsNuwaDev: tool({
        description: 'Check if a user follows the NuwaDev Twitter account',
        parameters: z.object({
            userName: z.string().describe('The Twitter username to check if they follow NuwaDev'),
        }),
        // Call the adapter function
        execute: async ({ userName }) => {
            try {
                // return await twitterService.checkUserFollowsNuwaDev(userName); // Old call
                return await twitterAdapter.checkUserFollowsNuwaDev(userName); // Use adapter
            } catch (error) {
                console.error(`Error in checkUserFollowsNuwaDev tool for ${userName}:`, error);
                // Return error structure consistent with the service function's potential errors
                return {
                    followsNuwaDev: false,
                    error: `Failed to check follow status: ${error instanceof Error ? error.message : String(error)}`
                };
            }
        }
    }),

    // 17. 发送推文内容到Twitter卡片 (No change)
    sendPostToTwitterCard: tool({
        description: 'Create a Twitter card preview with content and optional image URL',
        parameters: z.object({
            content: z.string().describe('The content of the tweet to be displayed'),
            imageUrl: z.string().optional().describe('URL of an image to include in the tweet (optional)'),
        }),
        execute: async ({ content, imageUrl }) => {
            try {
                return {
                    success: true,
                    content,
                    imageUrl
                };
            } catch (error) {
                return {
                    success: false,
                    error: `Error creating Twitter card: ${error instanceof Error ? error.message : String(error)}`
                };
            }
        },
    }),

    // 18. Score a tweet using the scoring agent and save to database
    scoreTweet: tool({
        description: 'Analyzes a tweet based on content quality and engagement metrics, assigns a score (0-100), and tracks score changes over time. Automatically rescores tweets after sufficient time has passed to analyze engagement growth.',
        parameters: z.object({
            tweetId: z.string().describe('The unique identifier of the tweet to be scored.')
        }),
        execute: async function ({ tweetId }) {
            try {
                // Check if tweet has been scored before
                let existingScore = null;
                const MIN_RESCORE_INTERVAL_HOURS = 1; // Minimum hours between scoring attempts

                try {
                    existingScore = await getTweetScore(tweetId);

                    // If already scored recently, return existing score
                    if (existingScore) {
                        const lastScoredAt = new Date(existingScore.updated_at || existingScore.created_at);
                        const hoursSinceLastScore = (Date.now() - lastScoredAt.getTime()) / (1000 * 60 * 60);

                        if (hoursSinceLastScore < MIN_RESCORE_INTERVAL_HOURS) {
                            return {
                                success: true,
                                message: `Tweet ${tweetId} was scored ${hoursSinceLastScore.toFixed(1)} hours ago with a score of ${existingScore.score}/100. Rescoring is available after ${MIN_RESCORE_INTERVAL_HOURS} hours.`,
                                score: existingScore.score,
                                content_score: existingScore.content_score,
                                engagement_score: existingScore.engagement_score,
                                reasoning: existingScore.reasoning,
                                last_scored_at: lastScoredAt.toISOString(),
                                hours_until_rescore: (MIN_RESCORE_INTERVAL_HOURS - hoursSinceLastScore).toFixed(1),
                                is_rescored: false
                            };
                        }

                        // If more than MIN_RESCORE_INTERVAL_HOURS have passed, we'll rescore engagement only
                        console.log(`Tweet ${tweetId} was last scored ${hoursSinceLastScore.toFixed(1)} hours ago. Updating engagement score only.`);
                    }
                } catch (error) {
                    console.warn(`Could not check existing score for tweet ${tweetId}: ${error}`);
                    // Continue with scoring even if check fails
                }

                // Fetch tweet data
                console.log(`Fetching tweet data for ${tweetId}...`);
                const standardTweet = await twitterAdapter.getStandardTweetById(tweetId);

                if (!standardTweet) {
                    throw new Error(`Tweet data not found for ID ${tweetId}`);
                }

                let score, reasoning, engagement_score, content_score;

                // If we have an existing score, only update the engagement part
                if (existingScore) {
                    // Extract current engagement metrics
                    const currentMetrics = {
                        likes: standardTweet.public_metrics?.like_count || 0,
                        retweets: standardTweet.public_metrics?.retweet_count || 0,
                        replies: standardTweet.public_metrics?.reply_count || 0,
                        quotes: standardTweet.public_metrics?.quote_count || 0,
                        impressions: standardTweet.public_metrics?.impression_count,
                        followers: standardTweet.author?.public_metrics?.followers_count
                    };

                    // Calculate new engagement score but keep existing content score
                    engagement_score = calculateEngagementScore(currentMetrics, standardTweet.created_at);
                    content_score = existingScore.content_score;
                    score = Math.min(content_score + engagement_score, 100);
                    reasoning = existingScore.reasoning; // Keep existing reasoning for content

                    console.log(`Updated engagement score for tweet ${tweetId}. New engagement score: ${engagement_score.toFixed(2)}`);
                } else {
                    // For first-time scoring, do a full assessment
                    console.log(`Scoring tweet ${tweetId} for the first time...`);
                    const scoreResult = await assessTweetScore(standardTweet);
                    score = scoreResult.score;
                    reasoning = scoreResult.reasoning;
                    engagement_score = scoreResult.engagement_score;
                    content_score = scoreResult.content_score;
                }

                // Save the score to database
                console.log(`Saving score for tweet ${tweetId}...`);
                const { isUpdate, scoreChange } = await saveTweetScoreRecord(
                    tweetId,
                    standardTweet,
                    score,
                    content_score,
                    engagement_score,
                    reasoning
                );

                // Return result
                return {
                    success: true,
                    message: isUpdate
                        ? `Tweet ${tweetId} has been rescored. New score: ${score}/100 (${scoreChange && scoreChange > 0 ? '+' : ''}${scoreChange} change).`
                        : `Tweet ${tweetId} has been scored for the first time. Score: ${score}/100.`,
                    score: score,
                    content_score: content_score,
                    engagement_score: engagement_score,
                    reasoning: reasoning,
                    score_change: scoreChange,
                    is_rescored: isUpdate
                };

            } catch (error) {
                console.error(`Error in scoreTweet tool for tweet ID ${tweetId}:`, error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    success: false,
                    message: `Failed to score tweet ${tweetId}: ${errorMessage}`,
                    score: null,
                    reasoning: null,
                    error: errorMessage
                };
            }
        },
    }),

    // 19. Score a user twitter profile using the profile scoring agent and save to database
    scoreTwitterProfile: tool({
        description: 'Fetches Twitter user profile data, analyzes it to assign a score (0-100), and saves the result. Can rescore if forced or if the previous score was 0. Returns score changes on rescore.',
        parameters: z.object({
            userName: z.string().describe('The Twitter username (handle) of the profile to be scored.'),
            forceRescore: z.boolean().optional().default(false).describe('Whether to force a re-evaluation of the profile score, even if recently scored and the score is not 0.'),
        }),
        execute: async function ({ userName, forceRescore = false }) {
            try {
                let existingScoreData = null;
                let shouldRescore = forceRescore; // Start with the AI's decision or explicit flag

                try {
                    existingScoreData = await checkTwitterProfileScore(userName);
                    if (existingScoreData) {
                        if (existingScoreData.score === 0) {
                            console.log(`Profile ${userName} has a score of 0, triggering automatic rescore.`);
                            shouldRescore = true; // Automatically rescore if score is 0
                        }
                    }
                } catch (error) {
                    console.warn(`Could not check for existing profile score for ${userName}: ${error}. Proceeding with scoring.`);
                    // existingScoreData remains null. Scoring will proceed.
                    // shouldRescore depends on the initial forceRescore flag.
                }

                // If there's existing data, and we are NOT rescoring (neither by force nor due to score 0)
                if (existingScoreData && !shouldRescore) {
                    return {
                        success: true,
                        message: `Profile ${userName} was scored previously. Score: ${existingScoreData.score}/100. Use 'forceRescore: true' to re-evaluate if needed.`,
                        score: existingScoreData.score,
                        reasoning: existingScoreData.reasoning,
                        summary: existingScoreData.summary,
                        is_rescored: false,
                        score_change: null,
                    };
                }

                // Determine if this operation is effectively a "rescore" of existing data
                const isActuallyRescoreOperation = shouldRescore && existingScoreData != null;

                if (isActuallyRescoreOperation) {
                    console.log(`Rescoring profile for ${userName} (reason: ${forceRescore ? 'forced by AI/user' : 'previous score was 0'})...`);
                } else {
                    console.log(`Scoring profile for ${userName} (first time, or check for existing score failed, or forced without prior data)...`);
                }

                // 1. Fetch user profile data using twitterAdapter
                console.log(`Fetching standardized user profile data for ${userName}...`);
                const userProfile = await twitterAdapter.getStandardUserByUsername(userName);
                if (!userProfile) {
                    throw new Error(`Standard user data not found for username ${userName} via twitterAdapter.`);
                }

                // 2. Fetch a limited number of recent tweets
                console.log(`Fetching recent tweets for ${userName}...`);
                let recentTweets: twitterAdapter.StandardTweet[] = [];
                try {
                    const tweetResult = await twitterAdapter.getStandardUserLastOriginalTweets(userName, undefined, 35);
                    recentTweets = tweetResult.tweets;
                } catch (tweetError) {
                    console.warn(`Could not fetch recent tweets for ${userName}:`, tweetError);
                    // Continue without tweets if fetching fails
                }

                // 3. Create streamlined profile data for scoring
                const profileDataForScoring = {
                    ...userProfile,
                    recent_tweets: recentTweets
                };

                // 4. Get the new score from the profile scoring agent
                console.log(`Scoring profile with AI agent for ${userName}...`);
                const { score: newScore, reasoning: newReasoning, summary: newSummary } = await getProfileScore(profileDataForScoring);


                // 5. Save the score to the database
                try {
                    await addTwitterProfileScore(userName, newScore, newReasoning, newSummary);
                    console.log(`Profile score for ${userName} (new/updated) saved to database.`);
                } catch (dbError) {
                    console.error(`Failed to save profile score to database for ${userName}: ${dbError}`);
                    // Continue with the response even if saving fails, but log critical error
                }

                let scoreChange = null;
                if (isActuallyRescoreOperation && existingScoreData) { // existingScoreData check for safety
                    scoreChange = newScore - existingScoreData.score;
                }

                let message;
                if (isActuallyRescoreOperation) {
                    message = `Profile ${userName} has been rescored. New score: ${newScore}/100 (${scoreChange !== null && scoreChange >= 0 ? '+' : ''}${scoreChange !== null ? scoreChange.toFixed(0) : 'N/A'} change).`;
                } else { // Covers first time score, or scoring after failed check, or forced without prior data
                    message = `Profile ${userName} successfully scored. Score: ${newScore}/100.`;
                }

                return {
                    success: true,
                    message: message,
                    score: newScore,
                    reasoning: newReasoning,
                    summary: newSummary,
                    is_rescored: isActuallyRescoreOperation,
                    score_change: scoreChange,
                };

            } catch (error) {
                console.error(`Error in scoreTwitterProfile tool for username ${userName}:`, error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    success: false,
                    message: `Failed to score profile ${userName}: ${errorMessage}`,
                    score: null,
                    reasoning: null,
                    summary: null, // Added for consistency
                    error: errorMessage
                };
            }
        },
    }),

    // 20. Lottery Game Tool
    lotteryGame: tool({
        description: 'Play a lottery game: bet points, guess big/small/equal, and win 2x or 100x your bet if lucky. Strictly checks user balance and processes each bet securely. Supports batch mode.',
        parameters: z.object({
            userName: z.string().describe('The username of the player'),
            bet: z.number().int().min(1).describe('How many points to bet (minimum 1)'),
            guess: z.enum(['big', 'small', 'equal']).describe('Your guess: big (>50), small (<50), or equal (=50)'),
            confirm: z.boolean().describe('User must confirm to proceed'),
            batch: z.number().int().min(1).max(100).optional().describe('Number of games to play in batch mode (default 1)'),
        }),
        execute: async ({ userName, bet, guess, confirm, batch = 1 }: {
            userName: string;
            bet: number;
            guess: 'big' | 'small' | 'equal';
            confirm: boolean;
            batch?: number;
        }): Promise<{
            success: boolean;
            message: string;
            winCount?: number;
            jackpotCount?: number;
            reward?: number;
            afterPoints?: number;
            needConfirm?: boolean;
            currentPoints?: number;
            bet?: number;
            guess?: string;
            batch?: number;
        }> => {
            // 1. Check user points
            const pointsResult = await tools.getUserCurrentPoints.execute({ userName });
            if (!pointsResult || typeof pointsResult.points !== 'number') {
                return { success: false, message: `无法获取用户 ${userName} 的积分，请稍后再试。` };
            }
            const currentPoints = pointsResult.points;
            if (currentPoints < 1) {
                return { success: false, message: `你的积分不足，无法参与游戏。` };
            }
            // 2. Check bet validity
            const totalBet = bet * batch;
            if (bet < 1) {
                return { success: false, message: `每次下注至少 1 积分。` };
            }
            if (currentPoints < totalBet) {
                return { success: false, message: `你的积分不足，当前积分为 ${currentPoints}，需要 ${totalBet} 积分才能进行${batch > 1 ? batch + '轮' : '本轮'}游戏。` };
            }
            // 3. Check confirmation
            if (!confirm) {
                return {
                    success: false,
                    message: `你将下注 ${bet} 积分，选择"${guess === 'big' ? '大于50' : guess === 'small' ? '小于50' : '等于50'}"，${batch > 1 ? `共${batch}轮，总计${totalBet}积分。` : ''}请确认是否继续？`,
                    needConfirm: true,
                    currentPoints,
                    bet,
                    guess,
                    batch
                };
            }
            // 4. Deduct points first
            const deductResult = await tools.deductUserPoints.execute({ userName, points: totalBet, missionId: 'lottery_game', missionDetails: `Lottery game${batch > 1 ? ` batch x${batch}` : ''}` });
            if (!deductResult || !deductResult.success) {
                return { success: false, message: `扣除积分失败：${deductResult && deductResult.message ? deductResult.message : '未知错误'}` };
            }
            // 5. Rolling suspense message
            // 6. Generate random number(s)
            const randomResult = await tools.generateRandomNumber.execute({ count: batch });
            let numbers = Array.isArray(randomResult) ? randomResult : (typeof randomResult === 'number' ? [randomResult] : []);
            if (!numbers.length) {
                return { success: false, message: '生成随机数失败，请重试。' };
            }
            // 7. Reveal and calculate results
            let winCount = 0;
            let jackpotCount = 0;
            let resultLine = '';
            let reward = 0;
            for (let i = 0; i < numbers.length; i++) {
                const n = numbers[i];
                let win = false, jackpot = false, emoji = '❌';
                if (guess === 'equal' && n === 50) {
                    win = true; jackpot = true; emoji = '🎉';
                    jackpotCount++;
                } else if (guess === 'big' && n > 50) {
                    win = true; emoji = '✅';
                } else if (guess === 'small' && n < 50) {
                    win = true; emoji = '✅';
                } else if (guess === 'equal') {
                    emoji = '😢';
                }
                if (win) winCount++;
                resultLine += `${n}${emoji} `;
            }
            // 8. Reward calculation
            if (winCount > 0) {
                for (let i = 0; i < numbers.length; i++) {
                    const n = numbers[i];
                    if (guess === 'equal' && n === 50) {
                        reward += bet * 100;
                    } else if ((guess === 'big' && n > 50) || (guess === 'small' && n < 50)) {
                        reward += bet * 2;
                    }
                }
                // 9. Reward user
                await tools.rewardUserPoints.execute({ userName, points: reward, missionId: 'lottery_game', missionDetails: `Lottery game reward${batch > 1 ? ` batch x${batch}` : ''}` });
            }
            // 10. Prepare message
            let message = `🎲 结果：${resultLine.trim()}`;
            if (winCount > 0) {
                message += `\n恭喜你！你赢了 ${winCount} 次${jackpotCount > 0 ? `，其中 ${jackpotCount} 次为大奖（100倍）` : ''}，共获得 ${reward} 积分奖励。`;
            } else {
                message += '\n很遗憾，你没有中奖，积分已扣除。';
            }
            // 11. Check remaining points
            const afterPointsResult = await tools.getUserCurrentPoints.execute({ userName });
            const afterPoints = afterPointsResult && typeof afterPointsResult.points === 'number' ? afterPointsResult.points : 0;
            if (afterPoints > 0) {
                message += `\n你当前剩余积分：${afterPoints}。还要再玩一局吗？`;
            } else {
                message += '\n你的积分已用完，欢迎下次再来！';
            }
            return {
                success: true,
                message,
                winCount,
                jackpotCount,
                reward,
                afterPoints
            };
        }
    }),

}; 
