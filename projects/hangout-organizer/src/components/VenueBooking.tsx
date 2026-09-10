import Link from "next/link";
import {
  bookingWindow,
  formatDayHeader,
  formatDuration,
  formatMoney,
  formatMoneyRange,
} from "@/lib/slots";
import type { Venue } from "@/lib/types";

/**
 * Everything needed to actually make the booking, on the card that says the
 * slot is settled.
 *
 * Confirming a session is not the end of the job — someone still has to open
 * the platform and pay for a court, usually on a phone, usually right then.
 * The venue row already knew where that happens, what it costs and how far
 * ahead the platform opens; none of it reached the host, who got a venue name
 * and a bare "book it" link and re-derived the rest from the Venues page every
 * week. This puts the whole answer next to the confirmed time.
 */
export function VenueBooking({
  venue,
  start,
  /** Hours-based length, for the price estimate. Omitted on a date poll, where
   * the "duration" is a count of days and an hourly total would be nonsense. */
  estimateMinutes,
}: {
  venue: Venue;
  start: Date;
  estimateMinutes?: number | null;
}) {
  const hourly = formatMoney(venue.price_per_hour, venue.currency);
  const peak = formatMoney(venue.peak_price_per_hour, venue.currency);
  /*
   * A venue with a peak rate has no single answer to "what will this cost", and
   * this panel does not know which side of peak a Sunday afternoon falls on —
   * the venue's own notes are where that lives. So it quotes the range and lets
   * the host read the rate card, rather than printing the off-peak number with
   * a confidence it has not earned.
   */
  const hours = estimateMinutes ? estimateMinutes / 60 : null;
  const estimate =
    venue.price_per_hour != null && hours
      ? venue.peak_price_per_hour != null
        ? formatMoneyRange(
            venue.price_per_hour * hours,
            venue.peak_price_per_hour * hours,
            venue.currency,
          )
        : formatMoney(venue.price_per_hour * hours, venue.currency)
      : null;

  const window =
    venue.booking_opens_days_ahead != null
      ? bookingWindow(start, venue.booking_opens_days_ahead)
      : null;
  const opensOn = window ? formatDayHeader(window.opensOn) : null;

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{venue.name}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {venue.platform_name ? `Book on ${venue.platform_name}` : "No booking platform saved"}
          </p>
        </div>

        {venue.booking_url ? (
          <a
            href={venue.booking_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-tap w-full shrink-0 items-center justify-center rounded-lg bg-ok-solid px-3 py-2 text-sm font-medium text-ok-solid-fg transition hover:brightness-110 active:scale-95 sm:w-auto"
          >
            Open {venue.platform_name ?? "booking"} ↗
          </a>
        ) : (
          <Link
            href={`/venues#v-${venue.id}`}
            className="inline-flex min-h-tap w-full shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium transition hover:bg-surface-2 sm:w-auto"
          >
            Add a booking link
          </Link>
        )}
      </div>

      {(hourly || peak) && (
        <p className="mt-2 text-sm text-ink-muted">
          {[hourly && `${hourly}/hr`, peak && `peak ${peak}/hr`].filter(Boolean).join(" · ")}
          {estimate && estimateMinutes ? (
            <span className="text-ink-soft">
              {" "}
              — about {estimate} for {formatDuration(estimateMinutes)}
            </span>
          ) : null}
        </p>
      )}

      {window && opensOn && (
        <p className={`mt-1 text-sm ${window.isOpen ? "text-ok-fg" : "text-warn-fg"}`}>
          {window.isOpen
            ? `Booking is open now (${venue.booking_opens_days_ahead} days ahead).`
            : `Booking opens ${opensOn.weekday} ${opensOn.dayOfMonth} ${opensOn.month} — ${
                window.daysAway === 1 ? "tomorrow" : `in ${window.daysAway} days`
              }.`}
        </p>
      )}

      {venue.address && (
        <p className="mt-1 text-sm text-ink-soft">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${venue.name} ${venue.address}`,
            )}`}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line-strong underline-offset-2 hover:text-ink"
          >
            {venue.address}
          </a>
        </p>
      )}

      {venue.notes && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{venue.notes}</p>
      )}

      <Link
        href={`/venues#v-${venue.id}`}
        className="mt-2 inline-flex min-h-tap items-center text-sm text-ink-muted underline transition-colors hover:text-ink"
      >
        Venue details
      </Link>
    </div>
  );
}
