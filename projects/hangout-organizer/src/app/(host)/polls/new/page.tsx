import { createClient } from "@/lib/supabase/server";
import { createPoll } from "@/lib/actions";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { AudiencePicker } from "@/components/AudiencePicker";
import { ActivityPicker } from "@/components/ActivityPicker";
import { defaultPollRange } from "@/lib/slots";
import type { Person, RosterGroup, Sport, Venue } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewPollPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: sportData }, { data: venueData }, { data: peopleData }, { data: groupData }, { data: memberData }] =
    await Promise.all([
      supabase.from("sports").select("*").order("name"),
      supabase.from("venues").select("*").eq("is_active", true).order("name"),
      supabase.from("people").select("*").eq("is_active", true).order("display_name"),
      supabase.from("roster_groups").select("*").order("name"),
      supabase.from("roster_group_members").select("*"),
    ]);

  const sports = (sportData ?? []) as Sport[];
  const venues = (venueData ?? []) as Venue[];
  const people = (peopleData ?? []) as Person[];
  const groups = (groupData ?? []) as RosterGroup[];

  const memberships: Record<string, string[]> = {};
  for (const m of memberData ?? []) {
    const gid = m.group_id as string;
    memberships[gid] = [...(memberships[gid] ?? []), m.person_id as string];
  }

  const range = defaultPollRange();

  return (
    <>
      <PageHeader
        title="New poll"
        subtitle="Ask once about a window of time, then work out what can be booked in it. One link, however many activities."
      />

      <ErrorBanner message={error} />

      <Card>
        <form action={createPoll} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Title" hint="Shown to friends on the share link.">
              <Input name="title" placeholder="e.g. Sports next week" />
            </Field>
          </div>

          <Field label="Poll from">
            <Input type="date" name="poll_start_date" required defaultValue={range.start} />
          </Field>
          <Field label="Poll until">
            <Input type="date" name="poll_end_date" required defaultValue={range.end} />
          </Field>

          <Field label="Earliest start">
            <Input type="time" name="day_start_time" required defaultValue="18:00" step={900} />
          </Field>
          <Field
            label="Latest end"
            hint="Midnight and past-midnight are fine — 00:00 means the end of that evening."
          >
            <Input type="time" name="day_end_time" required defaultValue="22:00" step={900} />
          </Field>

          <Field label="Slot size" hint="How finely friends can mark availability.">
            <Select name="slot_minutes" defaultValue="30">
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </Select>
          </Field>
          <div />

          <AudiencePicker people={people} groups={groups} memberships={memberships} />

          <ActivityPicker sports={sports} venues={venues} />

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
