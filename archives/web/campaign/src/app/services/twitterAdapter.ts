/**
 * Twitter Adapter Module
 * 
 * This module adapts the data received from twitterService (which interacts with the specific, potentially non-standard API)
 * into a more standardized format, potentially aligning closer to official Twitter API v2 structures or simply providing
 * a cleaner, simplified interface for consumers like AI tools.
 */

import * as twitterService from './twitterService';

// --- Standardized/Simplified Data Structures ---

export interface StandardUserPublicMetrics {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number; // Note: May not be available in underlying service
}

export interface StandardUser {
    id: string;
    name: string; // Display name
    username: string; // Screen name / handle (e.g., @username)
    created_at?: string; // ISO 8601 format preferred
    description?: string;
    location?: string;
    profile_image_url?: string;
    protected?: boolean;
    public_metrics?: StandardUserPublicMetrics;
    url?: string; // User's website URL from bio entities
    verified?: boolean; // Consolidated verification status
}

export interface StandardTweetPublicMetrics {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count: number; // Note: Provided as 0 in examples, might not be accurate
    impression_count: number; // viewCount
}

export interface StandardTweetMentionEntity {
    id: string; // User ID
    username: string;
}

export interface StandardTweetUrlEntity {
    url: string; // t.co URL
    expanded_url: string;
    display_url: string;
}

export interface StandardTweetHashtagEntity {
    tag: string;
}

export interface StandardTweetEntities {
    mentions?: StandardTweetMentionEntity[];
    urls?: StandardTweetUrlEntity[];
    hashtags?: StandardTweetHashtagEntity[];
}

export interface StandardReferencedTweet {
    type: 'retweeted' | 'quoted' | 'replied_to';
    id: string;
    author?: StandardTweetAuthor;
}

// New structure for embedding author info directly in the tweet
export interface StandardTweetAuthor {
    id: string;
    username: string;
    public_metrics?: StandardUserPublicMetrics;
}

export interface StandardTweet {
    id: string;
    text: string;
    author: StandardTweetAuthor; // Use the new author structure
    conversation_id?: string;
    created_at?: string; // ISO 8601 format preferred
    entities?: StandardTweetEntities;
    in_reply_to_user_id?: string;
    lang?: string;
    public_metrics?: StandardTweetPublicMetrics;
    possibly_sensitive?: boolean;
    referenced_tweets?: StandardReferencedTweet[];
    source?: string; 
}

// --- Conversion Functions ---

/**
 * Converts the detailed user info from twitterService into StandardUser format.
 */
function convertToStandardUserDetailed(user: twitterService.TwitterUserInfoDetailed | null | undefined): StandardUser | null {
    if (!user) return null;

    const username = user.userName; // Detailed uses userName
    if (!username) {
        console.warn("Detailed User object missing userName, cannot create StandardUser:", user);
        return null;
    }

    const metrics: StandardUserPublicMetrics = {
        followers_count: user.followers ?? 0,
        following_count: user.following ?? 0,
        tweet_count: user.statusesCount ?? 0,
        listed_count: 0 // Placeholder
    };

    let websiteUrl: string | undefined;
    if (user.profile_bio?.entities?.url?.urls?.[0]) {
        websiteUrl = user.profile_bio.entities.url.urls[0].expanded_url;
    }

    const standardCreatedAt: string | undefined = user.createdAt; // Use const as it's not reassigned

    return {
        id: user.id,
        name: user.name,
        username: username,
        created_at: standardCreatedAt,
        description: user.description,
        location: user.location,
        profile_image_url: user.profilePicture,
        protected: user.protected ?? false,
        public_metrics: metrics,
        url: websiteUrl,
        verified: user.isBlueVerified ?? false, // Detailed uses isBlueVerified
    };
}

/**
 * Converts the list item user info (snake_case) from twitterService into StandardUser format.
 * Used for followers/followings.
 */
