import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader } from "@/components/ui";
import { MonthCalendar, type CalendarEntry } from "@/components/MonthCalendar";
import { formatDuration, instantToKl } from "@/lib/slots";
import type { GameSession, HangoutEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const today = instantToKl(new Date());
  const [defaultYear, defaultMonth] = today.date.split("-").map(Number);

  const parsed = m?.match(/^(\d{4})-(\d{2})$/);
  const year = parsed ? Number(parsed[1]) : defaultYear;
  const month = parsed ? Number(parsed[2]) : defaultMonth;

  const supabase = await createClient();
  const [{ data: sessionData }, { data: eventData }] = await Promise.all([
    supabase.from("sessions").select("*").not("confirmed_start_at", "is", null),
    supabase.from("events").select("*").not("event_date", "is", null),
  ]);

  const entries: CalendarEntry[] = [];

  for (const s of (sessionData ?? []) as GameSession[]) {
    if (!s.confirmed_start_at || s.status === "cancelled") continue;
    const kl = instantToKl(new Date(s.confirmed_start_at));
    entries.push({
      id: `s-${s.id}`,
      href: `/polls/${s.poll_id}`,
      date: kl.date,
      label: `${kl.time} ${s.title}`,
      tone: "session",
      detail: `${s.title} · ${formatDuration(s.confirmed_duration_minutes ?? 0)}`,
    });
  }

  for (const e of (eventData ?? []) as HangoutEvent[]) {
    if (!e.event_date || e.status === "cancelled") continue;
    entries.push({
      id: `e-${e.id}`,
      href: `/events/${e.id}`,
      date: e.event_date,
      label: e.title,
      tone: "event",
      detail: e.location ?? undefined,
    });
  }

  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const inMonth = entries.filter((e) => e.date.startsWith(`${year}-${String(month).padStart(2, "0")}`));

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Confirmed sessions and dated events, Malaysia time."
        action={
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/calendar?m=${prev}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
              ←
            </Link>
            <span className="min-w-[9rem] text-center font-medium">{monthName}</span>
            <Link href={`/calendar?m=${next}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
              →
            </Link>
          </div>
        }
      />

      <Card>
        <MonthCalendar year={year} month={month} entries={inMonth} />
      </Card>

      {inMonth.length === 0 && (
        <div className="mt-4">
          <Empty>Nothing scheduled in {monthName}.</Empty>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Green is a confirmed session, indigo is an event. Polls still open do not appear here until
        you confirm a slot.
      </p>
    </>
  );
}
