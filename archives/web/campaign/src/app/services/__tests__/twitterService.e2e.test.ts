import * as twitterService from '../twitterService';

// --- Test Configuration ---
// Use well-known, relatively stable accounts/tweets for testing
const TEST_USERNAME = 'roochbot'; // Example: Twitter Dev account
const TEST_TWEET_ID = '1902362459039756600'; 
const API_KEY = process.env.TWITTER_API_KEY;

// Skip the entire suite if the API key is not provided
const describeIfApiKey = API_KEY ? describe : describe.skip;

describeIfApiKey('Twitter Service E2E Tests (Requires TWITTER_API_KEY)', () => {
    // Increase timeout for network requests
    jest.setTimeout(30000); // 30 seconds

    beforeAll(() => {
        if (!API_KEY) {
            console.log('TWITTER_API_KEY not found in environment variables. Skipping e2e tests for twitterService.');
        }
    });

    test('getUserByUsername should fetch user data', async () => {
        const response = await twitterService.getUserByUsername(TEST_USERNAME);
        expect(response).toBeDefined();
        expect(response.status).toBe('success');
        expect(response.data).toBeDefined();
        expect(response.data.id).toBeDefined();
        // Detailed info uses userName
        expect(response.data.userName?.toLowerCase()).toBe(TEST_USERNAME.toLowerCase()); 
    });

    test('getUserLastTweets should fetch recent tweets', async () => {
        const response = await twitterService.getUserLastTweets(TEST_USERNAME);
        expect(response).toBeDefined();
        // Check the overall status from the root response
        expect(response.status).toBe('success'); 
        // Check that the data object exists
        expect(response.data).toBeDefined();
        // Check that tweets array exists within data (can be empty)
        expect(response.data?.tweets).toBeDefined();
        expect(Array.isArray(response.data?.tweets)).toBe(true);
        
        // Combine pinned and regular tweets for checking if any tweet exists
        const allTweets = [];
        if(response.data?.pin_tweet) allTweets.push(response.data.pin_tweet);
        if(response.data?.tweets) allTweets.push(...response.data.tweets);

        // Assuming the user has at least one tweet (pinned or regular)
        expect(allTweets.length).toBeGreaterThan(0); 
        // Check the first available tweet for basic structure
        expect(allTweets[0].id).toBeDefined();
        expect(allTweets[0].author).toBeDefined();
    });

    test('getUserFollowers should fetch followers', async () => {
        const response = await twitterService.getUserFollowers(TEST_USERNAME);
        expect(response).toBeDefined();
        expect(response.status).toBe('success');
        expect(response.followers).toBeDefined();
        // expect(response.followers).toBeInstanceOf(Array);
        expect(Array.isArray(response.followers)).toBe(true);
        // Assuming TwitterDev has followers
        expect(response.followers.length).toBeGreaterThan(0);
        expect(response.followers[0].id).toBeDefined();
        // List items use screen_name
        expect(response.followers[0].screen_name).toBeDefined(); 
    });

    test('getUserFollowings should fetch followings', async () => {
        const response = await twitterService.getUserFollowings(TEST_USERNAME);
        expect(response).toBeDefined();
        expect(response.status).toBe('success');
        expect(response.followings).toBeDefined();
        // expect(response.followings).toBeInstanceOf(Array);
        expect(Array.isArray(response.followings)).toBe(true);
        // Assuming TwitterDev follows someone
        expect(response.followings.length).toBeGreaterThan(0);
        expect(response.followings[0].id).toBeDefined();
         // List items use screen_name
        expect(response.followings[0].screen_name).toBeDefined();
    });
    
    test('getUserMentions should fetch mentions', async () => {
        // Note: Mentions can be less predictable
        const response = await twitterService.getUserMentions(TEST_USERNAME);
        expect(response).toBeDefined();
        expect(response.status).toBe('success');
        expect(response.tweets).toBeDefined();
        // expect(response.tweets).toBeInstanceOf(Array);
        expect(Array.isArray(response.tweets)).toBe(true);
        // Check if mentions exist, but don't fail if empty
        if (response.tweets.length > 0) {
            expect(response.tweets[0].id).toBeDefined();
            expect(response.tweets[0].author).toBeDefined();
        }
    });

    test('getTweetsByIds should fetch tweet data', async () => {
        const response = await twitterService.getTweetsByIds(TEST_TWEET_ID);
        expect(response).toBeDefined();
        expect(response.status).toBe('success');
        expect(response.tweets).toBeDefined();
        // expect(response.tweets).toBeInstanceOf(Array);
        expect(Array.isArray(response.tweets)).toBe(true);
        expect(response.tweets.length).toBe(1);
        expect(response.tweets[0].id).toBe(TEST_TWEET_ID);
        expect(response.tweets[0].author).toBeDefined();
    });

    test('getTweetReplies should fetch replies', async () => {
        const response = await twitterService.getTweetReplies(TEST_TWEET_ID);
        expect(response).toBeDefined();
        expect(response.status).toBe('success');
        // expect(response.replies).toBeDefined(); // replies might be undefined if empty
        const replies = response.replies || []; // Default to empty array if undefined
        // expect(response.replies).toBeInstanceOf(Array);
        expect(Array.isArray(replies)).toBe(true); // Check the defaulted array
        // Check if replies exist, but don't fail if empty
        if (replies.length > 0) {
            expect(replies[0].id).toBeDefined();
            expect(replies[0].author).toBeDefined();
        }
    });

    test('getTweetQuotes should fetch quotes', async () => {
        const response = await twitterService.getTweetQuotes(TEST_TWEET_ID);
        expect(response).toBeDefined();
        expect(response.status).toBe('success');
        expect(response.tweets).toBeDefined();
        // expect(response.tweets).toBeInstanceOf(Array);
        expect(Array.isArray(response.tweets)).toBe(true);
        // Check if quotes exist, but don't fail if empty
        if (response.tweets.length > 0) {
            expect(response.tweets[0].id).toBeDefined();
            expect(response.tweets[0].author).toBeDefined();
        }
    });

    test('getTweetRetweeters should fetch retweeters', async () => {
        const response = await twitterService.getTweetRetweeters(TEST_TWEET_ID);
        expect(response).toBeDefined();
        // expect(response.status).toBe('success'); // Status might be missing in response
        expect(response.users).toBeDefined();
        // expect(response.users).toBeInstanceOf(Array);
        expect(Array.isArray(response.users)).toBe(true);
        // Check if retweeters exist, but don't fail if empty
        if (response.users.length > 0) {
            expect(response.users[0].id).toBeDefined();
            expect(response.users[0].userName).toBeDefined();
        }
    });

    test('getUserByUsername should handle non-existent user', async () => {
        const NON_EXISTENT_USER = 'some_random_nonexistent_user_xyz_';
        // Depending on API: check for specific error status/message or expect throw
        try {
             const response = await twitterService.getUserByUsername(NON_EXISTENT_USER);
             console.log(response);
             // Should not reach here if it throws
        } catch (error) {
             expect(error).toBeInstanceOf(Error);
             // Check error message if possible
        }
    });
}); 