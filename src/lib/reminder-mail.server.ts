/**
 * Email task_due / task_overdue notifications via Gmail SMTP.
 *
 * In-app rows are created by process_due_reminders() (often via pg_cron).
 * This module claims rows with email_sent_at IS NULL, sends mail, and clears
 * the claim on failure so the next cron can retry.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isMailConfigured, sendAppEmail } from "@/lib/mail.server";
import { appOriginFromEnv } from "@/lib/auth-api.server";

type Admin = SupabaseClient<Database>;

type PendingMailRow = {
  id: string;
  title: string;
  message: string | null;
  notification_type: string;
  recipient: { email: string } | null;
};

const MAIL_TYPES = ["task_due", "task_overdue"] as const;

export async function sendPendingReminderEmails(
  admin: Admin,
): Promise<{ sent: number; skipped: number; errors: number; claimed: number }> {
  if (!isMailConfigured()) {
    console.warn("[reminder-mail] SMTP not configured; skipping reminder emails");
    return { sent: 0, skipped: 0, errors: 0, claimed: 0 };
  }

  const { data, error } = await admin
    .from("notifications")
    .select(
      "id, title, message, notification_type, recipient:profiles!notifications_recipient_user_id_fkey(email)",
    )
    .in("notification_type", [...MAIL_TYPES])
    .is("email_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[reminder-mail] pending query", error);
    throw error;
  }

  const rows = (data ?? []) as PendingMailRow[];
  if (!rows.length) return { sent: 0, skipped: 0, errors: 0, claimed: 0 };

  const now = new Date().toISOString();
  const candidateIds = rows.map((r) => r.id);

  // Claim first so concurrent cron runners cannot double-send.
  const { data: claimedRows, error: claimError } = await admin
    .from("notifications")
    .update({ email_sent_at: now })
    .in("id", candidateIds)
    .is("email_sent_at", null)
    .select(
      "id, title, message, notification_type, recipient:profiles!notifications_recipient_user_id_fkey(email)",
    );

  if (claimError) {
    console.error("[reminder-mail] claim", claimError);
    throw claimError;
  }

  const claimed = (claimedRows ?? []) as PendingMailRow[];
  if (!claimed.length) return { sent: 0, skipped: 0, errors: 0, claimed: 0 };

  const origin = appOriginFromEnv();
  const tasksUrl = origin ? `${origin}/tasks` : "/tasks";
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const releaseIds: string[] = [];

  for (const row of claimed) {
    const email = (row.recipient?.email ?? "").trim();
    if (!email) {
      skipped += 1;
      continue;
    }

    const text = `${row.message ?? row.title}\n\nOpen tasks: ${tasksUrl}`;
    const html = `<p>${escapeHtml(row.message ?? row.title)}</p><p><a href="${escapeHtml(tasksUrl)}">Open your tasks</a></p>`;

    try {
      await sendAppEmail({
        to: email,
        subject: row.title,
        text,
        html,
      });
      sent += 1;
    } catch (e) {
      errors += 1;
      releaseIds.push(row.id);
      console.error("[reminder-mail] send failed", row.id, e);
    }
  }

  if (releaseIds.length) {
    const { error: releaseError } = await admin
      .from("notifications")
      .update({ email_sent_at: null })
      .in("id", releaseIds);
    if (releaseError) console.error("[reminder-mail] release claim", releaseError);
  }

  return { sent, skipped, errors, claimed: claimed.length };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
