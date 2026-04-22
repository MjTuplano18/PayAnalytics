// Chat-related type definitions

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  metadata?: {
    chart_metadata?: ChartMetadata;
    tokens_used?: number;
    cached?: boolean;
  };
}

export interface ChartMetadata {
  type: 'bar' | 'line' | 'pie';
  data: number[];
  labels: string[];
  title?: string;
  x_axis_label?: string;
  y_axis_label?: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatQueryRequest {
  query: string;
  conversation_id?: string | null;
  stream?: boolean;
}

export interface ChatQueryResponse {
  message_id: string;
  conversation_id: string;
  role: 'assistant';
  content: string;
  chart_metadata?: ChartMetadata | null;
  tokens_used: number;
  processing_time_ms: number;
  cached?: boolean;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
}

export interface ConversationHistoryResponse {
  conversation_id: string;
  messages: Message[];
  total: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown> | null;
}