function convertToStandardUserListItem(user: twitterService.TwitterUserListItem | null | undefined): StandardUser | null {
    if (!user) return null;

    const username = user.screen_name; // List item uses screen_name (snake_case)
    if (!username) {
        console.warn("List Item User object missing screen_name, cannot create StandardUser:", user);
        return null;
    }

    const metrics: StandardUserPublicMetrics = {
        followers_count: user.followers_count ?? 0,
        following_count: user.following_count ?? user.friends_count ?? 0, 
        tweet_count: user.statuses_count ?? 0,
        listed_count: 0 // Placeholder
    };

    let standardCreatedAt: string | undefined;
    if (user.created_at) { // List item uses created_at (Twitter format)
        try {
            standardCreatedAt = new Date(user.created_at).toISOString();
        } catch (e) {
            console.warn(`Failed to parse date string: ${user.created_at}`, e);
            standardCreatedAt = user.created_at; // Fallback
        }
    }

    return {
        id: user.id,
        name: user.name,
        username: username,
        created_at: standardCreatedAt,
        description: user.description,
        location: user.location,
        profile_image_url: user.profile_image_url_https, // List item uses profile_image_url_https
        protected: user.protected ?? false,
        public_metrics: metrics,
        url: user.url ?? undefined, // Convert null to undefined
        verified: user.verified ?? false, // List item uses verified
    };
}

/**
 * Converts the retweeter user info (camelCase) from twitterService into StandardUser format.
 * Used for retweeters.
 */
function convertToStandardRetweeterUser(user: twitterService.TwitterRetweeterUser | null | undefined): StandardUser | null {
    if (!user) return null;

    const username = user.userName; // Retweeter uses userName (camelCase)
    if (!username) {
        console.warn("Retweeter User object missing userName, cannot create StandardUser:", user);
        return null;
    }

    const metrics: StandardUserPublicMetrics = {
        followers_count: user.followers ?? 0, // Retweeter uses followers
        following_count: user.following ?? 0, // Retweeter uses following
        tweet_count: user.statusesCount ?? 0, // Retweeter uses statusesCount
        listed_count: 0 // Placeholder
    };

    const standardCreatedAt: string | undefined = user.createdAt; // Use const

    return {
        id: user.id,
        name: user.name,
        username: username,
        created_at: standardCreatedAt,
        description: user.description,
        location: user.location,
        profile_image_url: user.profilePicture, // Retweeter uses profilePicture
        protected: user.protected ?? false,
        public_metrics: metrics,
        url: user.url ?? undefined, // Convert null to undefined
        verified: user.verified ?? false, // Retweeter uses verified
    };
}

/**
 * Converts the detailed tweet info from twitterService into StandardTweet format.
 */
