import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, pageMeta } from "@/components/crm/page-header";
import { LeadTable } from "@/components/crm/lead-table";
import { companiesOptions, leadsOptions, money } from "@/lib/crm-data";
import { openPipelineTotals } from "@/lib/crm-summary";
import { leadImportError, type LeadImportRow } from "@/lib/lead-import";
import {
  downloadFile,
  errMsg,
  fmtDateTime,
  localInputToIso,
  normText,
  parseCsv,
  primaryContact,
  toCsv,
  useMe,
  useStages,
} from "@/lib/crm";
import { csvFileError, csvRowCountError, CSV_MAX_ROWS } from "@/lib/validation";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => pageMeta("All leads", "All opportunities in the Yaadro UAE sales CRM."),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(leadsOptions),
      context.queryClient.ensureQueryData(companiesOptions),
    ]);
  },
  component: Page,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm text-danger">{error instanceof Error ? error.message : String(error)}</div>,
});

function Page() {
  const { data: leads } = useSuspenseQuery(leadsOptions);
  const { data: companies } = useSuspenseQuery(companiesOptions);
  const { data: stages = [] } = useStages();
  const { data: me } = useMe();
  const [importOpen, setImportOpen] = useState(false);
  const open = leads.filter((l) => l.outcome === "open" && !l.archived_at);

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
      <PageHeader title="All leads" sub={`${leads.length} opportunities · open pipeline value ${openPipelineTotals(open, money)}`}>
        <Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>
        <Button variant="outline" onClick={() => setImportOpen(true)}><Upload /> Import CSV</Button>
        <Button asChild><Link to="/leads/new"><Plus /> New lead</Link></Button>
      </PageHeader>
      <LeadTable leads={leads} />
      <LeadImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        companies={companies.filter((c) => !c.archived_at)}
        stages={stages.filter((s) => s.is_active && s.category === "open")}
        existingLeads={leads.filter((l) => !l.archived_at).map((l) => ({ title: l.lead_title, companyId: l.company_id }))}
        timezone={me?.profile?.timezone || "Asia/Dubai"}
      />
    </div>
  );
}

type PreviewRow = LeadImportRow & { companyId: string; stageId: string; error: string; dupe: boolean };

