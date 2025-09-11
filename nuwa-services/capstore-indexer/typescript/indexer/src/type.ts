export type Target = 'local' | 'dev' | 'test' | 'main';

export interface Result {
  code: number;
  error?: string;
  data?: any;
}

export interface CapMetadata {
  id: string,
  cid: string,
  name: string,
  displayName: string,
  description: string,
  tags: string[],
  homepage: string,
  repository: string,
  thumbnail: string,
  enable: boolean,
  version?: number,
  stats: CapStats
}

export interface CapStats {
  capId: string;
  downloads: number;
  ratingCount: number;
  averageRating: number;
  favorites: number;
  userRating?: number | null;
}