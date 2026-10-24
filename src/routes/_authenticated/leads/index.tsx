import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, pageMeta } from "@/components/crm/page-header";
import { LeadTable } from "@/components/crm/lead-table";
import { leadsOptions, money } from "@/lib/crm-data";
import { downloadFile, fmtDateTime, primaryContact, toCsv } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => pageMeta("All leads", "All leads in your team's shared sales CRM."),
  loader: ({ context }) => context.queryClient.ensureQueryData(leadsOptions),
  component: Page,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm text-danger">{error instanceof Error ? error.message : String(error)}</div>,
});

function Page() {
  const { data: leads } = useSuspenseQuery(leadsOptions);
  function exportCsv() {
    const rows = leads.map((l) => ({
      reference: l.reference,
      title: l.lead_title,
      company: l.company?.company_name,
      contact: primaryContact(l)?.full_name,
      phone: primaryContact(l)?.phone_number,
      email: primaryContact(l)?.email,
      stage: l.stage?.stage_name,
      outcome: l.outcome,
      priority: l.priority,
      owner: l.owner?.full_name,
      source: l.lead_source,
      value: l.estimated_value,
      currency: l.currency,
      next_action: l.next_action,
      next_follow_up: fmtDateTime(l.next_follow_up_at),
      last_customer_contact: fmtDateTime(l.last_customer_contact_at),
      created: fmtDateTime(l.created_at),
      updated: fmtDateTime(l.updated_at),
      archived: l.archived_at ? "yes" : "no",
    }));
    downloadFile(`leads-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }
  return (
    <div>
      <PageHeader title="All leads" sub={`${leads.length} opportunities · open pipeline value ${money(leads.filter((l) => l.outcome === "open" && !l.archived_at).reduce((s, l) => s + (l.estimated_value ?? 0), 0))}`}>
        <Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>
        <Button asChild><Link to="/leads/new"><Plus /> New lead</Link></Button>
      </PageHeader>
      <LeadTable leads={leads} />
    </div>
  );
}
