import { createClient } from "@/lib/supabase/server";
import {
  addTemplateItem,
  createTemplate,
  deleteTemplate,
  deleteTemplateItem,
} from "@/lib/event-actions";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import type { ChecklistTemplate, ChecklistTemplateItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const [{ data: templateData }, { data: itemData }] = await Promise.all([
    supabase.from("checklist_templates").select("*").order("name"),
    supabase.from("checklist_template_items").select("*").order("sort_order"),
  ]);

  const templates = (templateData ?? []) as ChecklistTemplate[];
  const items = (itemData ?? []) as ChecklistTemplateItem[];

  return (
    <>
      <PageHeader
        title="Checklist templates"
        subtitle="Reusable lists for the events you run often. No AI involved — these are yours to edit."
      />

      <Card className="mb-6">
        <h2 className="mb-3 font-medium">New template</h2>
        <form action={createTemplate} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <Field label="Name">
              <Input name="name" required placeholder="e.g. Futsal day trip" />
            </Field>
          </div>
          <Field label="Event type">
            <Select name="event_type" defaultValue="other">
              <option value="party">Party</option>
              <option value="airbnb">Airbnb / trip</option>
              <option value="karaoke">Karaoke</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Button type="submit">Create</Button>
        </form>
      </Card>

      <div className="space-y-4">
        {templates.map((template) => {
          const own = items.filter((i) => i.template_id === template.id);
          return (
            <Card key={template.id}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{template.name}</h3>
                <Badge>{template.event_type}</Badge>
                {template.is_builtin && <Badge tone="green">built-in</Badge>}
                {!template.is_builtin && (
                  <form action={deleteTemplate} className="ml-auto">
                    <input type="hidden" name="id" value={template.id} />
                    <ConfirmSubmit variant="danger">Delete template</ConfirmSubmit>
                  </form>
                )}
              </div>

              <ul className="mb-3 space-y-1">
                {own.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span>{item.title}</span>
                    {item.days_before_offset != null && (
                      <span className="text-xs text-ink-soft">
                        {item.days_before_offset}d before
                      </span>
                    )}
                    {item.notes && <span className="text-xs text-ink-soft">— {item.notes}</span>}
                    <form action={deleteTemplateItem} className="ml-auto">
                      <input type="hidden" name="id" value={item.id} />
                      <ConfirmSubmit className="rounded-lg px-2 py-1.5 text-xs text-bad-fg underline transition-colors hover:text-ink">
                        remove
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
                {own.length === 0 && <li className="text-sm text-ink-soft">No items yet.</li>}
              </ul>

              <form action={addTemplateItem} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="template_id" value={template.id} />
                <div className="min-w-[12rem] flex-1">
                  <Field label="Add item">
                    <Input name="title" required />
                  </Field>
                </div>
                <Field label="Days before">
                  <Input type="number" name="days_before_offset" min="0" className="w-24" />
                </Field>
                <Button type="submit" variant="secondary">
                  Add
                </Button>
              </form>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-ink-soft">
        &quot;Days before&quot; turns into a real due date when you create an event with a date set.
      </p>
    </>
  );
}
