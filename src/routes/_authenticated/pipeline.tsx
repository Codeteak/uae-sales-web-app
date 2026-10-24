import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, pageMeta, Empty } from "@/components/crm/page-header";
import { FollowUpBadge, PriorityBadge } from "@/components/crm/badges";
import { NativeSelect } from "@/components/crm/dialogs";
import { leadsOptions, money } from "@/lib/crm-data";
import { errMsg, useStages, type LeadRow } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => pageMeta("Pipeline", "Visual pipeline of all open opportunities by stage."),
  loader: ({ context }) => context.queryClient.ensureQueryData(leadsOptions),
  component: Page,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm text-danger">{error instanceof Error ? error.message : String(error)}</div>,
});

function Page() {
  const { data: leads } = useSuspenseQuery(leadsOptions);
  const { data: stages = [] } = useStages();
  const qc = useQueryClient();
  const open = leads.filter((l) => l.outcome === "open" && !l.archived_at);
  const openStages = stages.filter((s) => s.category === "open");

  async function move(lead: LeadRow, stageId: string) {
    if (stageId === lead.current_stage_id) return;
    const { data, error } = await supabase.from("leads").update({ current_stage_id: stageId }).eq("id", lead.id).eq("updated_at", lead.updated_at).select("id");
    if (error) toast.error(errMsg(error));
    else if (!data?.length) toast.error("This lead changed elsewhere. Refreshing…");
    else toast.success("Stage updated");
    qc.invalidateQueries();
  }

  return (
    <div>
      <PageHeader title="Pipeline" sub={`${open.length} open opportunities · ${money(open.reduce((s, l) => s + (l.estimated_value ?? 0), 0))} total value`} />
      {!openStages.length ? <Empty>No active stages configured.</Empty> : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {openStages.map((s) => {
            const cards = open.filter((l) => l.current_stage_id === s.id);
            return (
              <section key={s.id} className="w-72 shrink-0 rounded-xl border bg-muted/40 p-3">
                <header className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">{s.stage_name}</h2>
                  <span className="text-xs text-muted-foreground">{cards.length} · {money(cards.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0))}</span>
                </header>
                <div className="space-y-2">
                  {cards.map((l) => (
                    <article key={l.id} className="space-y-2 rounded-lg border bg-card p-3 shadow-card">
                      <Link to="/leads/$id" params={{ id: l.id }} className="text-sm font-semibold text-primary hover:underline">{l.lead_title}</Link>
                      <p className="text-xs text-muted-foreground">{l.company?.company_name} · {l.owner?.full_name}</p>
                      <div className="flex items-center justify-between">
                        <PriorityBadge p={l.priority} />
                        <span className="text-xs font-medium">{l.estimated_value != null ? money(l.estimated_value, l.currency ?? "AED") : ""}</span>
                      </div>
                      <FollowUpBadge lead={l} />
                      <NativeSelect aria-label={`Move ${l.lead_title}`} value={l.current_stage_id} onChange={(e) => move(l, e.target.value)} className="h-8 text-xs">
                        {openStages.map((st) => <option key={st.id} value={st.id}>{st.stage_name}</option>)}
                      </NativeSelect>
                    </article>
                  ))}
                  {!cards.length && <p className="px-1 py-4 text-center text-xs text-muted-foreground">No opportunities</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
