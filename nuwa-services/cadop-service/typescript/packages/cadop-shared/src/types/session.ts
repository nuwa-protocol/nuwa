
// Session type
export interface Session {
    id: string;
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
    metadata: Record<string, any>;
    user: {
      id: string;
      userDid: string;
      sybilLevel: number;
      email?: string;
      displayName?: string;
    }
  }