export interface TweetScoreData {
    tweet_id: string;
    score: number;
    content_score: number;
    engagement_score: number;
    engagement_metrics: {
        likes: number;
        retweets: number;
        replies: number;
        quotes?: number;
        impressions?: number;
    };
    scored_at: string;
}

export interface TweetScoreResult {
    score: number;
    reasoning: string;
    engagement_score: number;
    content_score: number;
}