function convertToStandardDetailedTweet(tweet: twitterService.TweetDetailed | null | undefined): StandardTweet | null {
    if (!tweet) return null;

    const standardAuthor = convertToStandardUserDetailed(tweet.author);

    if (!standardAuthor) {
        console.warn("[Detailed] Could not convert author within tweet, skipping conversion:", tweet.id);
        return null;
    }

    const tweetAuthor: StandardTweetAuthor = {
        id: standardAuthor.id,
        username: standardAuthor.username,
        public_metrics: standardAuthor.public_metrics,
    };

    const metrics: StandardTweetPublicMetrics = {
        retweet_count: tweet.retweetCount ?? 0,
        reply_count: tweet.replyCount ?? 0,
        like_count: tweet.likeCount ?? 0,
        quote_count: tweet.quoteCount ?? 0,
        bookmark_count: tweet.bookmarkCount ?? 0,
        impression_count: tweet.viewCount ?? 0,
    };

    const entities: StandardTweetEntities = {};
    // Detailed tweets use the unified TweetEntities structure now
    if (tweet.entities && typeof tweet.entities === 'object') {
        const detailedEntities = tweet.entities as twitterService.TweetEntities; 
        if (detailedEntities.user_mentions?.length) {
            entities.mentions = detailedEntities.user_mentions.map((m) => ({ id: m.id_str, username: m.screen_name }));
        }
        if (detailedEntities.urls?.length) {
            entities.urls = detailedEntities.urls.map((u) => ({ url: u.url, expanded_url: u.expanded_url, display_url: u.display_url }));
        }
        if (detailedEntities.hashtags?.length) {
            entities.hashtags = detailedEntities.hashtags.map((h) => ({ tag: h.text }));
        }
        // Could add symbols here too if needed: entities.symbols = detailedEntities.symbols.map(...);
    }

    const referenced_tweets: StandardReferencedTweet[] = [];
    if (tweet.isReply && tweet.inReplyToId) {
        referenced_tweets.push({ type: 'replied_to', id: tweet.inReplyToId });
    }
    if (tweet.isQuote && tweet.quoted_tweet?.id) {
        let referencedAuthor: StandardTweetAuthor | undefined = undefined;
        if (tweet.quoted_tweet.author) { 
            const convertedAuthor = convertToStandardUserDetailed(tweet.quoted_tweet.author);
            if(convertedAuthor) {
                referencedAuthor = { id: convertedAuthor.id, username: convertedAuthor.username, public_metrics: convertedAuthor.public_metrics };
            }
        }
        referenced_tweets.push({ type: 'quoted', id: tweet.quoted_tweet.id, author: referencedAuthor });
    }
    if (tweet.isRetweet && tweet.retweeted_tweet?.id) {
         let referencedAuthor: StandardTweetAuthor | undefined = undefined;
        if (tweet.retweeted_tweet.author) { 
            const convertedAuthor = convertToStandardUserDetailed(tweet.retweeted_tweet.author);
            if(convertedAuthor) {
                referencedAuthor = { id: convertedAuthor.id, username: convertedAuthor.username, public_metrics: convertedAuthor.public_metrics };
            }
        }
        referenced_tweets.push({ type: 'retweeted', id: tweet.retweeted_tweet.id, author: referencedAuthor });
    }

    let standardCreatedAt: string | undefined;
    if (tweet.createdAt) { // Handle Twitter date format
        try { standardCreatedAt = new Date(tweet.createdAt).toISOString(); } catch (e) {
            console.warn(`[Detailed] Failed to parse date string: ${tweet.createdAt}`, e); standardCreatedAt = tweet.createdAt;
        }
    }

    return {
        id: tweet.id,
        text: tweet.text,
        author: tweetAuthor, 
        conversation_id: tweet.conversationId,
        created_at: standardCreatedAt,
        entities: Object.keys(entities).length > 0 ? entities : undefined,
        in_reply_to_user_id: tweet.inReplyToUserId ?? undefined,
        lang: tweet.lang,
        public_metrics: metrics,
        possibly_sensitive: tweet.possiblySensitive ?? false, 
        referenced_tweets: referenced_tweets.length > 0 ? referenced_tweets : undefined,
        source: tweet.source,
    };
}

/**
 * Converts the mention/reply/quote tweet info (TweetMention) from twitterService into StandardTweet format.
 */
