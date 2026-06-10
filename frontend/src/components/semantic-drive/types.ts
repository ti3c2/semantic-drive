export type Asset = {
  id: string;
  original_filename: string;
  display_title?: string | null;
  description?: string | null;
  media_type: 'image' | 'audio' | 'video' | string;
  mime_type: string;
  file_size_bytes: number;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  processing_status: string;
  visibility: string;
  trashed_at?: string | null;
  thumbnail_url?: string | null;
  raw_url: string;
  download_url: string;
  tags: { id: string; name: string }[];
  created_at: string;
};

export type AssetDetail = Asset & {
  ocr_text?: string | null;
  visual_summary?: string | null;
  transcript?: string | null;
  extractions: { id: string; type: string; text: string; extra: Record<string, unknown> }[];
};

export type SearchResult = {
  asset_id: string;
  title: string;
  original_filename: string;
  media_type: string;
  mime_type: string;
  thumbnail_url?: string | null;
  raw_url: string;
  download_url: string;
  score: number;
  vector_score?: number | null;
  rerank_score?: number | null;
  match_reason: { type: string; text: string; start_ms?: number | null; end_ms?: number | null };
  tags: string[];
  created_at: string;
};

export type DisplayItem = {
  id: string;
  title: string;
  original_filename: string;
  media_type: string;
  mime_type: string;
  thumbnail_url?: string | null;
  raw_url: string;
  download_url: string;
  status?: string;
  score?: number;
  match?: SearchResult['match_reason'];
  tags: string[];
  created_at: string;
};

export type ActionFeedback = {
  id: number;
  message: string;
  tone: 'success' | 'error';
};

export type SharePayload = {
  share_url?: string;
  embed?: {
    iframe?: string;
  } | null;
  [key: string]: unknown;
};

export type ViewMode = 'library' | 'trash';
