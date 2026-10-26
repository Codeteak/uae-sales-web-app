import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/cron-guard";

export const Route = createFileRoute("/api/cron/reminders")({
  server: {
    handlers: {
      GET: ({ request }) => runReminders(request),
      POST: ({ request }) => runReminders(request),
    },
  },
});

async function runReminders(request: Request): Promise<Response> {
  const denied = await guardCronRequest(request);
  if (denied) return denied;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("process_due_reminders");
    if (error) {
      console.error("[cron/reminders]", error);
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true, processed: data ?? 0 });
  } catch (e) {
    console.error("[cron/reminders]", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Reminder run failed" },
      { status: 500 },
    );
  }
}
