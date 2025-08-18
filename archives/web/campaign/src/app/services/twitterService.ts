/**
 * Twitter Service Module
 * 
 * Encapsulates logic for interacting with the Twitter API.
 */

interface UrlDetail {
    display_url: string;
    expanded_url: string;
    indices: number[];
    url: string;
}

interface DescriptionEntities {
    urls: UrlDetail[];
}

interface UrlEntities {
    urls: UrlDetail[];
}

// Interface for the nested entities within profile_bio
interface ProfileBioEntities {
    description: DescriptionEntities;
    url: UrlEntities;
}

// Interface for the profile_bio object (Primarily in Detailed Info)
interface ProfileBio {
    description: string;
    entities: ProfileBioEntities;
}

// --- Specific User Info Structures --- Updated createdAt comments ---

// 1. Detailed User Info
export interface TwitterUserInfoDetailed {
    id: string;
    name: string;
    userName: string; 
    screen_name?: string; 
    location?: string; 
    url?: string; // t.co link in bio
    twitterUrl?: string; // Add twitterUrl based on examples
    description: string;
    protected?: boolean; 
    isVerified?: boolean; // Might be deprecated / less used
    isBlueVerified: boolean;
    followers: number; 
    following: number; 
    favouritesCount: number; 
    statusesCount: number; 
    mediaCount: number; 
    createdAt: string; // Twitter date string format (e.g., "Thu Feb 28 03:37:03 +0000 2008")
    coverPicture?: string | null;
    profilePicture: string; 
    canDm: boolean;
    // Fields specifically seen in tweet author sub-object
    status?: string;                   
    canMediaTag?: boolean;             
    entities?: ProfileBioEntities & { description?: { user_mentions?: unknown[] } }; // Extend ProfileBioEntities slightly for author object
    // --- Fields primarily in user/info or batch --- (keep as optional)
    fastFollowersCount?: number; 
    hasCustomTimelines?: boolean; 
    isTranslator?: boolean; 
    withheldInCountries?: string[];
    affiliatesHighlightedLabel?: Record<string, unknown>; 
    possiblySensitive?: boolean;
    pinnedTweetIds?: string[]; 
    isAutomated?: boolean; 
    automatedBy?: string | null; 
    unavailable?: boolean; 
    message?: string; 
    unavailableReason?: string; 
    profile_bio?: ProfileBio | null; 
    type?: "user"; 
}

// 2. User Info as List Item (FOR /user/followers and /user/followings)
// Reverted to original snake_case definition
export interface TwitterUserListItem {
    id: string;
    name: string;
    screen_name: string; // Snake case
    location?: string; 
    url?: string | null; 
    description?: string;
    email?: string | null; // Present in followers
    protected: boolean;
    verified: boolean; // Snake case
    followers_count: number; // Snake case
    following_count: number; // Snake case
    friends_count?: number; // Snake case
    favourites_count: number; // Snake case
    statuses_count: number; // Snake case
    media_tweets_count?: number; // Snake case
    created_at: string; // Twitter date string format (e.g., "Sat Jul 13 08:35:56 +0000 2013")
    profile_banner_url?: string | null; // Snake case
    profile_image_url_https: string; // Snake case
    can_dm: boolean; // Snake case
}

// 3. User Info for Retweeters (FOR /tweet/retweeters)
// New interface based on observed camelCase structure
export interface TwitterRetweeterUser {
    id: string;
    name: string;
    userName: string; // Camel case
    location?: string; 
    url?: string | null;
    description?: string;
    protected: boolean;
    verified: boolean; // Camel case (same name, different context)
    followers: number; // Camel case
    following: number; // Camel case
    favouritesCount: number; // Camel case
    statusesCount: number; // Camel case
    mediaCount: number; // Camel case
    createdAt: string; // Twitter date string format (observed non-ISO in examples)
    coverPicture?: string | null; // Camel case
    profilePicture: string; // Camel case
    canDm: boolean; // Camel case
}

// --- API Response Interfaces --- Corrected based on actual responses ---

