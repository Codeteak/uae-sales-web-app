import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTACT_ROLES,
  PRIORITIES,
  errMsg,
  isoToLocalInput,
  localInputToIso,
  useActiveUsers,
  useLostReasons,
  useMe,
  type ContactRole,
  type Priority,
  type Task,
} from "@/lib/crm";

export function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        "h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring " +
        (props.className ?? "")
      }
    />
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["lead", "leads", "tasks", "activities", "dashboard", "contacts", "companies"])
      qc.invalidateQueries({ queryKey: [k] });
  };
}

export function TaskDialog({
  open,
  onOpenChange,
  leadId,
  task,
  contacts = [],
  internal = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  task?: Task;
  contacts?: { id: string; full_name: string }[];
  internal?: boolean;
}) {
  const { data: me } = useMe();
  const { data: users = [] } = useActiveUsers();
  const inv = useInvalidate();
  const tz = me?.profile?.timezone || "Asia/Dubai";
  const [f, setF] = useState(() => ({
    title: task?.title ?? (internal ? "Follow up on this opportunity" : ""),
    description: task?.description ?? "",
    assigned_to: task?.assigned_to ?? "",
    due: isoToLocalInput(task?.due_at, tz),
    priority: (task?.priority ?? "medium") as Priority,
    contact_id: task?.contact_id ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const assignee = f.assigned_to || me?.user.id || "";

  async function save() {
    if (!f.title.trim()) { toast.error("Title is required"); return; }
    const due = localInputToIso(f.due, tz);
    if (!due) { toast.error("Due date and time are required"); return; }
    setBusy(true);
    const payload = {
      title: f.title.trim().slice(0, 200),
      description: f.description.trim() || null,
      assigned_to: assignee,
      due_at: due,
      priority: f.priority,
      contact_id: f.contact_id || null,
    };
    const { data, error } = task
      ? await supabase.from("tasks").update(payload).eq("id", task.id).eq("updated_at", task.updated_at).select('id')
      : await supabase.from("tasks").insert({ ...payload, lead_id: leadId, is_internal_reminder: internal }).select('id');
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    if (!data?.length) { toast.error('Task changed. Refreshing…'); inv(); onOpenChange(false); return; }
    toast.success(task ? "Task updated" : internal ? "Reminder sent" : "Task scheduled");
    inv();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit / reschedule task" : internal ? "Remind a colleague" : "Schedule follow-up"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={internal ? "Required action" : "Title"}>
            <Input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assign to">
              <NativeSelect value={assignee} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
                {users
                  .filter((u) => !internal || u.id !== me?.user.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name}{u.id === me?.user.id ? " (me)" : ""}</option>
                  ))}
                {internal && !users.some((u) => u.id !== me?.user.id) && <option value="">No colleagues yet</option>}
              </NativeSelect>
            </Field>
            <Field label={`Due (${tz})`}>
              <Input type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
            </Field>
            <Field label="Priority">
              <NativeSelect value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Contact (optional)">
              <NativeSelect value={f.contact_id} onChange={(e) => setF({ ...f, contact_id: e.target.value })}>
                <option value="">—</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Description">
            <Textarea value={f.description} maxLength={2000} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || (internal && (!assignee || assignee === me?.user.id))}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteTaskDialog({ task, onOpenChange }: { task: Task | null; onOpenChange: (o: boolean) => void }) {
  const [notes, setNotes] = useState("");
  const inv = useInvalidate();
  async function done() {
    if (!task) return;
    const { data, error } = await supabase
      .from("tasks")
      .update({ status: "completed", completion_notes: notes.trim() || null })
      .eq("id", task.id)
      .eq("status", "pending").eq('updated_at', task.updated_at).select('id');
    if (error) { toast.error(errMsg(error)); return; }
    if (!data?.length) { toast.error('Task changed. Refreshing…'); inv(); onOpenChange(false); return; }
    toast.success("Task completed");
    setNotes("");
    inv();
    onOpenChange(false);
  }
  return (
    <Dialog open={!!task} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Complete: {task?.title}</DialogTitle></DialogHeader>
        <Field label="Outcome notes">
          <Textarea value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="What happened?" />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={done}>Mark complete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export async function cancelTask(id: string, updatedAt?: string) {
  let query = supabase.from("tasks").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
  if (updatedAt) query = query.eq("updated_at", updatedAt);
  const { data, error } = await query.select("id");
  if (error) toast.error(errMsg(error));
  else if (!data?.length) toast.error("Task is no longer pending. Refresh the list.");
  else toast.success("Task cancelled");
  return !error && !!data?.length;
}

const ACT_TYPES = [
  { v: "call", l: "Call" },
  { v: "meeting", l: "Meeting" },
  { v: "email", l: "Email" },
  { v: "message", l: "Message" },
  { v: "note", l: "Internal note" },
  { v: "other", l: "Other" },
] as const;

export function ActivityDialog({
  open,
  onOpenChange,
  leadId,
  contacts,
  defaultType = "call",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  contacts: { id: string; full_name: string }[];
  defaultType?: (typeof ACT_TYPES)[number]["v"];
}) {
  const { data: me } = useMe();
  const { data: users = [] } = useActiveUsers();
  const inv = useInvalidate();
  const tz = me?.profile?.timezone || "Asia/Dubai";
  const [f, setF] = useState({ type: defaultType, summary: "", details: "", outcome: "", contact_id: "", when: "" });
  const [mentions, setMentions] = useState<string[]>([]);
  async function save() {
    if (!f.summary.trim()) { toast.error("Summary is required"); return; }
    if (!me) return;
    const { error } = await supabase.rpc("log_crm_activity", {
      payload: {
        lead_id: leadId,
        activity_type: f.type,
        summary: f.summary.trim().slice(0, 300),
        details: f.details.trim() || null,
        outcome: f.outcome.trim() || null,
        contact_id: f.contact_id || null,
        occurred_at: localInputToIso(f.when, tz) ?? new Date().toISOString(),
      },
      mentioned_users: mentions.filter((id) => id !== me.user.id),
    });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Activity logged");
    setF({ type: defaultType, summary: "", details: "", outcome: "", contact_id: "", when: "" });
    setMentions([]);
    inv();
    onOpenChange(false);
  }
  const colleagues = users.filter((u) => u.id !== me?.user.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Log activity</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <NativeSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}>
                {ACT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Contact">
              <NativeSelect value={f.contact_id} onChange={(e) => setF({ ...f, contact_id: e.target.value })}>
                <option value="">—</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Summary">
            <Input value={f.summary} maxLength={300} onChange={(e) => setF({ ...f, summary: e.target.value })} />
          </Field>
          <Field label="Details">
            <Textarea value={f.details} maxLength={4000} onChange={(e) => setF({ ...f, details: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Outcome">
              <Input value={f.outcome} maxLength={300} onChange={(e) => setF({ ...f, outcome: e.target.value })} />
            </Field>
            <Field label={`When (${tz}; blank = now)`}>
              <Input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} />
            </Field>
          </div>
          {colleagues.length > 0 && (
            <Field label="Mention colleagues (optional)">
              <div className="max-h-28 space-y-1 overflow-auto rounded-md border p-2 text-sm">
                {colleagues.map((u) => (
                  <label key={u.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={mentions.includes(u.id)}
                      onChange={(e) =>
                        setMentions((prev) =>
                          e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                        )
                      }
                    />
                    {u.full_name}
                  </label>
                ))}
              </div>
            </Field>
          )}
          {f.type === "note" && <p className="text-xs text-muted-foreground">Internal notes do not count as customer contact.</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LostDialog({
  open,
  onOpenChange,
  onConfirm,
  outcome = "lost",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
  outcome?: "lost" | "disqualified";
}) {
  const { data: reasons = [] } = useLostReasons();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  async function go() {
    if (!reason) { toast.error("Select a reason"); return; }
    if (reason === "Other" && !notes.trim()) { toast.error("Describe the reason"); return; }
    await onConfirm(notes.trim() ? `${reason}: ${notes.trim()}` : reason);
    setReason("");
    setNotes("");
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mark as {outcome}</DialogTitle></DialogHeader>
        <Field label="Reason (required)">
          <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select…</option>
            {reasons.map((r) => <option key={r.id} value={r.label}>{r.label}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Notes">
          <Textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={go}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContactDialog({
  open,
  onOpenChange,
  companyId,
  leadId,
  contact,
  companies,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  leadId?: string;
  contact?: { id: string; updated_at?: string; full_name: string; job_title: string | null; department: string | null; phone_number: string | null; email: string | null; contact_role: ContactRole; notes: string | null };
  companies?: { id: string; company_name: string }[];
}) {
  const inv = useInvalidate();
  const [selectedCompany, setSelectedCompany] = useState(companyId);
  const [f, setF] = useState({
    full_name: contact?.full_name ?? "",
    job_title: contact?.job_title ?? "",
    department: contact?.department ?? "",
    phone_number: contact?.phone_number ?? "",
    email: contact?.email ?? "",
    contact_role: (contact?.contact_role ?? "other") as ContactRole,
    notes: contact?.notes ?? "",
  });
  const [dupes, setDupes] = useState<string[]>([]);
  const effectiveCompanyId = contact ? companyId : selectedCompany || companyId;
  async function checkDupes() {
    const ors: string[] = [];
    const ph = f.phone_number.replace(/[^0-9]/g, "").slice(-9);
    if (ph.length >= 7) ors.push(`phone_norm.eq.${ph}`);
    if (f.email.trim()) ors.push(`email_norm.eq.${f.email.trim().toLowerCase()}`);
    if (!ors.length) { setDupes([]); return; }
    const { data } = await supabase.from("contacts").select("id, full_name, email, phone_number").or(ors.join(","));
    setDupes((data ?? []).filter((d) => d.id !== contact?.id).map((d) => `${d.full_name} (${d.email ?? d.phone_number})`));
  }
  async function save() {
    if (!effectiveCompanyId) { toast.error("Select a company first"); return; }
    if (!f.full_name.trim()) { toast.error("Name is required"); return; }
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) { toast.error("Invalid email"); return; }
    const payload = {
      full_name: f.full_name.trim(),
      job_title: f.job_title.trim() || null,
      department: f.department.trim() || null,
      phone_number: f.phone_number.trim() || null,
      email: f.email.trim() || null,
      contact_role: f.contact_role,
      notes: f.notes.trim() || null,
    };
    if (contact) {
      let query = supabase.from("contacts").update(payload).eq("id", contact.id);
      if (contact.updated_at) query = query.eq("updated_at", contact.updated_at);
      const { data, error } = await query.select("id");
      if (error) { toast.error(errMsg(error)); return; }
      if (!data?.length) { toast.error("Contact changed. Refreshing…"); inv(); onOpenChange(false); return; }
    } else if (leadId) {
      const { error } = await supabase.rpc("save_lead_contact", {
        p_lead_id: leadId,
        payload: { ...payload, job_title: payload.job_title, department: payload.department, notes: payload.notes },
      });
      if (error) { toast.error(errMsg(error)); return; }
    } else {
      const { error } = await supabase.from("contacts").insert({ ...payload, company_id: effectiveCompanyId }).select("id").single();
      if (error) { toast.error(errMsg(error)); return; }
    }
    toast.success("Contact saved");
    inv();
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {!contact && !companyId && companies && (
            <Field label="Company">
              <NativeSelect value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} className="sm:col-span-2">
                <option value="">Select company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Full name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Role">
            <NativeSelect value={f.contact_role} onChange={(e) => setF({ ...f, contact_role: e.target.value as ContactRole })}>
              {CONTACT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Job title"><Input value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} /></Field>
          <Field label="Department"><Input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone_number} onBlur={checkDupes} onChange={(e) => setF({ ...f, phone_number: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onBlur={checkDupes} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {dupes.length > 0 && (
          <div className="rounded-md bg-warning-soft p-3 text-sm text-warning-foreground">
            Possible duplicate: {dupes.join(", ")}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
