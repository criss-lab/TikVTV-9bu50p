export interface IPTVChannel {
  id: string;
  name: string;
  logo: string;
  country: string;
  countryCode: string;
  languages: string[];
  categories: string[];
  streamUrl: string;
  alternativeStreamUrls?: string[];
  website?: string;
  alt_names?: string[];
  network?: string;
}

export interface Comment {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_profiles?: { username: string };
}

export interface Reaction {
  id: string;
  channel_id: string;
  user_id: string;
  type: string;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatar?: string;
}

export interface ChannelPage {
  items: IPTVChannel[];
  hasMore: boolean;
  total: number;
}

export interface Favorite {
  id: string;
  user_id: string;
  channel_id: string;
  channel_data: IPTVChannel;
  created_at: string;
}

export interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  count: number;
}

export interface TrendingChannel {
  channel_id: string;
  score: number;
  channel?: IPTVChannel;
}

export interface WatchHistoryItem {
  channelId: string;
  name: string;
  logo: string;
  country: string;
  countryCode: string;
  categories: string[];
  watchedAt: string; // ISO string
}

export interface QualityLevel {
  level: number;       // hls.js level index, -1 = auto
  height: number;
  bitrate: number;
  label: string;
}

export interface AppNotification {
  id: string;
  channelId: string;
  channelName: string;
  type: 'reaction' | 'comment';
  count: number;
  readAt?: string;
}

export type Language = 'en' | 'fr' | 'es' | 'ar' | 'zh';

// Shared feature contracts used by clips, EPG, sleep timer and theme state.
export type Theme = 'dark' | 'light';
export interface SleepTimerState {
  active: boolean;
  minutes: number;
  endsAt: number | null;
}
export interface EPGProgram {
  title: string;
  start: string;
  stop: string;
  desc?: string;
  category?: string;
}
export interface ChannelClip {
  id: string;
  channel_id: string;
  storage_path: string;
  public_url: string;
  duration_secs: number;
  recorded_by: string;
  expires_at: string;
  created_at: string;
}