// Interface for the root batch users response object
export interface BatchUsersResponse {
    users: TwitterUserInfoDetailed[]; 
    status: "success" | string; 
    msg: string;
}

// Interface for the user/info endpoint response
export interface UserInfoResponse {
    data: TwitterUserInfoDetailed; 
    status: "success" | string;
    msg: string;
}

// Interface for the user/followers endpoint response
export interface FollowersResponse {
    followers: TwitterUserListItem[]; // Uses snake_case List Item info
    status: "success" | string;
    msg: string; 
    next_cursor?: string; 
    has_next_page?: boolean;
    code?: number; 
}

// Interface for the user/followings endpoint response
export interface FollowingsResponse {
    followings: TwitterUserListItem[]; // Assumes snake_case List Item info (like followers)
    has_next_page?: boolean;
    next_cursor?: string;     
    status: "success" | string;
    msg?: string; 
    code?: number; 
}

// --- Unified Tweet Entities Structure --- NEW & UPDATED ---

// Reusable entity types
export interface TweetEntityHashtag {
    indices?: number[];
    text: string;
}

export interface TweetEntityUrl {
    display_url: string;
    expanded_url: string;
    indices?: number[];
    url: string;
}

export interface TweetEntityUserMention {
    id_str: string;
    indices?: number[];
    name: string;
    screen_name: string;
}

export interface TweetEntitySymbol {
    indices?: number[];
    text: string;
}

// Main Entities interface used by TweetDetailed and TweetMention
export interface TweetEntities {
    hashtags?: TweetEntityHashtag[];
    symbols?: TweetEntitySymbol[]; 
    urls?: TweetEntityUrl[];
    user_mentions?: TweetEntityUserMention[];
    // Add other potential entities like media, polls if needed based on full API docs
    // media?: any[]; 
    // polls?: any[];
}

// --- Interfaces for user/mentions response ---

// Define a simple stub for referenced tweets within mentions/replies/quotes
interface ReferencedTweetStub {
    id: string;
    // Potentially add other minimal fields if needed later
}

// Interface for a single tweet object within the mentions response
export interface TweetMention {
    type: "tweet";
    id: string;
    url: string;
    text: string;
    source?: string; // Optional
    retweetCount: number;
    replyCount: number;
    likeCount: number;
    quoteCount: number;
    viewCount: number;
    createdAt: string; // Twitter date string format (e.g., "Thu Apr 24 12:54:53 +0000 2025")
    lang?: string; // Optional
    bookmarkCount?: number; // Optional
    isReply?: boolean; // Optional
    inReplyToId?: string | null; // Optional
    conversationId?: string; // Optional
    inReplyToUserId?: string | null; // Optional
    inReplyToUsername?: string | null; // Optional
    author: TwitterUserInfoDetailed; // Author in mentions example was detailed
    entities?: TweetEntities; // Use unified entities type
    isQuote?: boolean;
    isRetweet?: boolean;
    quoted_tweet?: ReferencedTweetStub | null;
    retweeted_tweet?: ReferencedTweetStub | null;
    possiblySensitive?: boolean;
}

// Interface for the root user/mentions response object
export interface UserMentionsResponse {
    tweets: TweetMention[];
    has_next_page?: boolean; 
    next_cursor?: string;    
    status: "success" | string;
    msg?: string; 
}

// Interface for the tweet/replies endpoint response
export interface TweetRepliesResponse {
    replies: TweetMention[]; // Reuse the tweet structure from mentions
    has_next_page?: boolean;
    next_cursor?: string;
    status: "success" | string;
    message?: string; // API seems inconsistent (msg vs message)
}

// Interface for the tweet/quotes endpoint response
export interface TweetQuotesResponse {
    tweets: TweetMention[];
    has_next_page?: boolean;
    next_cursor?: string;
    status: "success" | string;
    message?: string; // API seems inconsistent (msg vs message)
}

// Interface for the tweet/retweeters endpoint response
export interface TweetRetweetersResponse {
    users: TwitterRetweeterUser[]; // Uses camelCase Retweeter info
    has_next_page?: boolean;
    next_cursor?: string;
}

