import { getProfileScore } from '../profile-scoring-agent';
import * as twitterAdapter from '../../../services/twitterAdapter';

// --- Test Configuration ---
// Use a well-known, stable account for testing
const TEST_USERNAME = 'jolestar'; 
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Skip tests if OpenAI API key is not provided
const describeIfApiKey = OPENAI_API_KEY ? describe : describe.skip;

describeIfApiKey('Profile Scoring Agent E2E Tests (Requires OPENAI_API_KEY)', () => {
    // Increase timeout for API calls to OpenAI and Twitter
    jest.setTimeout(60000); // 60 seconds

    beforeAll(() => {
        if (!OPENAI_API_KEY) {
            console.log('OPENAI_API_KEY not found in environment variables. Skipping e2e tests for profile scoring agent.');
        }
    });

    test.only('getProfileScore should score a user profile with tweets', async () => {
        // Fetch a user profile to score
        const userProfile = await twitterAdapter.getStandardUserByUsername(TEST_USERNAME);
        expect(userProfile).toBeDefined();
        console.log(`User profile: ${JSON.stringify(userProfile)}`);
        // Fetch recent tweets (optional)
        const tweetResult = await twitterAdapter.getStandardUserLastOriginalTweets(TEST_USERNAME, undefined, 35);
        const recentTweets = tweetResult.tweets;

        console.log(`Recent tweets: ${JSON.stringify(recentTweets)}`);
        console.log(`Number of recent tweets: ${recentTweets.length}`);
        
        // Create profile data for scoring
        const profileData = {
            ...userProfile,
            recent_tweets: recentTweets
        };
        
        // Score the profile
        const scoreResult = await getProfileScore(profileData);

        // Log the result for manual inspection
        console.log(`Profile scoring result: ${scoreResult.score}/100`);
        console.log(`Reasoning: ${scoreResult.reasoning}`);
        console.log(`Summary: ${scoreResult.summary}`);

        expect(scoreResult).toBeDefined();
        expect(scoreResult.score).toBeDefined();
        expect(typeof scoreResult.score).toBe('number');
        expect(scoreResult.score).toBeGreaterThanOrEqual(0);
        expect(scoreResult.score).toBeLessThanOrEqual(100);
        expect(scoreResult.reasoning).toBeDefined();
        expect(typeof scoreResult.reasoning).toBe('string');
        expect(scoreResult.reasoning.length).toBeGreaterThan(0);

        const scoreResult2 = await getProfileScore(profileData);
        console.log(`Profile scoring result2: ${scoreResult2.score}/100`);
        console.log(`Reasoning: ${scoreResult2.reasoning}`);
        expect(Math.abs(scoreResult.score - scoreResult2.score)).toBeLessThan(5);
        
    });
    
    test('getProfileScore works with minimal profile data (no tweets)', async () => {
        // Test with just basic profile info, no tweets
        const userProfile = await twitterAdapter.getStandardUserByUsername(TEST_USERNAME);
        console.log(`User profile: ${JSON.stringify(userProfile)}`);
         // Create profile data for scoring
        const profileData = {
            ...userProfile,
            recent_tweets: []   // No tweets
        };
        // Score with minimal data
        const scoreResult = await getProfileScore(profileData);
        // Log the result for comparison
        console.log(`Minimal profile scoring result: ${scoreResult.score}/100`);
        console.log(`Reasoning: ${scoreResult.reasoning}`);

        expect(scoreResult).toBeDefined();
        expect(scoreResult.score).toBeDefined();
        expect(typeof scoreResult.score).toBe('number');
        expect(scoreResult.score).toBeGreaterThanOrEqual(0);
        expect(scoreResult.score).toBeLessThanOrEqual(100);
        
        
    });
    
    test('getProfileScore handles errors gracefully', async () => {
        // Test with invalid data
        const invalidProfile = { handle: 'test', name: 'Test User' }; // Minimal invalid profile
        
        try {
            await getProfileScore(invalidProfile);
            // If it doesn't throw, it should still return a score object
        } catch (error) {
            expect(error).toBeDefined();
            // If it throws, that's also acceptable behavior
        }
    });
});
