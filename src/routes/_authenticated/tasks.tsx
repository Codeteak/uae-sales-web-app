import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, pageMeta } from "@/components/crm/page-header";
import { TaskList } from "@/components/crm/task-list";
import { NativeSelect } from "@/components/crm/dialogs";
import { tasksOptions } from "@/lib/crm-data";
import { dubaiDayBounds, useMe } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => pageMeta("My tasks", "Your follow-up tasks and team reminders."),
  loader: ({ context }) => context.queryClient.ensureQueryData(tasksOptions),
  component: Page,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm text-danger">{error instanceof Error ? error.message : String(error)}</div>,
});

function Page() {
  const { data: tasks } = useSuspenseQuery(tasksOptions);
  const { data: me } = useMe();
  const [view, setView] = useState("mine");
  const [status, setStatus] = useState("pending");
  const now = new Date().toISOString();
  const { end } = dubaiDayBounds();
  const filtered = tasks.filter((t) =>
    (view === "all" || t.assigned_to === me?.user.id) &&
    (status === "all" || t.status === status)
  );
  const overdue = filtered.filter((t) => t.status === "pending" && t.due_at < now);
  const today = filtered.filter((t) => t.status === "pending" && t.due_at >= now && t.due_at < end);
  const upcoming = filtered.filter((t) => t.status === "pending" && t.due_at >= end);
  const done = filtered.filter((t) => t.status !== "pending");

  return (
    <div>
      <PageHeader title="My tasks" sub="Follow-ups and reminders assigned to you.">
        <NativeSelect aria-label="Whose tasks" className="w-40" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="mine">Assigned to me</option>
          <option value="all">Whole team</option>
        </NativeSelect>
        <NativeSelect aria-label="Task status" className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </NativeSelect>
      </PageHeader>
      {status === "pending" || status === "all" ? (
        <div className="space-y-6">
          <section><h2 className="mb-2 text-sm font-semibold text-danger">Overdue ({overdue.length})</h2><TaskList tasks={overdue} /></section>
          <section><h2 className="mb-2 text-sm font-semibold text-warning-foreground">Due today ({today.length})</h2><TaskList tasks={today} /></section>
          <section><h2 className="mb-2 text-sm font-semibold">Upcoming ({upcoming.length})</h2><TaskList tasks={upcoming} /></section>
          {status === "all" && <section><h2 className="mb-2 text-sm font-semibold text-muted-foreground">Closed ({done.length})</h2><TaskList tasks={done} /></section>}
        </div>
      ) : (
        <TaskList tasks={filtered} />
      )}
    </div>
  );
}