// --- Interfaces for Extended Entities (Media) --- RE-DEFINED ---
// Basic structure, expand as needed
interface MediaEntity { // Keep non-exported if only used here
    id_str: string;
    indices?: number[];
    media_url_https?: string;
    type?: 'photo' | 'video' | 'animated_gif';
    url?: string; 
    display_url?: string;
    expanded_url?: string;
    // Add video_info, sizes, etc. if needed
}

export interface ExtendedEntities { // Export if needed elsewhere, or keep internal
    media?: MediaEntity[];
}

// --- Main Detailed Tweet Interface --- Uses ExtendedEntities ---
export interface TweetDetailed { // Used by TweetsByIds, UserLastTweets responses
    type: "tweet";
    id: string;
    url: string;
    twitterUrl?: string; 
    text: string;
    source?: string;
    retweetCount: number;
    replyCount: number;
    likeCount: number;
    quoteCount: number;
    viewCount: number;
    createdAt: string; // Twitter date string format (e.g., "Sun Apr 13 03:28:39 +0000 2025")
    lang?: string;
    bookmarkCount?: number;
    isReply?: boolean;
    inReplyToId?: string | null;
    conversationId?: string;
    inReplyToUserId?: string | null;
    inReplyToUsername?: string | null;
    isPinned?: boolean;
    author: TwitterUserInfoDetailed; 
    entities?: TweetEntities; 
    extendedEntities?: ExtendedEntities | object; // Now references defined ExtendedEntities
    card?: object | null; 
    place?: object; 
    isRetweet?: boolean;
    isQuote?: boolean;
    isConversationControlled?: boolean;
    quoted_tweet?: TweetDetailed | null; 
    retweeted_tweet?: TweetDetailed | null; 
    possiblySensitive?: boolean;
}

// --- API Response Interfaces --- Updated ---

// Interface for the tweets endpoint response (Updated based on example)
export interface TweetsByIdsResponse { 
    tweets: TweetDetailed[];
    status: "success" | string; 
    msg: string;
    code?: number; 
}

// NEW Interface for the user/last_tweets endpoint response
export interface UserLastTweetsResponse {
    status: "success" | string;
    code?: number;
    msg?: string;
    data?: { // Tweets are nested under 'data'
        pin_tweet?: TweetDetailed; // Pinned tweet is separate
        tweets: TweetDetailed[]; // Array of regular tweets
    };
    has_next_page?: boolean;
    next_cursor?: string;
}

// --- Core API Call Function (Copied from tools.ts) ---

/**
 * Generic function to call the Twitter API.
 * Handles API key and basic error handling.
 */
