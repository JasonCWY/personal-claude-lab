export interface Sport {
  id: string;
  name: string;
  min_players_full: number;
  full_duration_minutes: number;
  min_players_short: number;
  short_duration_minutes: number;
}

export interface Venue {
  id: string;
  name: string;
  sport_id: string | null;
  platform_name: string | null;
  booking_url: string | null;
  price_per_hour: number | null;
  peak_price_per_hour: number | null;
  currency: string;
  booking_opens_days_ahead: number | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface Person {
  id: string;
  display_name: string;
  is_active: boolean;
}

export type SessionStatus = "polling" | "confirmed" | "cancelled" | "completed";

export interface GameSession {
  id: string;
  sport_id: string;
  title: string;
  status: SessionStatus;
  share_token: string;
  poll_start_date: string;
  poll_end_date: string;
  day_start_time: string;
  day_end_time: string;
  slot_minutes: number;
  min_players_full: number;
  full_duration_minutes: number;
  min_players_short: number;
  short_duration_minutes: number;
  venue_id: string | null;
  confirmed_start_at: string | null;
  confirmed_duration_minutes: number | null;
  notes: string | null;
  created_at: string;
}

export interface AvailabilityRow {
  session_id: string;
  person_id: string;
  slot_start: string;
}

export interface SessionResponse {
  session_id: string;
  person_id: string;
  submitted_at: string;
  comment: string | null;
}

export type EventStatus = "planning" | "confirmed" | "done" | "cancelled";

export interface HangoutEvent {
  id: string;
  title: string;
  event_type: string;
  event_date: string | null;
  location: string | null;
  share_token: string;
  status: EventStatus;
  notes: string | null;
  created_at: string;
}

export interface EventTask {
  id: string;
  event_id: string;
  title: string;
  notes: string | null;
  assignee_person_id: string | null;
  due_date: string | null;
  is_done: boolean;
  done_at: string | null;
  sort_order: number;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  event_type: string;
  is_builtin: boolean;
}

export interface ChecklistTemplateItem {
  id: string;
  template_id: string;
  title: string;
  notes: string | null;
  sort_order: number;
  days_before_offset: number | null;
}