function LeadImportDialog({
  open,
  onOpenChange,
  companies,
  stages,
  existingLeads,
  timezone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companies: { id: string; company_name: string }[];
  stages: { id: string; stage_name: string }[];
  existingLeads: { title: string; companyId: string }[];
  timezone: string;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [results, setResults] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const defaultStage = stages[0];

  function pick(file: File | undefined) {
    if (!file) return;
    const fileErr = csvFileError(file);
    if (fileErr) {
      toast.error(fileErr);
      return;
    }
    void file.text().then((text) => {
      const grid = parseCsv(text);
      const dataRows = grid.slice(1).filter((r) => r.some((c) => c.trim()));
      const rowErr = csvRowCountError(dataRows.length);
      if (rowErr) {
        toast.error(rowErr);
        return;
      }
      const head = grid[0]?.map((h) => h.toLowerCase().trim()) ?? [];
      const col = (r: string[], ...names: string[]) => {
        const i = names.map((n) => head.indexOf(n)).find((idx) => idx >= 0);
        return i == null ? "" : (r[i] ?? "").trim();
      };
      const seen = new Set<string>();
      setResults(null);
      setRows(
        dataRows.map((r) => {
          const title = col(r, "title", "lead_title", "opportunity");
          const company = col(r, "company", "company_name", "name");
          const stageName = col(r, "stage", "stage_name");
          const companyId = companies.find((c) => normText(c.company_name) === normText(company))?.id || "";
          const stageId =
            stages.find((s) => normText(s.stage_name) === normText(stageName))?.id ||
            (!stageName ? defaultStage?.id || "" : "");
          const key = `${normText(title)}::${companyId}`;
          const dupe =
            (!!title && !!companyId && seen.has(key)) ||
            existingLeads.some(
              (l) => l.companyId === companyId && normText(l.title) === normText(title),
            );
          if (title && companyId) seen.add(key);
          const row: LeadImportRow = {
            title,
            company,
            contact: col(r, "contact", "contact_name", "full_name"),
            phone: col(r, "phone", "phone_number"),
            email: col(r, "email"),
            stage: stageName,
            priority: col(r, "priority") || "medium",
            source: col(r, "source", "lead_source"),
            value: col(r, "value", "estimated_value"),
            currency: col(r, "currency") || "AED",
            next_action: col(r, "next_action"),
            follow_up: col(r, "follow_up", "next_follow_up", "follow_up_at"),
          };
          return {
            ...row,
            companyId,
            stageId,
            dupe,
            error: leadImportError(row, companyId, stageId, { duplicate: dupe }),
          };
        }),
      );
    });
  }

  async function run() {
    if (!rows) return;
    setBusy(true);
    const out: string[] = [];
    for (const [i, r] of rows.entries()) {
      if (r.error) {
        out.push(`Row ${i + 2}: skipped — ${r.error}`);
        continue;
      }
      const followUp = r.follow_up.includes("T")
        ? localInputToIso(r.follow_up.slice(0, 16), timezone)
        : null;
      const contacts = r.contact
        ? [{ full_name: r.contact, phone_number: r.phone || null, email: r.email || null, contact_role: "other" }]
        : [];
      const { data, error } = await supabase.rpc("create_crm_lead", {
        payload: {
          company_id: r.companyId,
          lead_title: r.title,
          lead_source: r.source || null,
          current_stage_id: r.stageId,
          priority: r.priority.toLowerCase(),
          next_action: r.next_action || null,
          estimated_value: r.value ? Number(r.value) : null,
          currency: r.currency || "AED",
          follow_up_at: followUp,
          contacts,
        },
      });
      out.push(
        error
          ? `Row ${i + 2}: failed — ${errMsg(error)}`
          : `Row ${i + 2}: imported ${r.title}${data ? ` (${data})` : ""}`,
      );
    }
    setBusy(false);
    setResults(out);
    void qc.invalidateQueries({ queryKey: ["leads"] });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setRows(null);
          setResults(null);
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Columns: title, company, contact, phone, email, stage, priority, source, value, currency, next_action, follow_up.
          Company and stage must already exist. Max {CSV_MAX_ROWS} rows. Duplicates (same title + company) are skipped.
        </p>
        <Button
          variant="outline"
          onClick={() =>
            downloadFile(
              "lead-template.csv",
              "title,company,contact,phone,email,stage,priority,source,value,currency,next_action,follow_up\n",
            )
          }
        >
          Download template
        </Button>
        <Input type="file" accept=".csv,text/csv" aria-label="Leads CSV" onChange={(e) => pick(e.target.files?.[0])} />
        {rows && !results && (
          <div className="max-h-64 overflow-auto rounded border text-xs">
            <table className="w-full text-left">
              <thead className="border-b bg-muted">
                <tr>
                  <th className="px-2 py-1">Title</th>
                  <th className="px-2 py-1">Company</th>
                  <th className="px-2 py-1">Stage</th>
                  <th className="px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-2 py-1">{r.title || "—"}</td>
                    <td className="px-2 py-1">{r.company || "—"}</td>
                    <td className="px-2 py-1">{r.stage || defaultStage?.stage_name || "—"}</td>
                    <td className={`px-2 py-1 ${r.error ? "text-danger" : "text-success"}`}>
                      {r.error || "Ready"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {results && (
          <div className="max-h-64 overflow-auto rounded border p-3 text-xs">
            {results.map((r, i) => (
              <p key={i}>{r}</p>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {rows && !results && (
            <Button onClick={run} disabled={busy || !rows.some((r) => !r.error)}>
              {busy ? "Importing…" : `Import ${rows.filter((r) => !r.error).length} rows`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
