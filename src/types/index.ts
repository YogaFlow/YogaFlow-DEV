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
  /** Stunden vor Kursbeginn für kostenlose Storno / Einheitenrückgabe (A6, W2). */
  cancellation_window_hours?: number;
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
  /** Login. NULL, wenn das Profil anonymisiert wurde. */
  auth_user_id: string | null;
  /** Gesetzt, wenn die Person eingeschränkt statt gelöscht wurde. */
  anonymized_at: string | null;
  /** UX-5: aus Listen ausgeblendet (Prüfspur bleibt). */
  archived_at?: string | null;
}

export type CourseStatus = 'active' | 'canceled' | 'not_planned';
export type CourseFrequency = 'one_time' | 'weekly';

export type RegistrationStatus =
  | 'registered'
  | 'waitlist'
  | 'cancelled'
  | 'pending_payment';

export type CoverageStatus = 'not_required' | 'open' | 'paid' | 'pass' | 'waived';

/** Stripe-Schreibweise (ein l). registration_status schreibt cancelled. */
export type PaymentStatus =
  | 'initiated'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'refunded_partial'
  | 'refunded'
  | 'disputed';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'paypal_manual' | 'card';

export type PaymentProvider = 'manual' | 'stripe';

export type PaymentSubjectType = 'registration' | 'pass_purchase';

export type PassValidityRule = 'years_to_year_end' | 'months';

export interface PassProduct {
  id: string;
  tenant_id: string;
  name: string;
  units: number;
  price_cents: number;
  validity_rule: PassValidityRule;
  validity_value: number;
  is_scheduled: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PassStatus = 'active' | 'expired' | 'revoked';

export type PassMovementKind =
  | 'purchase'
  | 'redeem'
  | 'redeem_reversal'
  | 'expire'
  | 'revoke'
  | 'manual_adjustment';

export interface Pass {
  id: string;
  tenant_id: string;
  member_id: string;
  product_id: string;
  name: string;
  units_total: number;
  price_cents: number;
  validity_rule: PassValidityRule;
  validity_value: number;
  valid_from: string;
  valid_until: string;
  payment_id: string;
  status: PassStatus;
  revoked_at: string | null;
  created_at: string;
}

export interface PassMovement {
  id: string;
  tenant_id: string;
  pass_id: string;
  delta: number;
  kind: PassMovementKind;
  registration_id: string | null;
  reason: string | null;
  actor_member_id: string | null;
  event_id: string | null;
  created_at: string;
}

/** A6-2: Deckungswahl beim Studio-Eintrag. */
export type AdminRegisterCoverage =
  | 'open'
  | 'pass'
  | 'cash'
  | 'paypal_manual'
  | 'bank_transfer';

export type BookingCoverageResult = 'pass' | 'open' | 'not_required' | 'paid';

/** Rückgabe von register_for_course (A6-2: coverage / pass_remaining; 2.2b: status/hold). */
export interface RegisterForCourseResult {
  success: boolean;
  message?: string;
  error?: string;
  is_waitlist?: boolean;
  waitlist_position?: number;
  coverage?: BookingCoverageResult;
  pass_remaining?: number;
  /** registered | pending_payment | waitlist — von der RPC geliefert. */
  status?: RegistrationStatus | string;
  registration_id?: string;
  hold_expires_at?: string;
}

/** Rückgabe von admin_register_user_for_course. */
export interface AdminRegisterForCourseResult {
  success: boolean;
  error?: string;
  on_waitlist?: boolean;
  waitlist_position?: number;
  coverage?: BookingCoverageResult;
  pass_remaining?: number | null;
}

export interface ApplyPassResult {
  success: boolean;
  error?: string;
  pass_id?: string;
  remaining?: number;
  movement_id?: string;
  coverage_status?: CoverageStatus;
}

export interface UndoPassRedemptionResult {
  success: boolean;
  error?: string;
  movement_id?: string;
  pass_inactive?: boolean;
  coverage?: 'open';}

export interface Payment {
  id: string;
  tenant_id: string;
  subject_type: PaymentSubjectType;
  subject_id: string;
  registration_id: string | null;
  provider: PaymentProvider;
  provider_ref: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amount_cents: number;
  currency: string;
  reverses_payment_id: string | null;
  received_at: string;
  status_changed_at: string;
  expected_settlement_at: string | null;
  settled_at: string | null;
  recorded_by: string | null;
  note: string | null;
  created_at: string;
}

export type WaivedReason = 'pre_omlify' | 'goodwill' | 'other';

export type CancelReason =
  | 'participant'
  | 'studio'
  | 'course_cancelled'
  | 'promotion_expired'
  | 'role_change'
  | 'legacy_closed'
  | 'member_removed';

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
  canceled_at?: string | null;
  canceled_by?: string | null;
  cancel_note?: string | null;
  duration?: number;
  prerequisites?: string;
  frequency: CourseFrequency;
  series_id?: string;
  /** A6: mit Karte buchbar nur wenn true. DB-Default true. */
  pass_eligible?: boolean;
  /** UX-5: aus Listen/Buchung ausgeblendet (Prüfspur bleibt). */
  archived_at?: string | null;
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
  coverage_status?: CoverageStatus;
  price_cents_at_booking?: number;
  currency?: string;
  coverage_waived_reason?: WaivedReason | null;
  coverage_waived_note?: string | null;
  coverage_waived_by?: string | null;
  coverage_waived_at?: string | null;
  /** Eingefrorene Stornofrist (Kursbeginn Berlin minus Studio-Fenster). */
  cancellation_deadline?: string | null;
  /** Karte bei Deckung pass. */
  pass_id?: string | null;
  /** Warteliste: 'pass' = beim Nachrücken einlösen (W3). */
  coverage_intent?: 'pass' | null;
  /** Frist für pending_payment (timestamptz). */
  hold_expires_at?: string | null;
  hold_reason?: string | null;
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
  | 'waitlist_promoted'
  | 'course_canceled'
  | 'course_uncanceled'
  | 'password_changed'
  | 'payment_succeeded'
  | 'payment_refunded'
  | 'hold_expired_checkout'
  | 'hold_expired_promotion';

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
