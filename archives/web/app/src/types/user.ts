export interface Token {
  id: string
  name: string
  symbol: string
  logo: string
  balance: number
  decimals: number
}

export interface User {
  id: string
  name: string
  username: string
  avatar: string
  address: string
  rgasBalance: number
  tokens: Token[]
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio?: string;
  email?: string;
  website?: string;
  socialLinks?: {
    twitter?: string;
    github?: string;
    linkedin?: string;
  };
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
  language: string;
  timezone: string;
}

export interface UserPreferences {
  displayName: string;
  avatarUrl: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export interface UserStats {
  totalTasks: number;
  completedTasks: number;
  activeChannels: number;
  totalMessages: number;
  lastActive: number;
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: number;
  deviceInfo: {
    browser: string;
    os: string;
    ip: string;
  };
}

export interface UserInfo {
  id: string;
  username: string;
  name: string;
  avatar: string;
}

export interface RgasBalance {
  balance: number | undefined;
  isPending: boolean;
  isError: boolean;
  refetchBalance: () => void;
}

export interface TokenBalance {
  token: Token;
  balance: number;
  isPending: boolean;
  isError: boolean;
}

export interface AllBalance {
  balances: TokenBalance[];
  isPending: boolean;
  isError: boolean;
  refetchBalance: () => void;
} 