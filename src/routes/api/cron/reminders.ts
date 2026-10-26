import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/cron-guard";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

export const Route = createFileRoute("/api/cron/reminders")({
  server: {
    handlers: {
      GET: ({ request }) => runReminders(request),
      POST: ({ request }) => runReminders(request),
    },
  },
});

async function runReminders(request: Request): Promise<Response> {
  const ip = clientIp(request);

  // Auth first so unauthenticated callers cannot burn the success quota.
  const denied = await guardCronRequest(request);
  if (denied) {
    const failLimited = enforceRateLimit(`cron:reminders:unauth:${ip}`, 30, 15 * 60 * 1000);
    return failLimited ?? denied;
  }

  const limited = enforceRateLimit(`cron:reminders:ok:${ip}`, 60, 60 * 60 * 1000);
  if (limited) return limited;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPendingReminderEmails } = await import("@/lib/reminder-mail.server");

    // Backup / same processor as pg_cron — creates in-app notifications when due.
    const { data, error } = await supabaseAdmin.rpc("process_due_reminders");
    if (error) {
      console.error("[cron/reminders]", error);
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Email any task_due / task_overdue rows not yet mailed (including those
    // created earlier by pg_cron while this HTTP job was idle).
    const mail = await sendPendingReminderEmails(supabaseAdmin);
    return Response.json({ ok: true, processed: data ?? 0, email: mail });
  } catch (e) {
    console.error("[cron/reminders]", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Reminder run failed" },
      { status: 500 },
    );
  }
}
