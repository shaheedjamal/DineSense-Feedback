export type UserRole = 'super_admin' | 'restaurant_admin' | 'restaurant_manager';

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  venue_id: number | null;
  status?: 'active' | 'inactive';
  created_at?: string;
  restaurant_name?: string | null;
}

export interface Venue {
  id: number;
  restaurant_name: string;
  location: string;
  contact_email?: string;
  welcome_message: string;
  camera_feedback_enabled: number | boolean;
  qr_feedback_enabled: number | boolean;
  retention_days?: number;
  status?: 'active' | 'inactive';
  created_at?: string;
  total_surveys?: number;
  avg_rating?: number | null;
}

export interface SurveyResponseItem {
  id: number;
  venue_id: number;
  restaurant_name: string;
  submission_channel: 'web' | 'qr' | 'kiosk';
  used_camera_cue: number;
  food_rating: number;
  service_rating: number;
  cleanliness_rating: number;
  waiting_time_rating: number;
  overall_rating: number;
  feedback_category: 'positive' | 'neutral' | 'negative';
  comment: string | null;
  is_demo: number;
  created_at: string;
}

export interface ServiceAction {
  id: number;
  venue_id: number;
  restaurant_name?: string;
  issue: string;
  action_description: string;
  assigned_role: string;
  status: 'open' | 'in_progress' | 'resolved';
  outcome: string | null;
  created_at: string;
}

export interface DashboardSummary {
  summary: {
    total_feedback: number;
    avg_overall_rating: number;
    avg_food_rating: number;
    avg_service_rating: number;
    avg_cleanliness_rating: number;
    avg_waiting_time_rating: number;
    positive_count: number;
    neutral_count: number;
    negative_count: number;
    comment_response_rate: number;
    camera_participation_rate: number;
    consent_accepted: number;
    consent_declined: number;
  };
  expression_cue_analytics: {
    sample_size: number;
    k_anonymity_threshold: number;
    suppressed_total: number;
    cues: Array<{
      expression_cue: 'smile_like' | 'neutral_like' | 'other_expression' | 'uncertain';
      count: number | null;
      suppressed: boolean;
      suppression_reason?: string;
    }>;
    disclaimer: string;
  };
}

export interface TrendPoint {
  period: string;
  count: number;
  avg_rating: number;
  food_rating: number;
  service_rating: number;
  cleanliness_rating: number;
  waiting_time_rating: number;
}

export interface InferenceResult {
  status: 'success' | 'abstention';
  expression_cue: 'smile_like' | 'neutral_like' | 'other_expression' | 'uncertain';
  confidence: number;
  confidence_band: 'high' | 'medium' | 'low';
  quality_status: 'acceptable' | 'insufficient';
  model_version: string;
  is_demo: boolean;
  message?: string;
  note: string;
}

export interface AuditLog {
  id: number;
  actor_id: number | null;
  actor_email: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  result: 'success' | 'denied' | 'error';
  timestamp: string;
}
