"use client";

import { useState } from "react";

interface Task {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  isDone: boolean;
  assignee: string | null;
}

export function PublicChecklist({ token, tasks }: { token: string; tasks: Task[] }) {
  const [state, setState] = useState(tasks);
  const [failed, setFailed] = useState(false);

  async function toggle(task: Task) {
    const next = !task.isDone;
    // Optimistic — a checklist that lags behind the tap feels broken on mobile.
    setState((prev) => prev.map((t) => (t.id === task.id ? { ...t, isDone: next } : t)));
    setFailed(false);

    try {
      const res = await fetch(`/api/public/e/${token}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, isDone: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setState((prev) => prev.map((t) => (t.id === task.id ? { ...t, isDone: !next } : t)));
      setFailed(true);
    }
  }

  const done = state.filter((t) => t.isDone).length;

  if (state.length === 0) {
    return <p className="text-sm text-ink-soft">No tasks on this checklist yet.</p>;
  }

  return (
    <div>
      <p className="mb-3 text-sm text-ink-soft">
        {done} / {state.length} done
      </p>
      <ul className="space-y-2">
        {state.map((task) => (
          <li key={task.id} className="flex items-start gap-3 py-0.5">
            <button
              type="button"
              onClick={() => toggle(task)}
              aria-label={task.isDone ? "Mark not done" : "Mark done"}
              aria-pressed={task.isDone}
              className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center"
            >
              {/* 20px box, 44px target. */}
              <span
                className={`h-5 w-5 rounded border transition-colors ${
                  task.isDone ? "border-ok-solid bg-ok-solid" : "border-line-strong bg-surface"
                }`}
              />
            </button>
            <div>
              <p className={task.isDone ? "text-ink-faint line-through" : ""}>{task.title}</p>
              <p className="text-xs text-ink-soft">
                {[task.assignee, task.dueDate ? `due ${task.dueDate}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {task.notes && <p className="text-xs text-ink-soft">{task.notes}</p>}
            </div>
          </li>
        ))}
      </ul>
      {failed && (
        <p className="mt-3 rounded-lg border border-bad-border bg-bad-bg p-3 text-sm text-bad-fg">
          Could not save that — check your connection and try again.
        </p>
      )}
    </div>
  );
}
