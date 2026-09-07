import { createClient } from "@/lib/supabase/server";
import { createSession } from "@/lib/actions";
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { defaultPollRange } from "@/lib/slots";
import type { Sport, Venue } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const supabase = await createClient();
  const [{ data: sportData }, { data: venueData }] = await Promise.all([
    supabase.from("sports").select("*").order("name"),
    supabase.from("venues").select("*").eq("is_active", true).order("name"),
  ]);

  const sports = (sportData ?? []) as Sport[];
  const venues = (venueData ?? []) as Venue[];
  const range = defaultPollRange();
  const first = sports[0];

  return (
    <>
      <PageHeader
        title="New session"
        subtitle="Set the window to poll. Thresholds are prefilled from the sport and can be changed for this session only."
      />

      <Card>
        <form action={createSession} className="grid gap-4 sm:grid-cols-2">
          <Field label="Sport">
            <Select name="sport_id" required defaultValue={first?.id}>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" hint="Shown to friends on the share link.">
            <Input name="title" placeholder="e.g. Wednesday badminton" />
          </Field>

          <Field label="Poll from">
            <Input type="date" name="poll_start_date" required defaultValue={range.start} />
          </Field>
          <Field label="Poll until">
            <Input type="date" name="poll_end_date" required defaultValue={range.end} />
          </Field>

          <Field label="Earliest start">
            <Input type="time" name="day_start_time" required defaultValue="18:00" step={1800} />
          </Field>
          <Field label="Latest end">
            <Input type="time" name="day_end_time" required defaultValue="22:00" step={1800} />
          </Field>

          <Field label="Slot size" hint="How finely friends can mark availability.">
            <Select name="slot_minutes" defaultValue="30">
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </Select>
          </Field>
          <Field label="Likely venue" hint="Optional now — you can pick it when you confirm.">
            <Select name="venue_id" defaultValue="">
              <option value="">Decide later</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Booking rule
            </h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Ideal players">
                <Input
                  type="number"
                  name="min_players_full"
                  min="1"
                  defaultValue={first?.min_players_full ?? 6}
                />
              </Field>
              <Field label="Book for (min)">
                <Input
                  type="number"
                  name="full_duration_minutes"
                  min="30"
                  step="30"
                  defaultValue={first?.full_duration_minutes ?? 120}
                />
              </Field>
              <Field label="Fallback players">
                <Input
                  type="number"
                  name="min_players_short"
                  min="1"
                  defaultValue={first?.min_players_short ?? 4}
                />
              </Field>
              <Field label="Book for (min)">
                <Input
                  type="number"
                  name="short_duration_minutes"
                  min="30"
                  step="30"
                  defaultValue={first?.short_duration_minutes ?? 60}
                />
              </Field>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Durations must be a whole number of slots, or that tier is skipped.
            </p>
          </div>

          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea name="notes" placeholder="Anything the group should know." />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Button type="submit">Create and get share link</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
