import { assessTweetScore } from '../scoring-agent';
import * as twitterAdapter from '../../../services/twitterAdapter';
import { StandardTweet, StandardTweetAuthor, StandardTweetPublicMetrics } from '../../../services/twitterAdapter';

// --- Test Configuration ---
// Use a well-known, stable tweet for testing
const TEST_TWEET_ID = '1907434345666953712'; // Use a known tweet ID
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Skip tests if OpenAI API key is not provided
const describeIfApiKey = OPENAI_API_KEY ? describe : describe.skip;

// Factory function to create mock tweet data
function createMockTweet(
  id: string,
  text: string,
  metrics: Partial<StandardTweetPublicMetrics> = {},
  followers_count: number = 1000 // Default follower count
): StandardTweet {
  const author: StandardTweetAuthor = {
    id: '123456789',
    username: 'test_user',
    public_metrics: {
      followers_count: followers_count,
      following_count: 500,
      tweet_count: 1200,
      listed_count: 10
    }
  };

  const defaultMetrics: StandardTweetPublicMetrics = {
    retweet_count: 0,
    reply_count: 0,
    like_count: 0,
    quote_count: 0,
    bookmark_count: 0,
    impression_count: 0,
  };

  return {
    id,
    text,
    author,
    public_metrics: { ...defaultMetrics, ...metrics },
    created_at: new Date().toISOString(),
  };
}

describeIfApiKey('Tweet Scoring Agent E2E Tests (Requires OPENAI_API_KEY)', () => {
    // Increase timeout for API calls to OpenAI and Twitter
    jest.setTimeout(60000); // 60 seconds

    beforeAll(() => {
        if (!OPENAI_API_KEY) {
            console.log('OPENAI_API_KEY not found in environment variables. Skipping e2e tests for scoring agent.');
        }
    });

    test('assessTweetScore should score a real tweet', async () => {
        // Fetch a tweet to score
        const tweet = await twitterAdapter.getStandardTweetById(TEST_TWEET_ID);
        expect(tweet).toBeDefined();
        
        if (tweet) {
            // Score the tweet
            const scoreResult = await assessTweetScore(tweet);
            // Log the result for manual inspection
            console.log(`Tweet scoring result: ` + JSON.stringify(scoreResult));

            expect(scoreResult).toBeDefined();
            expect(scoreResult.score).toBeDefined();
            expect(typeof scoreResult.score).toBe('number');
            expect(scoreResult.score).toBeGreaterThanOrEqual(0);
            expect(scoreResult.score).toBeLessThanOrEqual(100);
            expect(scoreResult.reasoning).toBeDefined();
            expect(typeof scoreResult.reasoning).toBe('string');
            expect(scoreResult.reasoning.length).toBeGreaterThan(0);

            const scoreResult2 = await assessTweetScore(tweet);
            console.log(`Tweet scoring result2: ` + JSON.stringify(scoreResult2));
            expect(Math.abs(scoreResult.content_score - scoreResult2.content_score)).toBeLessThan(5);
            
        }
    });
    
    test('assessTweetScore handles errors gracefully', async () => {
        // Test with invalid data
        const invalidTweet = { id: '123', text: '' } as StandardTweet; // Minimal invalid tweet
        
        try {
            await assessTweetScore(invalidTweet);
            // If it doesn't throw, it should still return a score object
        } catch (error) {
            expect(error).toBeDefined(); 
            // If it throws, that's also acceptable behavior
        }
    });

    test('assessTweetScore should give higher score to tweets about Nuwa and AI', async () => {
        // Create a high-quality tweet about Nuwa and AI
        const highQualityTweet = createMockTweet(
            'mock123',
            'Nuwa is revolutionizing AI technology by providing personalized AI assistants. The deep learning models they use offer unprecedented accuracy and understanding, making AI more accessible and useful for everyday tasks!',
            { like_count: 10, retweet_count: 5, reply_count: 3 }
        );

        // Create a tweet that doesn't mention Nuwa or AI
        const irrelevantTweet = createMockTweet(
            'mock456',
            'Just had a great cup of coffee this morning! The weather is beautiful today.',
            { like_count: 10, retweet_count: 5, reply_count: 3 }
        );

        // Score both tweets
        const highQualityScore = await assessTweetScore(highQualityTweet);
        const irrelevantScore = await assessTweetScore(irrelevantTweet);

        // Log the results
        console.log(`Nuwa AI Tweet Score: ` + JSON.stringify(highQualityScore));
        console.log(`Irrelevant Tweet Score: ` + JSON.stringify(irrelevantScore));

        // Verify that the tweet about Nuwa and AI scores higher
        expect(highQualityScore.score).toBeGreaterThan(irrelevantScore.score);
        expect(highQualityScore.content_score).toBeGreaterThan(irrelevantScore.content_score);
        
        
    });
    
    test('assessTweetScore should consider followers count for engagement calculation', async () => {
        // Create a tweet with low follower count (high engagement rate)
        const lowFollowersTweet = createMockTweet(
            'mock555',
            'Nuwa AI technology is incredibly advanced and helpful for developers!',
            { like_count: 20, retweet_count: 10, reply_count: 5 },
            200 // Only 200 followers, but relatively high engagement
        );
        
        // Create a tweet with high follower count (low engagement rate)
        const highFollowersTweet = createMockTweet(
            'mock666',
            'Nuwa AI technology is incredibly advanced and helpful for developers!',
            { like_count: 30, retweet_count: 15, reply_count: 7 },
            5000 // 5000 followers, but relatively low engagement rate
        );
        
        // Score both tweets
        const lowFollowersScore = await assessTweetScore(lowFollowersTweet);
        const highFollowersScore = await assessTweetScore(highFollowersTweet);

        console.log(`Low Followers Tweet Score: ` + JSON.stringify(lowFollowersScore));
        console.log(`High Followers Tweet Score: ` + JSON.stringify(highFollowersScore));
         // Log the results
        //console.log(`Low Followers Tweet (200): Engagement Score: ${lowFollowersScore.engagement_score}/50, Engagement Rate: ${(20+10+5)/200*100}%`);
        //console.log(`High Followers Tweet (5000): Engagement Score: ${highFollowersScore.engagement_score}/50, Engagement Rate: ${(30+15+7)/5000*100}%`);
        
        // Verify that the tweet with fewer followers but higher engagement rate gets a higher engagement score
        // Note: Content scores should be similar since the text content is the same
        expect(lowFollowersScore.engagement_score).toBeGreaterThan(highFollowersScore.engagement_score);
        expect(Math.abs(lowFollowersScore.content_score - highFollowersScore.content_score)).toBeLessThan(5); // Content scores should be close
       
    });
});