function convertToStandardMentionTweet(tweet: twitterService.TweetMention | null | undefined): StandardTweet | null {
    if (!tweet) return null;

    // Mention tweet author is now expected to be Detailed based on example
    const standardAuthor = convertToStandardUserDetailed(tweet.author);
    
    if (!standardAuthor) {
        console.warn("[Mention] Could not convert author within tweet, skipping conversion:", tweet.id);
        return null;
    }
    const tweetAuthor: StandardTweetAuthor = {
        id: standardAuthor.id,
        username: standardAuthor.username,
        public_metrics: standardAuthor.public_metrics,
    };

    const metrics: StandardTweetPublicMetrics = {
        retweet_count: tweet.retweetCount ?? 0,
        reply_count: tweet.replyCount ?? 0,
        like_count: tweet.likeCount ?? 0,
        quote_count: tweet.quoteCount ?? 0,
        bookmark_count: tweet.bookmarkCount ?? 0, 
        impression_count: tweet.viewCount ?? 0,
    };

    const entities: StandardTweetEntities = {};
    // Mention tweets use the unified TweetEntities structure now
    if (tweet.entities && typeof tweet.entities === 'object') {
        const mentionEntities = tweet.entities as twitterService.TweetEntities;
        if (mentionEntities.user_mentions?.length) {
            entities.mentions = mentionEntities.user_mentions.map((m) => ({ id: m.id_str, username: m.screen_name }));
        }
        if (mentionEntities.urls?.length) {
            entities.urls = mentionEntities.urls.map((u) => ({ url: u.url, expanded_url: u.expanded_url, display_url: u.display_url }));
        }
        if (mentionEntities.hashtags?.length) {
            entities.hashtags = mentionEntities.hashtags.map((h) => ({ tag: h.text }));
        }
         // Could add symbols here too if needed: entities.symbols = mentionEntities.symbols.map(...);
    }

    const referenced_tweets: StandardReferencedTweet[] = [];
    if (tweet.isReply && tweet.inReplyToId) {
        referenced_tweets.push({ type: 'replied_to', id: tweet.inReplyToId }); // No author info
    }
    // Mention tweet's referenced tweets are stubs (only ID)
    if (tweet.isQuote && tweet.quoted_tweet?.id) {
        referenced_tweets.push({ type: 'quoted', id: tweet.quoted_tweet.id }); // No author info
    }
    if (tweet.isRetweet && tweet.retweeted_tweet?.id) {
        referenced_tweets.push({ type: 'retweeted', id: tweet.retweeted_tweet.id }); // No author info
    }

    let standardCreatedAt: string | undefined;
    if (tweet.createdAt) { // Handle Twitter date format
        try { standardCreatedAt = new Date(tweet.createdAt).toISOString(); } catch (e) {
            console.warn(`[Mention] Failed to parse date string: ${tweet.createdAt}`, e); standardCreatedAt = tweet.createdAt;
        }
    }

    return {
        id: tweet.id,
        text: tweet.text,
        author: tweetAuthor, 
        conversation_id: tweet.conversationId,
        created_at: standardCreatedAt,
        entities: Object.keys(entities).length > 0 ? entities : undefined,
        in_reply_to_user_id: tweet.inReplyToUserId ?? undefined,
        lang: tweet.lang,
        public_metrics: metrics,
        possibly_sensitive: tweet.possiblySensitive ?? false, 
        referenced_tweets: referenced_tweets.length > 0 ? referenced_tweets : undefined,
        source: tweet.source,
    };
}

// --- Exported Adapter Functions --- Updated calls & Return Types --- 

/**
 * Gets information about multiple Twitter users by their IDs, adapted to StandardUser format.
 */
export async function getStandardUsersByIds(userIds: string): Promise<{ users: StandardUser[] }> {
    try {
        const response = await twitterService.batchGetUsers(userIds);
        // response.users contains TwitterUserInfoDetailed[]
        const standardUsers = (response.users || [])
            .map(convertToStandardUserDetailed) // Use Detailed converter
            .filter((u): u is StandardUser => u !== null);
        return { users: standardUsers };
    } catch (error) {
        console.error(`Adapter error fetching batch users by IDs:`, error);
        throw error;
    }
}

/**
 * Gets a single tweet by ID, adapted to StandardTweet format.
 */
export async function getStandardTweetById(tweetId: string): Promise<StandardTweet | null> {
    try {
        const response = await twitterService.getTweetsByIds(tweetId);
        if (!response.tweets || response.tweets.length === 0) {
            console.log(`Tweet not found via twitterService for ID: ${tweetId}`);
            return null;
        }
        // Service returns TweetDetailed[]
        // return convertToStandardTweet(response.tweets[0]); // Old call
        return convertToStandardDetailedTweet(response.tweets[0]); // Use detailed converter
    } catch (error) {
        console.error(`Adapter error fetching tweet ${tweetId}:`, error);
        throw error; 
    }
}

/**
 * Gets user info by username, adapted to StandardUser format.
 * (No pagination needed for this one)
 */
export async function getStandardUserByUsername(username: string): Promise<StandardUser | null> {
    try {
        const response = await twitterService.getUserByUsername(username);
        if (!response.data) {
            console.log(`User not found via twitterService for username: ${username}`);
            return null;
        }
        return convertToStandardUserDetailed(response.data);
    } catch (error) {
        console.error(`Adapter error fetching user ${username}:`, error);
        throw error; 
    }
}

/**
 * Gets user followers, adapted to StandardUser format.
 */
