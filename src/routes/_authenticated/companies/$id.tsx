import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageHeader, pageMeta, Card, Empty } from "@/components/crm/page-header";
import { ContactDialog } from "@/components/crm/dialogs";
import { LeadTable } from "@/components/crm/lead-table";
import { leadsOptions } from "@/lib/crm-data";
import { CONTACT_ROLES, fmtDateTime } from "@/lib/crm";

const companyOptions = (id: string) => queryOptions({
  queryKey: ["companies", id],
  queryFn: async () => {
    const { data, error } = await supabase.from("companies").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  },
});
const companyContactsOptions = (id: string) => queryOptions({
  queryKey: ["contacts", "company", id],
  queryFn: async () => {
    const { data, error } = await supabase.from("contacts").select("*").eq("company_id", id).order("full_name");
    if (error) throw error;
    return data;
  },
});

export const Route = createFileRoute("/_authenticated/companies/$id")({
  head: () => pageMeta("Company details", "Company profile, contacts and opportunities."),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(companyOptions(params.id));
    } catch {
      throw notFound();
    }
  },
  component: Page,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm text-danger">{error instanceof Error ? error.message : String(error)}</div>,
  notFoundComponent: () => <Empty>Company not found. <Link to="/companies" className="text-primary underline">Back to companies</Link></Empty>,
});

function Page() {
  const { id } = Route.useParams();
  const { data: company } = useSuspenseQuery(companyOptions(id));
  const { data: contacts } = useSuspenseQuery(companyContactsOptions(id));
  const { data: leads } = useSuspenseQuery(leadsOptions);
  const [contactOpen, setContactOpen] = useState(false);
  const companyLeads = leads.filter((l) => l.company_id === id);

  return (
    <div className="space-y-6">
      <PageHeader title={company.company_name} {...(company.archived_at ? { sub: "Archived" } : company.industry ? { sub: company.industry } : {})}>
        <Button onClick={() => setContactOpen(true)}><Plus /> Add contact</Button>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Company details" className="self-start">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-muted-foreground">Phone</dt><dd>{company.phone ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Email</dt><dd>{company.email ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Website</dt><dd>{company.website ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Address</dt><dd>{company.address ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{company.notes ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Added</dt><dd>{fmtDateTime(company.created_at)}</dd></div>
          </dl>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Contacts (${contacts.length})`}>
            {!contacts.length ? <Empty>No contacts yet.</Empty> : (
              <div className="divide-y">
                {contacts.map((c) => (
                  <div key={c.id} className="py-3">
                    <p className="font-medium">{c.full_name} <span className="text-xs font-normal text-muted-foreground">{CONTACT_ROLES.find((r) => r.value === c.contact_role)?.label}</span></p>
                    <p className="text-xs text-muted-foreground">{[c.job_title, c.department].filter(Boolean).join(" · ")}</p>
                    <p className="text-sm">{[c.phone_number, c.email].filter(Boolean).join(" · ") || "No contact details"}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title={`Opportunities (${companyLeads.length})`}>
            <LeadTable leads={companyLeads} compact />
          </Card>
        </div>
      </div>
      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} companyId={id} />
    </div>
  );
}
