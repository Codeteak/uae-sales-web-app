import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
export type { TablesUpdate } from "@/integrations/supabase/types";

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Lead = Tables<"leads">;
export type Stage = Tables<"pipeline_stages">;
export type Profile = Tables<"profiles">;
export type Task = Tables<"tasks">;
export type Contact = Tables<"contacts">;
export type Company = Tables<"companies">;
export type Activity = Tables<"activities">;
export type Priority = Database["public"]["Enums"]["lead_priority"];
export type ContactRole = Database["public"]["Enums"]["contact_role"];

export const APP_TZ = "Asia/Dubai";
export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
export const CONTACT_ROLES: { value: ContactRole; label: string }[] = [
  { value: "decision_maker", label: "Decision-maker" },
  { value: "purchasing_manager", label: "Purchasing manager" },
  { value: "buyer", label: "Buyer" },
  { value: "influencer", label: "Influencer" },
  { value: "assistant", label: "Assistant" },
  { value: "other", label: "Other" },
];
export const LEAD_SOURCES = [
  "Referral",
  "Website",
  "Cold call",
  "Exhibition",
  "LinkedIn",
  "Existing customer",
  "Other",
];

export function fmtDateTime(v?: string | null, tz = APP_TZ) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
}
export function fmtDate(v?: string | null, tz = APP_TZ) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(v));
}

/** Dubai has a fixed UTC+4 offset (no DST). Convert a datetime-local value to ISO UTC. */
export function localInputToIso(v: string): string | null {
  if (!v) return null;
  return new Date(v + ":00+04:00").toISOString();
}
export function isoToLocalInput(v?: string | null): string {
  if (!v) return "";
  const d = new Date(new Date(v).getTime() + 4 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** Start/end of "today" in Dubai, as UTC ISO strings. */
export function dubaiDayBounds(offsetDays = 0) {
  const now = new Date(Date.now() + 4 * 3600_000);
  const y = now.getUTCFullYear(),
    m = now.getUTCMonth(),
    d = now.getUTCDate() + offsetDays;
  const start = new Date(Date.UTC(y, m, d) - 4 * 3600_000);
  const end = new Date(start.getTime() + 24 * 3600_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return "Something went wrong";
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      return {
        user: u.user,
        profile,
        isAdmin: !!roles?.some((r) => r.role === "admin") && profile?.account_status === "active",
      };
    },
    staleTime: 60_000,
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

export function useActiveUsers() {
  const q = useUsers();
  return { ...q, data: q.data?.filter((u) => u.account_status === "active") };
}

export function useStages(includeInactive = false) {
  return useQuery({
    queryKey: ["stages", includeInactive],
    queryFn: async () => {
      let q = supabase.from("pipeline_stages").select("*").order("position");
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

export function useLostReasons() {
  return useQuery({
    queryKey: ["lost_reasons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lost_reasons")
        .select("*")
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return data;
    },
  });
}

export const LEAD_LIST_SELECT =
  "*, company:companies(id, company_name), stage:pipeline_stages(id, stage_name, category, position), owner:profiles!leads_assigned_user_id_fkey(id, full_name), lead_contacts(is_primary, contact:contacts(id, full_name, phone_number, email))";

export type LeadRow = Lead & {
  company: { id: string; company_name: string } | null;
  stage: { id: string; stage_name: string; category: string; position: number } | null;
  owner: { id: string; full_name: string } | null;
  lead_contacts: {
    is_primary: boolean;
    contact: { id: string; full_name: string; phone_number: string | null; email: string | null } | null;
  }[];
};

export function primaryContact(l: LeadRow) {
  const pc = l.lead_contacts?.find((c) => c.is_primary) ?? l.lead_contacts?.[0];
  return pc?.contact ?? null;
}

export function followUpState(l: Pick<Lead, "next_follow_up_at" | "outcome">) {
  if (l.outcome !== "open") return "closed" as const;
  if (!l.next_follow_up_at) return "missing" as const;
  const t = new Date(l.next_follow_up_at).getTime();
  if (t < Date.now()) return "overdue" as const;
  const { end } = dubaiDayBounds();
  if (t < new Date(end).getTime()) return "today" as const;
  return "scheduled" as const;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0] ?? {});
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cur = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function downloadFile(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const normText = (t?: string | null) => (t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
export const normPhone = (t?: string | null) => (t ?? "").replace(/[^0-9]/g, "").slice(-9);
