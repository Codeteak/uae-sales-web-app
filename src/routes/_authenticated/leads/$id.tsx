import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Bell, CheckCircle2, Pencil, PhoneCall, Plus, Star, Trash2, Trophy, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, pageMeta, Card, Empty } from "@/components/crm/page-header";
import { FollowUpBadge, OutcomeBadge, PriorityBadge } from "@/components/crm/badges";
import { ActivityDialog, ContactDialog, Field, LostDialog, NativeSelect, TaskDialog } from "@/components/crm/dialogs";
import { TaskList } from "@/components/crm/task-list";
import { leadActivitiesOptions, leadOptions, leadTasksOptions, money } from "@/lib/crm-data";
import { CONTACT_ROLES, LEAD_SOURCES, PRIORITIES, errMsg, fmtDateTime, isoToLocalInput, localInputToIso, useActiveUsers, useMe, useStages, type LeadRow, type Priority, type TablesUpdate } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  head: () => pageMeta("Lead details", "Opportunity details, contacts, tasks and activity history."),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(leadOptions(params.id));
    } catch {
      throw notFound();
    }
  },
  component: Page,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm text-danger">{error instanceof Error ? error.message : String(error)}</div>,
  notFoundComponent: () => <Empty>Opportunity not found. <Link to="/leads" className="text-primary underline">Back to all leads</Link></Empty>,
});

