import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { StandardTweet } from '@/app/services/twitterAdapter';
/**
 * Schema for the tweet scoring result.
 */
export const tweetScoreSchema = z.object({
    reasoning: z.string().describe("A brief explanation of why this score was given, based on the criteria."),
    content_score: z.number().min(0).describe("Portion of score based on content quality (0-50).")
}).transform(data => {
    // Return the data with the calculated engagement_score and total score
    return {
        ...data,
        engagement_score: 0, // Placeholder, will be replaced with algorithmically calculated value
        score: 0 // Placeholder, will be calculated after AI response
    };
});

/**
 * Type definition for the tweet scoring result.
 */
export type TweetScoreResult = z.infer<typeof tweetScoreSchema>;

/**
 * Calculates the engagement score for a tweet based on industry benchmarks.
 * Uses weighted interactions relative to impressions or followers.
 * 
 * @param metrics The metrics object containing likes, retweets, replies, etc.
 * @param createdAt Optional creation date to calculate tweet age
 * @returns A number between 0-50 representing the engagement score
 */
export function calculateEngagementScore(
    metrics: {
        likes: number;
        retweets: number;
        replies: number;
        quotes?: number;
        impressions?: number;
        followers?: number;
    },
    createdAt?: string
): number {
    // Calculate weighted interactions
    // Weights: retweets(3x), quotes(2.5x), replies(2x), likes(1x)
    const weightedInteractions = 
        metrics.likes * 1.0 + 
        metrics.retweets * 3.0 + 
        metrics.replies * 2.0 + 
        (metrics.quotes || 0) * 2.5;
    
    // Use impressions as denominator (fall back to followers if needed)
    const denominator = metrics.impressions ?? 
                        metrics.followers ?? 1;
    
    // Calculate weighted engagement rate
    const engagementRate = (weightedInteractions / denominator) * 100;
    
    // Calculate tweet age in hours (if creation time available)
    let tweetAgeHours = 24; // Default to 24 hours
    if (createdAt) {
        const tweetDate = new Date(createdAt);
        const now = new Date();
        tweetAgeHours = (now.getTime() - tweetDate.getTime()) / (1000 * 60 * 60);
    }
    
    // Helper function to scale values within a range to another range
    function scale(val: number, min: number, max: number, outMin: number, outMax: number) {
        return Math.min(outMax, 
               Math.max(outMin, ((val-min)/(max-min))*(outMax-outMin)+outMin));
    }
    
    // Determine engagement score based on engagement rate thresholds
    // Industry benchmarks: median ER ≈ 0.015-0.03%, top 5% accounts ER ≈ 0.3-0.8%
    let engagementScore: number;
    
    if (engagementRate >= 0.60) {          // ≥0.60% (Exceptional)
        engagementScore = 41 + scale(engagementRate, 0.60, 1.5, 0, 9); // Max 50
    } else if (engagementRate >= 0.30) {   // 0.30-0.59% (Very High)
        engagementScore = 31 + scale(engagementRate, 0.30, 0.59, 0, 9);
    } else if (engagementRate >= 0.12) {   // 0.12-0.29% (High)
        engagementScore = 21 + scale(engagementRate, 0.12, 0.29, 0, 9);
    } else if (engagementRate >= 0.05) {   // 0.05-0.11% (Medium)
        engagementScore = 11 + scale(engagementRate, 0.05, 0.11, 0, 9);
    } else {                               // ≤0.04% (Low) or New Tweet
        engagementScore = tweetAgeHours < 1 ? 8 : 5 + scale(engagementRate, 0, 0.04, 0, 5);
    }
    
    // Optional: Apply time decay for older tweets
    // const timeDecayFactor = Math.exp(-tweetAgeHours / 24);
    // engagementScore = engagementScore * timeDecayFactor;
    
    // Log details for debugging
    console.log(
        "Engagement Calculation:",
        "Weighted Interactions:", weightedInteractions.toFixed(1),
        "Engagement Rate:", engagementRate.toFixed(4) + "%", 
        "Tweet Age:", tweetAgeHours.toFixed(1) + "h",
        "Score:", engagementScore.toFixed(2)
    );
    
    return engagementScore;
}

/**
 * Scores a tweet based on provided data and predefined criteria using an AI model.
 * Content score is evaluated only once, while engagement score can be recalculated.
 * 
 * @param tweetData The StandardTweet object to be scored.
 * @returns A promise that resolves to an object containing the score and reasoning.
 * @throws Throws an error if the AI model fails to generate the score object.
 */
