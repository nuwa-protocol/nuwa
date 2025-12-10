export type Target = 'local' | 'dev' | 'test' | 'main';

export interface Result {
  code: number;
  error?: string;
  data?: any;
}

export interface CapMetadata {
  id: string;
  cid: string;
  name: string;
  displayName: string;
  description: string;
  tags: string[];
  homepage: string;
  timestamp: string;
  repository: string;
  thumbnail: string;
  introduction: string;
  enable: boolean;
  version?: number;
  stats: CapStats;
}

export interface RatingDistribution {
  rating: number;
  count: number;
}

export interface CapStats {
  capId: string;
  downloads: number;
  ratingCount: number;
  averageRating: number;
  favorites: number;
  userRating?: number | null;
  ratingDistribution?: RatingDistribution[];
}