async function callTwitterApi(endpoint: string, params: Record<string, string> = {}) {
    const apiKey = process.env.TWITTER_API_KEY;

    if (!apiKey) {
        console.error('Twitter API key is not configured');
        // Throw an error instead of returning an object for consistency
        throw new Error('Twitter API key is not configured'); 
    }

    try {
        const queryString = Object.entries(params)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        const url = `https://api.twitterapi.io/twitter/${endpoint}${queryString ? `?${queryString}` : ''}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'X-API-Key': apiKey },
        });

        const data = await response.json();

        if (!response.ok || data.status === "error") {
            const errorMessage = data.message || `HTTP ${response.status} ${response.statusText}`;
            //console.error(`Twitter API Error (${endpoint}): ${errorMessage}`);
            // Throw an error with details
            throw new Error(`Twitter API Error (${endpoint}): ${errorMessage}`);
        }
        //console.log(JSON.stringify(data, null, 2));
        return data; 
    } catch (error) {
        // Catch fetch errors or errors thrown from the response check
        //console.error(`Error calling Twitter API (${endpoint}):`, error);
        if (error instanceof Error && error.message.startsWith('Twitter API Error')) {
            throw error; // Re-throw specific API errors
        }
        throw new Error(`Failed to call Twitter API endpoint ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// --- Exported Service Functions --- Update signatures ---

/**
 * Get information about multiple Twitter users by their user IDs.
 */
export async function batchGetUsers(userIds: string): Promise<BatchUsersResponse> {
    // Cast the result, assuming callTwitterApi returns data compatible with the interface
    return callTwitterApi('user/batch_info_by_ids', { userIds }) as Promise<BatchUsersResponse>;
}

/**
 * Get information about a Twitter user by username.
 */
export async function getUserByUsername(userName: string): Promise<UserInfoResponse> {
    // Cast the result, assuming callTwitterApi returns data compatible with the interface
    return callTwitterApi('user/info', { userName }) as Promise<UserInfoResponse>;
}

/**
 * Retrieve latest tweets by user name (excluding replies).
 * Returns optimized tweet data and pagination info.
 */
export async function getUserLastTweets(userName: string, cursor: string = ""): Promise<UserLastTweetsResponse> { // Use new Response type
    // Cast the result, assuming callTwitterApi returns data compatible with the interface
    return callTwitterApi('user/last_tweets', { userName, cursor }) as Promise<UserLastTweetsResponse>;
}

/**
 * Get user followers.
 */
export async function getUserFollowers(userName: string, cursor: string = ""): Promise<FollowersResponse> {
    // Cast the result, assuming callTwitterApi returns data compatible with the interface
    return callTwitterApi('user/followers', { userName, cursor }) as Promise<FollowersResponse>;
}

/**
 * Get user followings.
 */
export async function getUserFollowings(userName: string, cursor: string = ""): Promise<FollowingsResponse> {
    // Cast the result, assuming callTwitterApi returns data compatible with the interface
    return callTwitterApi('user/followings', { userName, cursor }) as Promise<FollowingsResponse>;
}

/**
 * Get tweet mentions for a user.
 */
export async function getUserMentions(userName: string, sinceTime?: number, untilTime?: number, cursor: string = ""): Promise<UserMentionsResponse> {
    const params: Record<string, string> = { userName };
    if (sinceTime) params.sinceTime = sinceTime.toString();
    if (untilTime) params.untilTime = untilTime.toString();
    if (cursor) params.cursor = cursor;
    return callTwitterApi('user/mentions', params) as Promise<UserMentionsResponse>;
}

/**
 * Get tweets by their IDs.
 */
export async function getTweetsByIds(tweet_ids: string): Promise<TweetsByIdsResponse> {
    return callTwitterApi('tweets', { tweet_ids }) as Promise<TweetsByIdsResponse>;
}

/**
 * Get tweet replies by tweet ID.
 */
export async function getTweetReplies(tweetId: string, sinceTime?: number, untilTime?: number, cursor: string = ""): Promise<TweetRepliesResponse> {
    const params: Record<string, string> = { tweetId };
    if (sinceTime) params.sinceTime = sinceTime.toString();
    if (untilTime) params.untilTime = untilTime.toString();
    if (cursor) params.cursor = cursor;
    return callTwitterApi('tweet/replies', params) as Promise<TweetRepliesResponse>;
}

/**
 * Get tweet quotes by tweet ID.
 */
export async function getTweetQuotes(tweetId: string, sinceTime?: number, untilTime?: number, includeReplies: boolean = true, cursor: string = ""): Promise<TweetQuotesResponse> {
    const params: Record<string, string> = { tweetId, includeReplies: includeReplies.toString() };
    if (sinceTime) params.sinceTime = sinceTime.toString();
    if (untilTime) params.untilTime = untilTime.toString();
    if (cursor) params.cursor = cursor;
    return callTwitterApi('tweet/quotes', params) as Promise<TweetQuotesResponse>;
}

/**
 * Get tweet retweeters by tweet ID.
 */
export async function getTweetRetweeters(tweetId: string, cursor: string = ""): Promise<TweetRetweetersResponse> {
    const params: Record<string, string> = { tweetId };
    if (cursor) params.cursor = cursor;
    return callTwitterApi('tweet/retweeters', params) as Promise<TweetRetweetersResponse>;
}