export async function assessTweetScore(
    tweetData: StandardTweet
): Promise<TweetScoreResult> {
    
    // --- Refined Scoring Criteria (0-50 points for content quality) ---
    const scoringCriteria = `
    1.  **Core Theme Relevance (Nuwa or AI) (0-25 points):** 
        - Extended discussion of Nuwa or AI with specific applications, technical details, or use cases: assign 20 to 25 points
        - Clear discussion of both Nuwa and AI with some details: assign 15 to 19 points
        - Simple mention of Nuwa AI in relevant context: assign 8 to 14 points
        - Brief or passing mention of either Nuwa or AI: assign 1 to 7 points
        - No mention of Nuwa or AI: assign 0 points
        
    2.  **Depth and Novelty (0-15 points):** 
        - Detailed explanation with examples, data, or technical insights (typically longer content): assign 12 to 15 points
        - Explains concepts with supporting details OR provides unique insights/perspectives: assign 8 to 11 points          
        - Mentions specific benefits/features without elaboration OR uses creative expression (metaphor, humor, etc.): assign 4 to 7 points
        - General statements without specifics: assign 0 to 3 points
        
        Note: While detailed content often scores higher, short content with exceptional creativity, unique insights, or emotional impact can also score in the 8-12 point range. Evaluate based on the value provided, not just length.
        
    3.  **Clarity and Quality (0-7 points):** 
        - Exceptionally well-structured with excellent flow (typically longer content): assign 6 to 7 points
        - Clear, error-free content: assign 4 to 5 points
        - Generally understandable with minor issues: assign 2 to 3 points
        - Unclear or with significant errors: assign 0 to 1 points
        
        Note: Both short and long content can score well here if clearly written.
        
    4.  **Content Uniqueness / Non-Templated (0-3 points):** 
        - Original insights or perspective not commonly seen: assign 2 to 3 points
        - Standard but personally expressed thoughts: assign 1 point
        - Generic or templated content: assign 0 points
        
        Note: Originality can be demonstrated in both short and long content.
    
    Important Scoring Instructions:
    - When you see "assign X to Y points", you should choose a specific score within that range. For example, "assign 20 to 25 points" means you should pick a specific value like 21, 22, 23, etc.
    - Each criterion has its own maximum. 
    - Always use your judgment to determine where in each range a specific tweet falls.
    - Consider both length AND quality - shorter content with high creativity, unique perspectives, or emotional impact can score as well as longer detailed content.
    
    The total content score is the sum of points from criteria 1-4 (max 50).
    ALWAYS provide a numerical score for EACH criterion (1-4).
    
    CONTENT LENGTH GUIDELINES:
    - Short, relevant tweets (1-2 sentences) with high creativity or unique perspective should receive a content_score of 15 to 30 points out of 50 if well-executed.
    - Medium-length tweets (3-5 sentences with some details) should receive a content_score of 25 to 35 points out of 50 if relevant and well-written.
    - Long, detailed tweets (6+ sentences with specific insights or technical details) should receive a content_score of 35 to 50 points out of 50 if highly relevant and well-structured.
    `;
    // --- End of Scoring Criteria Definition ---

    try {
        // Extract current engagement metrics
        const currentMetrics = {
            likes: tweetData.public_metrics?.like_count || 0,
            retweets: tweetData.public_metrics?.retweet_count || 0,
            replies: tweetData.public_metrics?.reply_count || 0,
            quotes: tweetData.public_metrics?.quote_count || 0,
            impressions: tweetData.public_metrics?.impression_count,
            followers: tweetData.author?.public_metrics?.followers_count
        };
        
        // Calculate engagement score using the dedicated function
        const engagementScore = calculateEngagementScore(currentMetrics, tweetData.created_at);
        
        // Get raw interaction total for reference
        const totalInteractions = currentMetrics.likes + currentMetrics.retweets + 
                                  currentMetrics.replies + (currentMetrics.quotes || 0);
        
        console.log(
            "Score Calculation Details - ",
            "Tweet ID:", tweetData.id,
            "Total Interactions:", totalInteractions,
            "Engagement Score:", engagementScore.toFixed(2)
        );
        
        const { object: scoreResult } = await generateObject({
            model: openai('gpt-4o-mini'),
            schema: tweetScoreSchema,
            prompt: `Please analyze and score the content quality of the following tweet based *strictly* on the provided criteria. 

            **Scoring Criteria:**
            ${scoringCriteria}

            **Tweet Data (JSON):**
            \`\`\`json
            ${JSON.stringify(tweetData, null, 2)}
            \`\`\`

            Your response MUST include:
            1. reasoning: A brief explanation of your content quality scoring rationale
            2. content_score: The portion of score based on content quality (max 50 points)
            
            Focus ONLY on content quality, NOT on any engagement metrics (likes, retweets, etc.).
            
            Remember to consider the content length guidelines when determining your final content_score.
            `
        });

        //finalize the score to ensure it falls within the expected range
        if (!scoreResult) {
            throw new Error("Failed to generate score object from AI model.");
        }
        if (scoreResult.content_score < 0){   
            console.warn("Content score is less than 0, which is unexpected.");
            scoreResult.content_score = 0;
        }
        if (scoreResult.content_score > 50){   
            console.warn("Content score exceeds 50, which is unexpected.");
            scoreResult.content_score = 50;
        }
        
        // Now use our algorithmically calculated engagement score
        scoreResult.engagement_score = engagementScore;
        
        // Calculate the total score (content + engagement)
        scoreResult.score = Math.min(scoreResult.content_score + scoreResult.engagement_score, 100);

        console.log("Final Scores - Content:", scoreResult.content_score, "Engagement:", scoreResult.engagement_score, "Total:", scoreResult.score);
        
        return scoreResult;

    } catch (error) {
        console.error("Error generating tweet score:", error);
        throw new Error(`Failed to get tweet score from AI model: ${error instanceof Error ? error.message : String(error)}`);
    }
} 