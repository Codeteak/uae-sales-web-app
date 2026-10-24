import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageHeader, pageMeta, Empty } from "@/components/crm/page-header";
import { notificationsOptions } from "@/lib/crm-data";
import { errMsg, fmtDateTime, useMe } from "@/lib/crm";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => pageMeta("Notifications", "Reminders, assignments and approval updates."),
  loader: ({ context }) => context.queryClient.ensureQueryData(notificationsOptions),
  component: Page,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm text-danger">{error instanceof Error ? error.message : String(error)}</div>,
});

function Page() {
  const { data: notifications } = useSuspenseQuery(notificationsOptions);
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const mine = notifications.filter((n) => n.recipient_user_id === me?.user.id);
  const unread = mine.filter((n) => !n.read_at);

  async function markAll() {
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_user_id", me!.user.id).is("read_at", null);
    if (error) toast.error(errMsg(error));
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["unread"] });
  }

  async function open(id: string, leadId: string | null, read: boolean) {
    if (!read) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["unread"] });
    }
    if (leadId) navigate({ to: "/leads/$id", params: { id: leadId } });
  }

  return (
    <div>
      <PageHeader title="Notifications" sub={`${unread.length} unread`}>
        {unread.length > 0 && <Button variant="outline" onClick={markAll}><CheckCheck /> Mark all read</Button>}
      </PageHeader>
      {!mine.length ? <Empty>No notifications yet.</Empty> : (
        <div className="divide-y rounded-lg border bg-card">
          {mine.map((n) => (
            <button key={n.id} onClick={() => open(n.id, n.lead_id, !!n.read_at)} className={`block w-full p-4 text-left hover:bg-accent/30 ${n.read_at ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-2">
                {!n.read_at && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                <p className="flex-1 font-medium">{n.title}</p>
                <span className="text-xs text-muted-foreground">{fmtDateTime(n.created_at)}</span>
              </div>
              {n.message && <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>}
              {n.lead && <p className="mt-1 text-xs text-primary">{n.lead.reference} · {n.lead.lead_title}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
