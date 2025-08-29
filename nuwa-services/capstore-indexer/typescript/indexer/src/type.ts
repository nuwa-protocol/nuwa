export type Target = 'local' | 'dev' | 'test' | 'main';

export interface Result {
  code: number;
  error?: string;
  data?: any;
}

export interface CapMetadata {
  displayName: string,
  description: string,
  tags: string[],
  submittedAt: number,
  homepage: string,
  repository: string,
  thumbnail: string,
  enable: boolean
};

export interface CapStats {
  cap_id: string;
  downloads: number;
  rating_count: number;
  average_rating: number;
  favorites: number;
  created_at?: string;
  updated_at?: string;
  user_rating?: number | null;
}