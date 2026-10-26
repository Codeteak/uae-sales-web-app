import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageHeader, pageMeta } from "@/components/crm/page-header";
import { LeadForm } from "@/components/crm/lead-form";

export const Route = createFileRoute("/_authenticated/leads/new")({
  head: () => pageMeta("New lead", "Add a new sales opportunity to Yaadro."),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="New lead" sub="Create a company and opportunity. Duplicates are flagged, never merged automatically." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading form…</p>}>
        <LeadForm />
      </Suspense>
    </div>
  );
}