export async function getStandardUserFollowers(username: string, cursor?: string): Promise<{ users: StandardUser[], next_cursor?: string, has_next_page?: boolean }> {
    try {
        const response = await twitterService.getUserFollowers(username, cursor || "");
        const standardUsers = (response.followers || [])
            .map(convertToStandardUserListItem) 
            .filter((u): u is StandardUser => u !== null); 
        return { 
            users: standardUsers, 
            next_cursor: response.next_cursor, 
            has_next_page: response.has_next_page
        };
    } catch (error) {
        console.error(`Adapter error fetching followers for ${username}:`, error);
        throw error;
    }
}

/**
 * Gets user followings, adapted to StandardUser format.
 */
export async function getStandardUserFollowings(username: string, cursor?: string): Promise<{ users: StandardUser[], next_cursor?: string, has_next_page?: boolean }> {
     try {
        const response = await twitterService.getUserFollowings(username, cursor || "");
        const standardUsers = (response.followings || [])
            .map(convertToStandardUserListItem) 
            .filter((u): u is StandardUser => u !== null); 
        return { 
            users: standardUsers, 
            next_cursor: response.next_cursor, 
            has_next_page: response.has_next_page
        };
    } catch (error) {
        console.error(`Adapter error fetching followings for ${username}:`, error);
        throw error;
    }
}

/**
 * Gets latest tweets for a user, adapted to StandardTweet format.
 */
export async function getStandardUserLastTweets(username: string, cursor?: string): Promise<{ tweets: StandardTweet[], next_cursor?: string, has_next_page?: boolean }> { 
    try {
        // Use the new response type from service
        const response = await twitterService.getUserLastTweets(username, cursor || "");
        
        // Combine pinned and regular tweets before mapping
        const allRawTweets: twitterService.TweetDetailed[] = [];
        if (response.data?.pin_tweet) {
            allRawTweets.push(response.data.pin_tweet);
        }
        if (response.data?.tweets) {
            allRawTweets.push(...response.data.tweets);
        }

        // Map using the detailed converter
        const standardTweets = allRawTweets
            .map(convertToStandardDetailedTweet) // Use detailed converter
            .filter((t): t is StandardTweet => t !== null);
            
        return { 
            tweets: standardTweets, 
            next_cursor: response.next_cursor, 
            has_next_page: response.has_next_page 
        };
    } catch (error) {
        console.error(`Adapter error fetching last tweets for ${username}:`, error);
        throw error;
    }
}

/**
 * Gets latest original tweets (excluding replies and retweets) for a user, adapted to StandardTweet format.
 * Can automatically paginate to fetch a minimum number of tweets if specified.
 * @param username The Twitter username.
 * @param cursor Optional cursor for pagination to start from for the first page.
 * @param minTweetsCount Optional minimum number of original tweets to fetch. 
 *                       If provided, the function will attempt to paginate (up to a fixed limit of pages) 
 *                       to meet this count. If not provided, it fetches only one page.
 * @returns A promise that resolves to an object containing the list of original tweets, 
 *          the next cursor (if more tweets might be available), and a flag indicating if there's a next page.
 */
