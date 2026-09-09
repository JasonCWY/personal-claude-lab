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

export interface RosterGroup {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
}

export interface RosterGroupMember {
  group_id: string;
  person_id: string;
}

export type PollStatus = "polling" | "closed";

/**
 * What a poll is asking. "time" is a grid of times within each day; "date"
 * asks only which whole days suit — the trip case, one slot per day.
 */
export type PollGranularity = "time" | "date";

/**
 * A poll owns the window being asked about and the share link.
 *
 * Availability hangs off this, not off a session, because whether someone is
 * free on Tuesday has nothing to do with which sport is being planned. One
 * poll can carry a badminton session and a pickleball session, both scored
 * against the same answers.
 */
export interface Poll {
  id: string;
  title: string;
  share_token: string;
  status: PollStatus;
  granularity: PollGranularity;
  poll_start_date: string;
  poll_end_date: string;
  day_start_time: string;
  day_end_time: string;
  slot_minutes: number;
  group_id: string | null;
  notes: string | null;
  created_at: string;
}

export type SessionStatus = "planning" | "confirmed" | "cancelled" | "completed";

/** A thing you are trying to book, within a poll. */
export interface GameSession {
  id: string;
  poll_id: string;
  /** Null on a date poll — a trip is not a court booking. */
  sport_id: string | null;
  title: string;
  status: SessionStatus;
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
  poll_id: string;
  person_id: string;
  slot_start: string;
}

export interface PollResponse {
  poll_id: string;
  person_id: string;
  submitted_at: string;
  comment: string | null;
  /**
   * "None of these work for me." A real answer, not the absence of one — and a
   * different claim from a session opt-out, which says "I am free then, just
   * not for that activity". A declined response carries no availability.
   */
  declined: boolean;
}

/**
 * A person saying "not this one" about one activity in a multi-activity poll.
 * Absence of a row means they are in — see migrations/005 for why.
 */
export interface SessionOptOut {
  session_id: string;
  person_id: string;
}

export interface PollInvitee {
  poll_id: string;
  person_id: string;
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
