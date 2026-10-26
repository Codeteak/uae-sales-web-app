import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, pageMeta, Empty } from "@/components/crm/page-header";
import { Field, NativeSelect } from "@/components/crm/dialogs";
import { companiesOptions } from "@/lib/crm-data";
import { downloadFile, errMsg, normText, parseCsv, toCsv, useMe, type Company } from "@/lib/crm";
import { csvFileError, csvRowCountError, CSV_MAX_ROWS, isValidEmail, isValidPhone } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/companies")({
  head: () => pageMeta("Companies", "Customer and prospect companies for Yaadro UAE sales."),
  loader: ({ context }) => context.queryClient.ensureQueryData(companiesOptions),
  component: Page,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm text-danger">{error instanceof Error ? error.message : String(error)}</div>,
});

function Page() {
  const { data: companies } = useSuspenseQuery(companiesOptions);
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = companies.filter((c) => !!c.archived_at === showArchived && c.company_name.toLowerCase().includes(search.toLowerCase()));

  async function toggleArchive(c: Company) {
    const { data, error } = await supabase.from("companies").update({ archived_at: c.archived_at ? null : new Date().toISOString() }).eq("id", c.id).eq('updated_at',c.updated_at).select('id');
    if(!error&&!data?.length){toast.error('Company changed. Refreshing…');qc.invalidateQueries({queryKey:['companies']});return;}
    if (error) toast.error(errMsg(error)); else { toast.success(c.archived_at ? "Restored" : "Archived"); qc.invalidateQueries({ queryKey: ["companies"] }); }
  }

  function exportCsv() {
    downloadFile(`companies-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(filtered.map((c) => ({ name: c.company_name, industry: c.industry, phone: c.phone, email: c.email, website: c.website, address: c.address, notes: c.notes }))));
  }

  return (
    <div>
      <PageHeader title="Companies" sub={`${companies.filter((c) => !c.archived_at).length} active companies`}>
        <Button variant="outline" onClick={exportCsv}><Download /> Export</Button>
        <Button variant="outline" onClick={() => setImportOpen(true)}><Upload /> Import CSV</Button>
        <Button onClick={() => setEditing("new")}><Plus /> Add company</Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input aria-label="Search companies" placeholder="Search companies…" className="sm:max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived</label>
      </div>
      {!filtered.length ? <Empty>No companies match.</Empty> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted text-xs text-muted-foreground"><tr>{["Name", "Industry", "Phone", "Email", "Website", ""].map((t) => <th key={t} className="px-4 py-3 font-medium">{t}</th>)}</tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3"><Link to="/companies/$id" params={{ id: c.id }} className="font-semibold text-primary hover:underline">{c.company_name}</Link></td>
                  <td className="px-4 py-3">{c.industry ?? "—"}</td>
                  <td className="px-4 py-3">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3">{c.email ?? "—"}</td>
                  <td className="px-4 py-3">{c.website ? <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.website}</a> : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>Edit</Button>
                    {me?.isAdmin && <Button variant="ghost" size="sm" onClick={() => toggleArchive(c)}>{c.archived_at ? "Restore" : "Archive"}</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <CompanyDialog key={editing === "new" ? "new" : editing.id} company={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} existing={companies} fileRef={fileRef} />
    </div>
  );
}

function CompanyDialog({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ company_name: company?.company_name ?? "", industry: company?.industry ?? "", phone: company?.phone ?? "", email: company?.email ?? "", website: company?.website ?? "", address: company?.address ?? "", notes: company?.notes ?? "" });
  async function save() {
    if (!f.company_name.trim()) { toast.error("Name is required"); return; }
    if (!isValidEmail(f.email)) { toast.error("Invalid email"); return; }
    if (!isValidPhone(f.phone)) { toast.error("Invalid phone number"); return; }
    const payload = { company_name: f.company_name.trim(), industry: f.industry || null, phone: f.phone || null, email: f.email || null, website: f.website || null, address: f.address || null, notes: f.notes || null };
    const { data, error } = company
      ? await supabase.from("companies").update(payload).eq("id", company.id).eq("updated_at", company.updated_at).select('id')
      : await supabase.from("companies").insert(payload).select('id');
    if (error) { toast.error(errMsg(error)); return; }
    if(!data?.length){toast.error('Company changed. Refreshing…');qc.invalidateQueries({queryKey:['companies']});onClose();return;}
    toast.success("Company saved");
    qc.invalidateQueries({ queryKey: ["companies"] });
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{company ? "Edit company" : "Add company"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></Field>
          <Field label="Industry"><Input value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Website"><Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></Field>
          <Field label="Address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ImportRow = { name: string; industry: string; phone: string; email: string; website: string; address: string; notes: string; dupe: boolean; error: string };

function ImportDialog({ open, onOpenChange, existing, fileRef }: { open: boolean; onOpenChange: (o: boolean) => void; existing: Company[]; fileRef: React.RefObject<HTMLInputElement | null> }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [results, setResults] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

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
          const name = col(r, "name", "company", "company_name");
          const phone = col(r, "phone");
          const email = col(r, "email");
          const key = normText(name);
          const dupe = !!name && (seen.has(key) || existing.some((c) => normText(c.company_name) === key));
          if (name) seen.add(key);
          let error = "";
          if (!name) error = "Missing name";
          else if (dupe) error = "Duplicate company";
          else if (!isValidEmail(email)) error = "Invalid email";
          else if (!isValidPhone(phone)) error = "Invalid phone";
          return {
            name,
            industry: col(r, "industry"),
            phone,
            email,
            website: col(r, "website"),
            address: col(r, "address"),
            notes: col(r, "notes"),
            dupe,
            error,
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
      const { error } = await supabase.from("companies").insert({
        company_name: r.name,
        industry: r.industry || null,
        phone: r.phone || null,
        email: r.email || null,
        website: r.website || null,
        address: r.address || null,
        notes: r.notes || null,
      });
      out.push(error ? `Row ${i + 2}: failed — ${errMsg(error)}` : `Row ${i + 2}: imported ${r.name}`);
    }
    setBusy(false);
    setResults(out);
    void qc.invalidateQueries({ queryKey: ["companies"] });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setRows(null); setResults(null); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Import companies from CSV</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Expected columns: name, industry, phone, email, website, address, notes. Max {CSV_MAX_ROWS} rows. Duplicate names are skipped.</p>
        <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="Choose CSV file" onChange={(e) => pick(e.target.files?.[0])} className="text-sm" />
        {rows && !results && (
          <div className="max-h-64 overflow-auto rounded border text-xs">
            <table className="w-full text-left">
              <thead className="border-b bg-muted"><tr><th className="px-2 py-1">Name</th><th className="px-2 py-1">Industry</th><th className="px-2 py-1">Phone</th><th className="px-2 py-1">Status</th></tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i} className="border-b last:border-0"><td className="px-2 py-1">{r.name || "—"}</td><td className="px-2 py-1">{r.industry}</td><td className="px-2 py-1">{r.phone}</td><td className={`px-2 py-1 ${r.error ? "text-danger" : r.dupe ? "text-warning-foreground" : "text-success"}`}>{r.error || (r.dupe ? "Possible duplicate" : "Ready")}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {results && <div className="max-h-64 overflow-auto rounded border p-3 text-xs">{results.map((r, i) => <p key={i}>{r}</p>)}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {rows && !results && <Button onClick={run} disabled={busy || !rows.some((r) => !r.error)}>{busy ? "Importing…" : `Import ${rows.filter((r) => !r.error).length} rows`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
