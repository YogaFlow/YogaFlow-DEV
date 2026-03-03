export type UserRole = 'admin' | 'course_leader' | 'participant';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  phone: string;
  role?: 'student' | 'teacher' | 'admin';
  roles: UserRole[];
  gdpr_consent: boolean;
  gdpr_consent_date: string;
  email_verified?: boolean;
  email_verified_at?: string;
  created_at: string;
  updated_at: string;
}

export type CourseStatus = 'active' | 'canceled' | 'not_planned';
export type CourseFrequency = 'one_time' | 'weekly';

export interface Course {
  id: string;
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

export interface EmailTemplate {
  id: string;
  type: 'reminder_24h' | 'reminder_1h' | 'registration_confirmation';
  subject: string;
  content: string;
}

export interface SystemSettings {
  id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_secure: boolean;
  from_email: string;
  from_name: string;
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
