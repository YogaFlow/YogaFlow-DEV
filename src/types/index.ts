export type UserRole = 'owner' | 'admin' | 'teacher' | 'user';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
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
  gdpr_consent?: boolean;
  gdpr_consent_date?: string;
  created_at: string;
  updated_at: string;
}

export type CourseStatus = 'active' | 'canceled' | 'not_planned';
export type CourseFrequency = 'one_time' | 'weekly';

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
  created_at: string;
  updated_at: string;
}

export interface Registration {
  id: string;
  tenant_id: string;
  course_id: string;
  user_id: string;
  status: 'registered' | 'waitlist';
  registered_at: string;
  signup_timestamp: string;
  cancellation_timestamp?: string;
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

export interface GlobalSettings {
  id: string;
  key: string;
  value: any;
  updated_at: string;
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
