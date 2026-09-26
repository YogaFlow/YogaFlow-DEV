export type UserRole = 'owner' | 'admin' | 'teacher' | 'user';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  brand_color: string | null;
  tagline: string | null;
  logo_path: string | null;
  logo_in_sidebar: boolean;
  logo_on_auth: boolean;
  sidebar_show_name: boolean;
  default_max_participants: number;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  /** Gesetzt durch Custom-Verifizierung (Edge Function verify-email). */
  email_verified?: boolean;
  first_name: string;
  last_name: string;
  role: UserRole;
  street?: string;
  house_number?: string;
  postal_code?: string;
  city?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

export type CourseStatus = 'active' | 'canceled' | 'not_planned';
export type CourseFrequency = 'one_time' | 'weekly';

export type RegistrationStatus = 'registered' | 'waitlist' | 'cancelled';

export type CancelReason =
  | 'participant'
  | 'studio'
  | 'course_cancelled'
  | 'promotion_expired'
  | 'role_change'
  | 'legacy_closed';

export type CourseRegistrationSummary = {
  user_id: string;
  status: RegistrationStatus;
  is_waitlist: boolean;
  cancellation_timestamp?: string | null;
};

export interface Course {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  end_time?: string;
  location: string;
  room?: string;
  max_participants: number;
  price: number;
  teacher_id: string;
  status: CourseStatus;
  duration?: number;
  prerequisites?: string;
  frequency: CourseFrequency;
  series_id?: string;
  teacher?: User;
  registrations?: CourseRegistrationSummary[];
  created_at: string;
  updated_at: string;
}

export interface Registration {
  id: string;
  tenant_id: string;
  course_id: string;
  user_id: string;
  status: RegistrationStatus;
  registered_at: string;
  signup_timestamp: string;
  cancellation_timestamp?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: CancelReason | null;
  is_waitlist: boolean;
  waitlist_position?: number;
  course?: Course;
  user?: User;
}

export interface Message {
  id: string;
  tenant_id?: string;
  course_id: string;
  sender_id: string;
  recipient_id?: string;
  content: string;
  is_broadcast: boolean;
  read: boolean;
  created_at: string;
  sender?: User;
  recipient?: User;
  course?: Course;
}

export type UserNotificationType =
  | 'course_added'
  | 'course_waitlisted'
  | 'course_removed'
  | 'waitlist_promoted';

export interface UserNotification {
  id: string;
  tenant_id: string;
  user_id: string;
  type: UserNotificationType;
  title?: string | null;
  body: string;
  course_id?: string | null;
  action_path: string;
  metadata?: Record<string, unknown>;
  read_at?: string | null;
  created_at: string;
}

export interface CourseWithBookings extends Course {
  bookings: Registration[];
  availableSpots: number;
  waitlistCount: number;
}

export interface DashboardStats {
  totalCourses: number;
  totalParticipants: number;
  upcomingCourses: number;
  totalBookings: number;
}
