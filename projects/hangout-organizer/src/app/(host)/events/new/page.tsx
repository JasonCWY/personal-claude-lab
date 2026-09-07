import { createClient } from "@/lib/supabase/server";
import { createEvent } from "@/lib/event-actions";
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import type { ChecklistTemplate } from "@/lib/types";

export const dynamic = "force-dynamic";

const EVENT_TYPES = [
  { value: "party", label: "Party" },
  { value: "airbnb", label: "Airbnb / trip" },
  { value: "karaoke", label: "Karaoke" },
  { value: "other", label: "Other" },
];

export default async function NewEventPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("checklist_templates").select("*").order("name");
  const templates = (data ?? []) as ChecklistTemplate[];

  return (
    <>
      <PageHeader
        title="New event"
        subtitle="Pick a template and the checklist is created with real due dates counted back from the event date."
      />

      <Card>
        <form action={createEvent} className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <Input name="title" required placeholder="e.g. Jason's birthday karaoke" />
          </Field>
          <Field label="Type">
            <Select name="event_type" defaultValue="party">
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" hint="Leave blank if undecided — tasks then have no due dates.">
            <Input type="date" name="event_date" />
          </Field>
          <Field label="Location">
            <Input name="location" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Start from a checklist template">
              <Select name="template_id" defaultValue="">
                <option value="">Empty checklist</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea name="notes" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Create event</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
