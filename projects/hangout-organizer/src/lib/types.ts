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
 * A poll owns the dates being asked about and the share link.
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
  /**
   * Earliest and latest picked date — DERIVED BOUNDS, not the polled set.
   *
   * They exist because `polls_status_idx` and the dashboard's ordering are
   * built on them, and a join per list render to recompute a sort key would be
   * a Tokyo round trip for nothing. A poll over three scattered Tuesdays has
   * bounds two weeks apart and asks about three days, so anything rendering
   * "when is this poll?" must read `poll_windows` and go through
   * `formatDateList()`. See migration 013.
   */
  poll_start_date: string;
  poll_end_date: string;
  slot_minutes: number;
  group_id: string | null;
  /**
   * When this poll stops accepting answers, or null for "until I close it".
   *
   * Evaluated per request rather than by a job — see `lib/poll-state.ts`. It is
   * kept separate from `status` on purpose: this is what the host ANNOUNCED,
   * `status` is what the host DECIDED.
   */
  closes_at: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * One dated window a poll asks about — the actual polled set.
 *
 * Both times null means a whole-date window (the trip case). An `end_time` at
 * or before `start_time` means the next day, exactly as the old poll-level
 * `day_end_time` did. Several rows may share a `day_date`: Saturday can be a
 * morning and an evening with a real gap between them.
 *
 * Rows are kept as the host typed them; `mergeWindows()` in `lib/slots.ts`
 * folds any overlap when the grid is derived.
 */
export interface PollWindowRow {
  id: string;
  poll_id: string;
  day_date: string;
  start_time: string | null;
  end_time: string | null;
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
  /**
   * Which court, once it is booked. Free text because venues label them "3",
   * "A2" and "Hall 2 / 5"; the app prints it and never does arithmetic on it.
   * Shown on the public page, since standing in the right building and not
   * knowing which court is the problem it exists to solve.
   */
  court_number: string | null;
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
  /**
   * How many are coming with this answer, INCLUDING the person answering.
   * 1 means just them. Counts toward the quorum as bodies — see
   * `headcountOf` in `quorum.ts` and migration 010.
   */
  party_size: number;
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
