import { createClient } from "@/lib/supabase/server";
import { addPerson, deletePerson, togglePersonActive } from "@/lib/actions";
import { Button, Card, Empty, Field, Input, PageHeader } from "@/components/ui";
import type { Person } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const supabase = await createClient();
  const { data } = await supabase.from("people").select("*").order("display_name");
  const people = (data ?? []) as Person[];

  return (
    <>
      <PageHeader
        title="Roster"
        subtitle="Your regular crew. Friends pick their own name from this list on a share link — no signup."
      />

      <Card className="mb-6">
        <form action={addPerson} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <Field label="Name">
              <Input name="display_name" required placeholder="e.g. Wei Jie" />
            </Field>
          </div>
          <Button type="submit">Add to roster</Button>
        </form>
      </Card>

      {people.length === 0 ? (
        <Empty>No one on the roster yet. Add your regulars above.</Empty>
      ) : (
        <div className="space-y-2">
          {people.map((person) => (
            <Card key={person.id} className="flex flex-wrap items-center gap-3">
              <span className={person.is_active ? "font-medium" : "text-slate-400 line-through"}>
                {person.display_name}
              </span>
              <div className="ml-auto flex gap-2">
                <form action={togglePersonActive}>
                  <input type="hidden" name="id" value={person.id} />
                  <input type="hidden" name="is_active" value={String(!person.is_active)} />
                  <Button type="submit" variant="secondary">
                    {person.is_active ? "Set inactive" : "Reactivate"}
                  </Button>
                </form>
                <form action={deletePerson}>
                  <input type="hidden" name="id" value={person.id} />
                  <Button type="submit" variant="danger">
                    Delete
                  </Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Setting someone inactive hides them from new polls but keeps their past answers. Deleting
        removes their availability and attendance history too.
      </p>
    </>
  );
}
