import { createClient } from "@/lib/supabase/server";
import { createPoll } from "@/lib/actions";
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { AudiencePicker } from "@/components/AudiencePicker";
import { PollShapeFields } from "@/components/PollShapeFields";
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

          <PollShapeFields sports={sports} venues={venues} />

          <AudiencePicker people={people} groups={groups} memberships={memberships} />

          <div className="sm:col-span-2">
            <Field
              label="Answer by (optional)"
              hint="Malaysia time. After this the link stops taking answers and says so — which is the thing you would otherwise have to remember to do by hand. Leave it blank to keep the poll open until you close it."
            >
              <Input type="datetime-local" name="closes_at" />
            </Field>
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