function Page() {
  const { id } = Route.useParams();
  const { data: lead } = useSuspenseQuery(leadOptions(id));
  const { data: activities = [] } = useSuspenseQuery(leadActivitiesOptions(id));
  const { data: tasks = [] } = useSuspenseQuery(leadTasksOptions(id));
  const { data: me } = useMe();
  const { data: users = [] } = useActiveUsers();
  const { data: stages = [] } = useStages(true);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [lost, setLost] = useState<"lost" | "disqualified" | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const inv = () => qc.invalidateQueries();

  const contacts = lead.lead_contacts.flatMap((lc) =>
    lc.contact ? [{ ...lc.contact, is_primary: lc.is_primary }] : [],
  );

  async function update(patch: TablesUpdate<"leads">, success = "Saved") {
    const { data, error } = await supabase.from("leads").update(patch).eq("id", lead.id).eq("updated_at", lead.updated_at).select("id");
    if (error) { toast.error(errMsg(error)); return false; }
    if (!data?.length) { toast.error("Someone else updated this lead. Refreshing…"); inv(); return false; }
    toast.success(success);
    inv();
    return true;
  }

  async function setStage(stageId: string) {
    const st = stages.find((s) => s.id === stageId);
    if (!st) return;
    if (st.category === "lost") { setLost(st.stage_name.toLowerCase().includes("disqual") ? "disqualified" : "lost"); return; }
    await update({ current_stage_id: stageId, outcome: st.category === "won" ? "won" : "open", outcome_reason: null }, st.category === "won" ? "Marked as won" : "Stage updated");
  }

  async function confirmLost(reason: string) {
    if (!lost) return;
    const st = stages.find((s) => s.category === "lost" && (lost === "disqualified") === s.stage_name.toLowerCase().includes("disqual")) ?? stages.find((s) => s.category === "lost");
    if (st && (await update({ current_stage_id: st.id, outcome: lost, outcome_reason: reason }, `Marked as ${lost}`))) setLost(null);
  }

  async function toggleArchive() {
    const patch = lead.archived_at ? { archived_at: null } : { archived_at: new Date().toISOString() };
    await update(patch, lead.archived_at ? "Lead restored" : "Lead archived");
  }

  async function setPrimary(contactId: string) {
    const { error } = await supabase.rpc("set_lead_primary_contact", {
      p_lead_id: lead.id,
      p_contact_id: contactId,
    });
    if (error) toast.error(errMsg(error));
    else {
      toast.success("Primary contact updated");
      inv();
    }
  }

  async function unlink(contactId: string) {
    if (!window.confirm("Remove this contact from the opportunity?")) return;
    const { error } = await supabase.from("lead_contacts").delete().eq("lead_id", lead.id).eq("contact_id", contactId);
    if (error) toast.error(errMsg(error)); else inv();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead.lead_title}
        sub={`${lead.reference} · ${lead.company?.company_name ?? ""} · created ${fmtDateTime(lead.created_at)}`}
      >
        <Button variant="outline" onClick={() => setLogOpen(true)}><PhoneCall /> Log activity</Button>
        <Button variant="outline" onClick={() => setTaskOpen(true)}><Plus /> Follow-up task</Button>
        <Button variant="outline" onClick={() => setRemindOpen(true)}><Bell /> Remind colleague</Button>
        {lead.outcome === "open" && !lead.archived_at && (
          <>
            <Button
              variant="outline"
              className="text-success"
              onClick={() => {
                const w = stages.find((s) => s.category === "won" && s.is_active);
                if (!w) {
                  toast.error("No active Won stage is configured. Ask an admin to add one.");
                  return;
                }
                void setStage(w.id);
              }}
            >
              <Trophy /> Won
            </Button>
            <Button variant="outline" className="text-danger" onClick={() => setLost("lost")}><XCircle /> Lost</Button>
          </>
        )}
        {me?.isAdmin && (
          <Button variant="ghost" onClick={toggleArchive}>
            {lead.archived_at ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}
          </Button>
        )}
      </PageHeader>

      {lead.archived_at && <div className="rounded-md bg-muted p-3 text-sm">This opportunity is archived (hidden from default lists).</div>}

      <div className="flex flex-wrap items-center gap-2">
        <OutcomeBadge o={lead.outcome} />
        <PriorityBadge p={lead.priority} />
        <FollowUpBadge lead={lead} />
        {lead.outcome_reason && <span className="text-sm text-muted-foreground">Reason: {lead.outcome_reason}</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details" action={<Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}><Pencil /> {editing ? "Close" : "Edit"}</Button>}>
            {editing ? (
              <EditForm lead={lead} stages={stages} users={users} onStage={setStage} onSave={async (p) => { if (await update(p)) setEditing(false); }} />
            ) : (
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Stage</dt><dd className="font-medium">{lead.stage?.stage_name}</dd></div>
                <div><dt className="text-muted-foreground">Salesperson</dt><dd className="font-medium">{lead.owner?.full_name}</dd></div>
                <div><dt className="text-muted-foreground">Source</dt><dd>{lead.lead_source ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Estimated value</dt><dd>{lead.estimated_value != null ? money(lead.estimated_value, lead.currency ?? "AED") : "—"}</dd></div>
                <div><dt className="text-muted-foreground">Expected close</dt><dd>{lead.expected_close_date ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Last customer contact</dt><dd>{fmtDateTime(lead.last_customer_contact_at)}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted-foreground">Next action</dt><dd className="whitespace-pre-wrap">{lead.next_action ?? "—"}</dd></div>
              </dl>
            )}
          </Card>

          <Card title="Contacts" action={<Button variant="ghost" size="sm" onClick={() => setContactOpen(true)}><Plus /> Add contact</Button>}>
            {!contacts.length ? <Empty>No contacts linked yet.</Empty> : (
              <div className="divide-y">
                {contacts.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.full_name} {c.is_primary && <Star className="inline size-3 fill-warning text-warning" />}</p>
                      <p className="text-xs text-muted-foreground">{CONTACT_ROLES.find((r) => r.value === c.contact_role)?.label} · {c.phone_number ?? "no phone"} · {c.email ?? "no email"}</p>
                    </div>
                    {!c.is_primary && <Button variant="ghost" size="sm" onClick={() => setPrimary(c.id)}>Make primary</Button>}
                    <Button variant="ghost" size="icon" aria-label={`Remove ${c.full_name}`} onClick={() => unlink(c.id)}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Follow-up tasks">
            <TaskList tasks={tasks.map((t) => ({ ...t, lead: { id: lead.id, lead_title: lead.lead_title, reference: lead.reference } }))} />
          </Card>
        </div>

        <Card title="Activity timeline" className="self-start">
          {!activities.length ? <Empty>No activity yet.</Empty> : (
            <ol className="relative space-y-4 border-l pl-4">
              {activities.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 size-2 rounded-full bg-primary" />
                  <p className="font-medium">{a.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.activity_type} · {a.actor?.full_name ?? "System"} · {fmtDateTime(a.occurred_at)}{a.contact ? ` · ${a.contact.full_name}` : ""}
                  </p>
                  {a.details && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{a.details}</p>}
                  {a.outcome && <p className="mt-1 text-xs">Outcome: {a.outcome}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <ActivityDialog open={logOpen} onOpenChange={setLogOpen} leadId={lead.id} contacts={contacts} />
      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} leadId={lead.id} contacts={contacts} />
      <TaskDialog open={remindOpen} onOpenChange={setRemindOpen} leadId={lead.id} contacts={contacts} internal />
      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} companyId={lead.company_id} leadId={lead.id} />
      <LostDialog open={!!lost} onOpenChange={(o) => { if (!o) setLost(null); }} outcome={lost ?? "lost"} onConfirm={confirmLost} />
    </div>
  );
}

function EditForm({ lead, stages, users, onStage, onSave }: { lead: LeadRow; stages: ReturnType<typeof useStages>["data"] & object[]; users: { id: string; full_name: string }[]; onStage: (id: string) => void; onSave: (p: Record<string, unknown>) => void }) {
  const { data: me } = useMe();
  const tz = me?.profile?.timezone || "Asia/Dubai";
  const [f, setF] = useState({
    lead_title: lead.lead_title,
    lead_source: lead.lead_source ?? "",
    priority: lead.priority,
    assigned_user_id: lead.assigned_user_id,
    next_action: lead.next_action ?? "",
    follow_up: isoToLocalInput(lead.next_follow_up_at, tz),
    expected_close_date: lead.expected_close_date ?? "",
    estimated_value: lead.estimated_value?.toString() ?? "",
    currency: lead.currency ?? "AED",
  });
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSave({
      lead_title: f.lead_title.trim(),
      lead_source: f.lead_source || null,
      priority: f.priority,
      assigned_user_id: f.assigned_user_id,
      next_action: f.next_action.trim() || null,
      next_follow_up_at: localInputToIso(f.follow_up, tz),
      expected_close_date: f.expected_close_date || null,
      estimated_value: f.estimated_value ? Number(f.estimated_value) : null,
      currency: f.currency,
    }); }}>
      <Field label="Title"><Input required value={f.lead_title} onChange={(e) => setF({ ...f, lead_title: e.target.value })} /></Field>
      <Field label="Stage">
        <NativeSelect value={lead.current_stage_id} onChange={(e) => onStage(e.target.value)}>
          {(stages ?? []).map((s) => <option key={s.id} value={s.id} disabled={!s.is_active && s.id !== lead.current_stage_id}>{s.stage_name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Salesperson">
        <NativeSelect value={f.assigned_user_id} onChange={(e) => setF({ ...f, assigned_user_id: e.target.value })}>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Priority">
        <NativeSelect value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</NativeSelect>
      </Field>
      <Field label="Source">
        <NativeSelect value={f.lead_source} onChange={(e) => setF({ ...f, lead_source: e.target.value })}>
          <option value="">Not specified</option>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
        </NativeSelect>
      </Field>
      <Field label={`Follow-up (${tz})`}><Input type="datetime-local" value={f.follow_up} onChange={(e) => setF({ ...f, follow_up: e.target.value })} /></Field>
      <Field label="Estimated value"><Input type="number" min="0" value={f.estimated_value} onChange={(e) => setF({ ...f, estimated_value: e.target.value })} /></Field>
      <Field label="Currency"><Input value={f.currency} maxLength={3} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
      <Field label="Expected close date"><Input type="date" value={f.expected_close_date} onChange={(e) => setF({ ...f, expected_close_date: e.target.value })} /></Field>
      <div className="sm:col-span-2"><Field label="Next action"><Textarea value={f.next_action} onChange={(e) => setF({ ...f, next_action: e.target.value })} /></Field></div>
      <div className="flex gap-2 sm:col-span-2"><Button type="submit"><CheckCircle2 /> Save changes</Button></div>
    </form>
  );
}