export async function getStandardUserLastOriginalTweets(
    username: string, 
    cursor?: string, 
    minTweetsCount?: number
): Promise<{ tweets: StandardTweet[], next_cursor?: string, has_next_page?: boolean }> {
    const MAX_PAGES_TO_FETCH_IF_COUNT_SPECIFIED = 5; // Max pages to fetch if minTweetsCount is given
    let collectedOriginalTweets: StandardTweet[] = [];
    let currentRequestCursor: string | undefined = cursor;
    let lastResponseNextCursor: string | undefined = undefined;
    let lastResponseHasNextPage: boolean = true; // Assume true initially to enter loop at least once
    let pagesFetched = 0;

    const shouldPaginate = minTweetsCount !== undefined && minTweetsCount > 0;
    const maxPagesToFetch = shouldPaginate ? MAX_PAGES_TO_FETCH_IF_COUNT_SPECIFIED : 1;

    try {
        while (pagesFetched < maxPagesToFetch && lastResponseHasNextPage) {
            pagesFetched++;
            
            const response = await twitterService.getUserLastTweets(username, currentRequestCursor || "");
            
            const rawTweetsForPage: twitterService.TweetDetailed[] = [];

            // Handle pinned tweet only on the very first actual fetch 
            // (i.e., no initial cursor was provided to the function, and this is the first page of the loop)
            if (pagesFetched === 1 && !cursor && response.data?.pin_tweet) {
                rawTweetsForPage.push(response.data.pin_tweet);
            }
            if (response.data?.tweets) {
                rawTweetsForPage.push(...response.data.tweets);
            }

            const convertedPageTweets = rawTweetsForPage
                .map(convertToStandardDetailedTweet)
                .filter((t): t is StandardTweet => t !== null);

            const pageOriginalTweets = convertedPageTweets.filter(tweet => {
                if (!tweet.referenced_tweets) return true; // Original or quote tweet
                const isReply = tweet.referenced_tweets.some(rt => rt.type === 'replied_to');
                const isRetweet = tweet.referenced_tweets.some(rt => rt.type === 'retweeted');
                return !isReply && !isRetweet;
            });

            collectedOriginalTweets.push(...pageOriginalTweets);

            lastResponseNextCursor = response.next_cursor;
            lastResponseHasNextPage = !!response.has_next_page && !!lastResponseNextCursor;
            currentRequestCursor = lastResponseNextCursor; // Use this for the next iteration

            console.log(`Fetched ${pageOriginalTweets.length} original tweets from page ${pagesFetched}.`);
            console.log(`Next cursor: ${lastResponseNextCursor}, has next page: ${lastResponseHasNextPage}`);
            console.log(`Total collected original tweets: ${collectedOriginalTweets.length}`);

            if (shouldPaginate && collectedOriginalTweets.length >= minTweetsCount) {
                break; // Desired count reached
            }
            
            if (pagesFetched < maxPagesToFetch && lastResponseHasNextPage) {
                 await new Promise(resolve => setTimeout(resolve, 10)); // Small delay before next fetch
            }
        }

        return {
            tweets: collectedOriginalTweets,
            next_cursor: lastResponseNextCursor, // The cursor from the last fetch attempt
            has_next_page: lastResponseHasNextPage // Whether the last fetch indicated more pages
        };

    } catch (error) {
        console.error(`Adapter error fetching last original tweets for ${username} (paginated):`, error);
        throw error;
    }
}

/**
 * Gets tweet mentions for a user, adapted to StandardTweet format.
 */
export async function getStandardUserMentions(username: string, sinceTime?: number, untilTime?: number, cursor?: string): Promise<{ tweets: StandardTweet[], next_cursor?: string, has_next_page?: boolean }> { 
    try {
        const response = await twitterService.getUserMentions(username, sinceTime, untilTime, cursor || "");
        // Service returns { tweets: TweetMention[] }
        const standardTweets = (response.tweets || [])
            // .map(convertToStandardTweet) // Old call
            .map(convertToStandardMentionTweet) // Use mention converter
            .filter((t): t is StandardTweet => t !== null);
        return {
            tweets: standardTweets,
            next_cursor: response.next_cursor,
            has_next_page: response.has_next_page 
        };
    } catch (error) {
        console.error(`Adapter error fetching mentions for ${username}:`, error);
        throw error;
    }
}

/**
 * Gets tweet replies by tweet ID, adapted to StandardTweet format.
 */
export async function getStandardTweetReplies(tweetId: string, sinceTime?: number, untilTime?: number, cursor?: string): Promise<{ replies: StandardTweet[], next_cursor?: string, has_next_page?: boolean }> { 
     try {
        const response = await twitterService.getTweetReplies(tweetId, sinceTime, untilTime, cursor || "");
        // Service returns { replies: TweetMention[] }
        const standardReplies = (response.replies || [])
            // .map(convertToStandardTweet) // Old call
            .map(convertToStandardMentionTweet) // Use mention converter
            .filter((t): t is StandardTweet => t !== null);
        return {
            replies: standardReplies,
            next_cursor: response.next_cursor,
            has_next_page: response.has_next_page 
        };
    } catch (error) {
        console.error(`Adapter error fetching replies for tweet ${tweetId}:`, error);
        throw error;
    }
}

