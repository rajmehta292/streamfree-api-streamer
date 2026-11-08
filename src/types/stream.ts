export type StreamQuality = 'SD' | 'HD' | 'FHD' | '4K' | string;

export interface StreamSource {
  quality: StreamQuality;
  url: string;
  live: boolean;
}

export interface TeamInfo {
  name: string;
  logo: string;
}

export interface StreamItem {
  id: string;
  name: string;
  category: string;
  league?: string;
  stream_key: string;
  match_timestamp: number;
  viewers?: number;
  is_external?: boolean;
  thumbnail_url?: string;
  sources: StreamSource[];
  team1?: TeamInfo;
  team2?: TeamInfo;
  custom?: boolean;
}

export interface StreamsResponse {
  count: number;
  streams: StreamItem[];
}

export interface SourcesResponse {
  stream_key: string;
  sources: StreamSource[];
}

export interface CategoriesResponse {
  categories: string[];
}

export interface StreamQueryParams {
  category?: string;
  search?: string;
  live?: boolean;
  sort?: 'viewers' | 'time' | 'name';
}

export interface FeedbackInput {
  message: string;
  stream_key?: string;
  category?: string;
  user_agent?: string;
}

