import { createClient } from "@/lib/supabase/server";
import { addPerson, deleteGroup, deletePerson, togglePersonActive } from "@/lib/actions";
import { Button, Card, Empty, Field, Input, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { GroupEditor } from "@/components/GroupEditor";
import type { Person, RosterGroup } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const supabase = await createClient();
  const [{ data }, { data: groupData }, { data: memberData }] = await Promise.all([
    supabase.from("people").select("*").order("display_name"),
    supabase.from("roster_groups").select("*").order("name"),
    supabase.from("roster_group_members").select("*"),
  ]);
  const people = (data ?? []) as Person[];
  const activePeople = people.filter((p) => p.is_active);
  const groups = (groupData ?? []) as RosterGroup[];

  const membersByGroup = new Map<string, string[]>();
  for (const m of memberData ?? []) {
    const gid = m.group_id as string;
    membersByGroup.set(gid, [...(membersByGroup.get(gid) ?? []), m.person_id as string]);
  }
  const nameById = new Map(people.map((p) => [p.id, p.display_name]));

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
              <span className={person.is_active ? "font-medium" : "text-ink-faint line-through"}>
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
                  <ConfirmSubmit variant="danger">Delete</ConfirmSubmit>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-ink-soft">
        Setting someone inactive hides them from new polls but keeps their past answers. Deleting
        removes their availability and attendance history too.
      </p>

      <section className="mt-10">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Groups
        </h2>
        <p className="mb-3 text-sm text-ink-muted">
          Address a poll to a group instead of the whole roster. The members are copied onto the
          poll when you create it, so editing a group later never changes who a running poll was
          sent to.
        </p>

        <Card className="mb-4">
          <h3 className="font-medium">New group</h3>
          <GroupEditor people={activePeople} />
        </Card>

        {groups.length === 0 ? (
          <Empty>No groups yet.</Empty>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const members = membersByGroup.get(group.id) ?? [];
              return (
                <Card key={group.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{group.name}</span>
                      <span className="ml-2 text-xs text-ink-soft">
                        {members.length} {members.length === 1 ? "person" : "people"}
                      </span>
                    </div>
                    <form action={deleteGroup}>
                      <input type="hidden" name="id" value={group.id} />
                      <ConfirmSubmit variant="danger">Delete group</ConfirmSubmit>
                    </form>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    {members.length
                      ? members.map((id) => nameById.get(id) ?? id).join(", ")
                      : "Nobody in this group yet."}
                  </p>
                  <GroupEditor people={activePeople} group={group} members={members} />
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
