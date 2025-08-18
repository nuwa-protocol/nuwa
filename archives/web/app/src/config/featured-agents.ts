export const FEATURED_AGENTS = [
    'nevertransfer',
    'trustedpay',
    'govmind',
    'dobby',
] as const;

export const TRENDING_AGENTS = [
    'nuwa',
    'gollum',
    'caishen',
    'oraclebite',
] as const;

export type FeaturedAgent = typeof FEATURED_AGENTS[number];
export type TrendingAgent = typeof TRENDING_AGENTS[number]; 