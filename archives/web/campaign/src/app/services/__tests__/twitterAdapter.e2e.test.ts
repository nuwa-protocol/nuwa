import * as twitterAdapter from '../twitterAdapter';
import { StandardUser, StandardTweet } from '../twitterAdapter'; // Import interfaces for type checks

// --- Test Configuration ---
const TEST_USERNAME = 'roochbot'; 

const TEST_USERNAME_NOT_FOLLOWED = '_nonexistentuser123456789_'; // Unlikely to be followed
const TEST_TWEET_ID = '1902362459039756600';
const NUWA_DEV_USERNAME = 'NuwaDev'; // Target for specific check
const TEST_USERNAME_TO_CHECK_FOLLOW = NUWA_DEV_USERNAME; // A user likely followed by TwitterDev
const API_KEY = process.env.TWITTER_API_KEY;

// Skip the entire suite if the API key is not provided
const describeIfApiKey = API_KEY ? describe : describe.skip;

describeIfApiKey('Twitter Adapter E2E Tests (Requires TWITTER_API_KEY)', () => {
    jest.setTimeout(45000); // Increase timeout for potentially multiple API calls

    beforeAll(() => {
        if (!API_KEY) {
            console.log('TWITTER_API_KEY not found in environment variables. Skipping e2e tests for twitterAdapter.');
        }
    });

    // Helper function to validate StandardUser structure
    const validateStandardUser = (user: StandardUser | null) => {
        expect(user).toBeDefined();
        if (!user) return; // Guard for TS
        expect(user.id).toBeDefined();
        expect(typeof user.id).toBe('string');
        expect(user.name).toBeDefined();
        expect(typeof user.name).toBe('string');
        expect(user.username).toBeDefined();
        expect(typeof user.username).toBe('string');
        expect(user.public_metrics).toBeDefined();
        expect(typeof user.public_metrics?.followers_count).toBe('number');
        expect(typeof user.public_metrics?.following_count).toBe('number');
        expect(typeof user.public_metrics?.tweet_count).toBe('number');
        // Check date format if present (optional) - Allow 3 or more decimal places for seconds
        if (user.created_at) {
            // expect(user.created_at).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/); // Old regex
            expect(user.created_at).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,}Z/); // Use \d{3,}
        }
        expect(typeof user.verified).toBe('boolean');
    };

    // Helper function to validate StandardTweet structure
    const validateStandardTweet = (tweet: StandardTweet | null) => {
        expect(tweet).toBeDefined();
        if (!tweet) return; // Guard for TS
        expect(tweet.id).toBeDefined();
        expect(typeof tweet.id).toBe('string');
        // expect(tweet.author_id).toBeDefined(); // Removed check for author_id
        // expect(typeof tweet.author_id).toBe('string'); // Removed check for author_id
        
        // Validate the new author object structure
        expect(tweet.author).toBeDefined();
        expect(typeof tweet.author?.id).toBe('string');
        expect(typeof tweet.author?.username).toBe('string');

        expect(tweet.text).toBeDefined();
        expect(typeof tweet.text).toBe('string');
        expect(tweet.public_metrics).toBeDefined();
        expect(typeof tweet.public_metrics?.retweet_count).toBe('number');
        expect(typeof tweet.public_metrics?.reply_count).toBe('number');
        expect(typeof tweet.public_metrics?.like_count).toBe('number');
        expect(typeof tweet.public_metrics?.impression_count).toBe('number');
        if (tweet.created_at) {
             expect(tweet.created_at).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,}Z/); // Use \d{3,}
        }
        expect(typeof tweet.possibly_sensitive).toBe('boolean');
    };

    test('getStandardUserByUsername should return user in standard format', async () => {
        const user = await twitterAdapter.getStandardUserByUsername(TEST_USERNAME);
        validateStandardUser(user);
        expect(user?.username?.toLowerCase()).toBe(TEST_USERNAME.toLowerCase());
    });

    test('getStandardTweetById should return tweet in standard format', async () => {
        const tweet = await twitterAdapter.getStandardTweetById(TEST_TWEET_ID);
        validateStandardTweet(tweet);
        expect(tweet?.id).toBe(TEST_TWEET_ID);
        // Check if author object has the correct ID (or other properties if needed)
        // expect(tweet?.author?.id).toBe(...); // Add if author ID is known and stable
    });

    test('getStandardTweetById to handle quote tweets', async () => {
        const tweet = await twitterAdapter.getStandardTweetById("1911260216320249953");
        validateStandardTweet(tweet);
        //console.log(JSON.stringify(tweet, null, 2));
        expect(tweet?.id).toBe("1911260216320249953");
        expect(tweet?.referenced_tweets).toBeDefined();
        expect(tweet?.referenced_tweets?.length).toBeGreaterThan(0);
        expect(tweet?.referenced_tweets?.[0]?.type).toBe("quoted");
        expect(tweet?.referenced_tweets?.[0]?.id).toBe("1911049162285826169");
        expect(tweet?.referenced_tweets?.[0]?.author?.username).toBe("NuwaDev");
    });

    test('getStandardTweetById to handle entities', async () => {
        const tweet = await twitterAdapter.getStandardTweetById("1911049162285826169");
        validateStandardTweet(tweet);
        //console.log(JSON.stringify(tweet, null, 2));
        expect(tweet?.id).toBe("1911049162285826169");
        expect(tweet?.entities).toBeDefined();
        expect(tweet?.entities?.urls).toBeDefined();
        expect(tweet?.entities?.urls?.length).toBeGreaterThan(0);
        expect(tweet?.entities?.urls?.[0]?.url).toBe("https://t.co/ReqSAzeedV");
        expect(tweet?.entities?.urls?.[0]?.expanded_url).toBe("https://test.nuwa.dev/");
        expect(tweet?.entities?.urls?.[0]?.display_url).toBe("test.nuwa.dev");
        expect(tweet?.entities?.mentions).toBeDefined();
        expect(tweet?.entities?.mentions?.length).toBeGreaterThan(0);
        expect(tweet?.entities?.mentions?.[0]?.id).toBe("1600777721075838977");
        expect(tweet?.entities?.mentions?.[0]?.username).toBe("RoochNetwork");
    });

    test('getStandardUserFollowers should return followers in standard format', async () => {
        const response = await twitterAdapter.getStandardUserFollowers(TEST_USERNAME);
        expect(response).toBeDefined();
        expect(response.users).toBeDefined();
        expect(Array.isArray(response.users)).toBe(true);
        expect(response.users.length).toBeGreaterThan(0);
        validateStandardUser(response.users[0]); // Validate the first user
        // Check pagination cursor (might be undefined if only one page)
        expect(response.next_cursor === undefined || typeof response.next_cursor === 'string').toBe(true);
    });

    test('getStandardUserFollowings should return followings in standard format', async () => {
        const response = await twitterAdapter.getStandardUserFollowings(TEST_USERNAME);
        expect(response).toBeDefined();
        expect(response.users).toBeDefined();
        expect(Array.isArray(response.users)).toBe(true);
        expect(response.users.length).toBeGreaterThan(0);
        validateStandardUser(response.users[0]); // Validate the first user
        expect(response.next_cursor === undefined || typeof response.next_cursor === 'string').toBe(true);
    });

    test('getStandardUserLastTweets should return tweets in standard format', async () => {
        const response = await twitterAdapter.getStandardUserLastTweets(TEST_USERNAME);
        expect(response).toBeDefined();
        expect(response.tweets).toBeDefined();
        expect(Array.isArray(response.tweets)).toBe(true);
        expect(response.tweets.length).toBeGreaterThan(0);
        validateStandardTweet(response.tweets[0]); // Validate the first tweet
        // Ensure author object is present (validated inside validateStandardTweet)
        expect(response.tweets[0].author).toBeDefined(); 
        expect(response.next_cursor === undefined || response.next_cursor === null || typeof response.next_cursor === 'string').toBe(true); // Allow null
    });

    test('getStandardUserMentions should return mentions in standard format', async () => {
        const response = await twitterAdapter.getStandardUserMentions(TEST_USERNAME);
        expect(response).toBeDefined();
        expect(response.tweets).toBeDefined();
        expect(Array.isArray(response.tweets)).toBe(true);
        if (response.tweets.length > 0) {
            validateStandardTweet(response.tweets[0]);
        }
        // expect(response.next_cursor === undefined || typeof response.next_cursor === 'string').toBe(true); // Old check
        expect(response.next_cursor === undefined || response.next_cursor === null || typeof response.next_cursor === 'string').toBe(true); // Allow null
    });

    test('getStandardTweetReplies should return replies in standard format', async () => {
        const response = await twitterAdapter.getStandardTweetReplies(TEST_TWEET_ID);
        expect(response).toBeDefined();
        expect(response.replies).toBeDefined(); // Check for 'replies' key
        expect(Array.isArray(response.replies)).toBe(true);
        if (response.replies.length > 0) {
            validateStandardTweet(response.replies[0]);
        }
        // expect(response.next_cursor === undefined || typeof response.next_cursor === 'string').toBe(true); // Old check
        expect(response.next_cursor === undefined || response.next_cursor === null || typeof response.next_cursor === 'string').toBe(true); // Allow null
    });

    test('getStandardTweetQuotes should return quotes in standard format', async () => {
        const response = await twitterAdapter.getStandardTweetQuotes(TEST_TWEET_ID);
        expect(response).toBeDefined();
        expect(response.tweets).toBeDefined(); // Check for 'tweets' key
        expect(Array.isArray(response.tweets)).toBe(true);
        if (response.tweets.length > 0) {
            validateStandardTweet(response.tweets[0]);
        }
        // expect(response.next_cursor === undefined || typeof response.next_cursor === 'string').toBe(true); // Old check
        expect(response.next_cursor === undefined || response.next_cursor === null || typeof response.next_cursor === 'string').toBe(true); // Allow null
    });

    test('getStandardTweetRetweeters should return retweeters in standard format', async () => {
        const response = await twitterAdapter.getStandardTweetRetweeters(TEST_TWEET_ID);
        expect(response).toBeDefined();
        expect(response.users).toBeDefined(); // Check for 'users' key
        expect(Array.isArray(response.users)).toBe(true);
        if (response.users.length > 0) {
            validateStandardUser(response.users[0]);
        }
        // expect(response.next_cursor === undefined || typeof response.next_cursor === 'string').toBe(true); // Old check
        expect(response.next_cursor === undefined || response.next_cursor === null || typeof response.next_cursor === 'string').toBe(true); // Allow null
    });

    test('checkUserFollowsTarget should return true if user follows target', async () => {
        // Assuming TEST_USERNAME follows TEST_USERNAME_TO_CHECK_FOLLOW
        const follows = await twitterAdapter.checkUserFollowsTarget(TEST_USERNAME, TEST_USERNAME_TO_CHECK_FOLLOW);
        expect(follows).toBe(true);
    });

    // Re-enable this test with increased timeout
    test('checkUserFollowsTarget should return false if user does not follow target', async () => {
        const follows = await twitterAdapter.checkUserFollowsTarget(TEST_USERNAME, TEST_USERNAME_NOT_FOLLOWED);
        expect(follows).toBe(false);
    }, 90000); // <-- Increased timeout to 90 seconds for this specific test
    
    test('checkUserFollowsNuwaDev should check specifically for nuwadev', async () => {
        // This test's result depends on whether TEST_USERNAME actually follows NUWA_DEV_USERNAME
        // We check the structure of the response
        const response = await twitterAdapter.checkUserFollowsNuwaDev(TEST_USERNAME);
        expect(response).toBeDefined();
        expect(typeof response.followsNuwaDev).toBe('boolean');
        expect(typeof response.message).toBe('string');
        // Example: Manually verify if needed for a known case
        // const knownUserResponse = await twitterAdapter.checkUserFollowsNuwaDev('someUserKnownToFollowNuwaDev');
        // expect(knownUserResponse.followsNuwaDev).toBe(true);
    });

}); 