/**
 * Gets tweet quotes by tweet ID, adapted to StandardTweet format.
 */
export async function getStandardTweetQuotes(tweetId: string, sinceTime?: number, untilTime?: number, includeReplies: boolean = true, cursor?: string): Promise<{ tweets: StandardTweet[], next_cursor?: string, has_next_page?: boolean }> { 
    try {
        const response = await twitterService.getTweetQuotes(tweetId, sinceTime, untilTime, includeReplies, cursor || "");
        // Service returns { tweets: TweetMention[] }
         const standardTweets = (response.tweets || [])
            // .map(convertToStandardTweet) // Old call
            .map(convertToStandardMentionTweet) // Use mention converter
            .filter((t): t is StandardTweet => t !== null);
        return { 
            tweets: standardTweets, 
            next_cursor: response.next_cursor, 
            has_next_page: response.has_next_page 
        };
    } catch (error) {
        console.error(`Adapter error fetching quotes for tweet ${tweetId}:`, error);
        throw error;
    }
}

/**
 * Gets tweet retweeters by tweet ID, adapted to StandardUser format.
 */
export async function getStandardTweetRetweeters(tweetId: string, cursor?: string): Promise<{ users: StandardUser[], next_cursor?: string, has_next_page?: boolean }> {
    try {
        const response = await twitterService.getTweetRetweeters(tweetId, cursor || "");
         const standardUsers = (response.users || [])
            .map(convertToStandardRetweeterUser) 
            .filter((u): u is StandardUser => u !== null); 
        return { 
            users: standardUsers, 
            next_cursor: response.next_cursor, 
            has_next_page: response.has_next_page
        };
    } catch (error) {
        console.error(`Adapter error fetching retweeters for tweet ${tweetId}:`, error);
        throw error;
    }
}

/**
 * Internal helper function to check if a user follows a specific target user.
 * Handles pagination.
 * @param userName The user whose followings list is being checked.
 * @param targetUsername The screen name of the user to look for in the followings list.
 * @returns A promise resolving to true if the target is followed, false otherwise.
 */
async function _checkUserFollowsTarget(userName: string, targetUsername: string): Promise<boolean> {
    let cursor: string | undefined = undefined;
    let hasMorePages = true;
    const targetUsernameLower = targetUsername.toLowerCase();

    while (hasMorePages) {
        const response = await getStandardUserFollowings(userName, cursor);
        const standardUsers = response.users || [];
        
        const followsTarget = standardUsers.some(user => 
            user.username?.toLowerCase() === targetUsernameLower
        );
        if (followsTarget) {
            return true; 
        }

        cursor = response.next_cursor;
        hasMorePages = !!response.has_next_page && !!cursor;
        
        //console.log(`Loop check: hasMorePages=${hasMorePages}, next_cursor=${cursor}`);
        
        if(hasMorePages) await new Promise(resolve => setTimeout(resolve, 200)); 
    }
    return false;
}

export async function checkUserFollowsTarget(userName: string, targetUsername: string): Promise<boolean> {
    try {
        return await _checkUserFollowsTarget(userName, targetUsername);
    } catch (error) {
        console.error(`Adapter error checking if ${userName} follows ${targetUsername}:`, error);
        throw new Error(`Failed to check if ${userName} follows ${targetUsername}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Checks if a user follows NuwaDev by fetching their followings.
 */
export async function checkUserFollowsNuwaDev(userName: string): Promise<{ followsNuwaDev: boolean, message?: string }> {
     try {
        const targetUsername = 'nuwadev'; 
        const follows = await checkUserFollowsTarget(userName, targetUsername);
        return {
            followsNuwaDev: follows,
            message: follows 
                ? `User ${userName} follows @${targetUsername}` 
                : `User ${userName} does not follow @${targetUsername}`
        };
    } catch (error) {
        console.error(`Adapter error checking follow status for ${userName} -> ${'nuwadev'}:`, error);
         throw new Error(`Failed to check if ${userName} follows ${'nuwadev'}: ${error instanceof Error ? error.message : String(error)}`);
    } 
}