export interface CreatorSummary {
  id: string;
  display_name: string;
  unique_handle: string;
  username?: string;
  avatar_url?: string | null;
  follower_count?: number;
}

export interface CreatorProfile extends CreatorSummary {
  bio?: string | null;
  is_verified?: boolean;
  totalLives?: number;
  totalViews?: number | string;
  recordings: VideoRecording[];
}

export interface SearchSession {
  id: string;
  title: string;
  status: string;
  category?: string | null;
  thumbnail_url?: string | null;
  host?: CreatorSummary;
}

export interface SearchResults {
  users: CreatorSummary[];
  sessions: SearchSession[];
}

export interface CourseLesson {
  id: string;
  title: string;
  kind: string;
  video_url?: string | null;
  resource_url?: string | null;
  live_session_id?: string | null;
  description?: string | null;
  is_preview?: boolean;
  locked?: boolean;
}

export interface CourseSection {
  id: string;
  title: string;
  lessons: CourseLesson[];
}

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  category: string;
  language: string;
  level: string;
  status?: string;
  thumbnail_url?: string | null;
  trailer_url?: string | null;
  price_amount: number;
  compare_price_amount?: number | null;
  rating_average?: number | null;
  enrollment_count: number;
  certificate_enabled?: boolean;
  outcomes?: string[];
  theme?: { primaryColor?: string; style?: string; [key: string]: unknown } | null;
  _count?: { sections?: number };
  instructor: CreatorSummary;
  sections: CourseSection[];
}

export interface MembershipTier {
  id: string;
  name: string;
  description?: string | null;
  price_amount: number;
  benefits?: string[];
}

export interface ChannelSummary {
  id?: string;
  name: string;
  handle: string;
  description?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  primary_color: string;
  accent_color: string;
  social_links?: Record<string, string>;
  layout?: Record<string, boolean>;
  membership_enabled?: boolean;
  membership_tiers?: MembershipTier[];
  owner?: CreatorSummary & { is_verified?: boolean; subscriber_count?: number };
}

export interface ChannelLiveItem {
  id: string;
  title: string;
  category?: string | null;
  status: string;
}

export interface ChannelVideoItem {
  id: string;
  title: string;
  thumbnail?: string | null;
  views?: number | string;
}

export interface ChannelPageData {
  channel: ChannelSummary;
  live: ChannelLiveItem[];
  videos: ChannelVideoItem[];
  courses: CourseSummary[];
}

export interface VideoRecording {
  id: string;
  title: string;
  thumbnail_url?: string | null;
  is_processing?: boolean;
  visibility?: string;
  category?: string | null;
  views?: number;
  viewer_count_peak?: number;
  ended_at?: string | null;
  created_at: string;
  video?: { id: string; duration_seconds?: number | null } | null;
}

export interface AudienceStats {
  followers: number;
  totalViews: number | string;
  totalLives: number;
  totalVideos?: number;
  totalLikes?: number;
  totalWatchTime?: number | string;
}

export interface CourseEnrollment {
  progress_percent?: number;
  completed_lessons?: string[];
}

export interface CoursePageData {
  course: CourseSummary;
  viewer: { enrolled: boolean; isInstructor: boolean };
  enrollment?: CourseEnrollment;
}

export interface MemberRecord {
  id: string;
  status: string;
  member: Pick<CreatorSummary, "display_name">;
  tier: MembershipTier;
}

export interface VideoAccessGrant {
  id: string;
  user_id: string;
  expires_at?: string | null;
  user: Pick<CreatorSummary, "display_name" | "unique_handle">;
}

export interface VideoAccessRecord {
  id: string;
  title: string;
  visibility: string;
}

export interface ChatMessage {
  senderHandle: string;
  message: string;
}

export interface StageGuest {
  id: string;
  invitee_id: string;
  invitee?: Pick<CreatorSummary, "unique_handle">;
}

export interface InviteStatusMessage {
  success: boolean;
  message: string;
}

export interface StageInvite {
  sessionId: string;
  host: Pick<CreatorSummary, "id" | "display_name">;
  invite?: { id: string };
  inviteId?: string;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
