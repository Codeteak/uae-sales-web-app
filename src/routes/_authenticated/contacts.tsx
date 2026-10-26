import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, pageMeta, Empty } from "@/components/crm/page-header";
import { ContactDialog, NativeSelect } from "@/components/crm/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { companiesOptions, contactsOptions } from "@/lib/crm-data";
import { CONTACT_ROLES, downloadFile, toCsv, parseCsv, normText, normPhone, errMsg, useMe, type Contact, type ContactRole } from "@/lib/crm";
import { contactImportError } from "@/lib/contact-import";
import { supabase } from "@/integrations/supabase/client";
import { Download, Upload, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => pageMeta("Contacts", "Contacts in the Yaadro UAE sales CRM."),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(contactsOptions),
      context.queryClient.ensureQueryData(companiesOptions),
    ]);
  },
  component: Page,
});

type PreviewRow = {
  name: string;
  email: string;
  phone: string;
  role: string;
  companyId: string;
  error: string;
  dupe: boolean;
};

function Page() {
  const { data: contacts } = useSuspenseQuery(contactsOptions);
  const { data: companies } = useSuspenseQuery(companiesOptions);
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const activeCompanies = companies.filter((c) => !c.archived_at);
  const rows = contacts.filter(
    (c) =>
      !!c.archived_at === archived &&
      (!company || c.company_id === company) &&
      `${c.full_name} ${c.email || ""} ${c.phone_number || ""} ${c.company?.company_name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  async function pick(file: File | undefined) {
    if (!file) return;
    const grid = parseCsv(await file.text());
    const headers = grid[0]?.map((h) => h.trim().toLowerCase()) || [];
    const get = (r: string[], ...names: string[]) => {
      const i = names.map((n) => headers.indexOf(n)).find((idx) => idx >= 0);
      return i === undefined ? "" : (r[i] || "").trim();
    };
    const seen = new Set<string>();
    setResults([]);
    setPreview(
      grid.slice(1).map((r) => {
        const name = get(r, "name", "full_name");
        const email = get(r, "email");
        const phone = get(r, "phone", "phone_number");
        const role = get(r, "role", "contact_role") || "other";
        const companyName = get(r, "company", "company_name");
        const companyId =
          activeCompanies.find((c) => normText(c.company_name) === normText(companyName))?.id || "";
        const key = email.toLowerCase() || normPhone(phone) || `${companyId}:${normText(name)}`;
        const dupe =
          seen.has(key) ||
          contacts.some(
            (c) =>
              (email && c.email?.toLowerCase() === email.toLowerCase()) ||
              (phone && normPhone(c.phone_number) === normPhone(phone)) ||
              (c.company_id === companyId && normText(c.full_name) === normText(name)),
          );
        seen.add(key);
        const roleOk = CONTACT_ROLES.some((cr) => cr.value === role);
        const baseError = contactImportError({ name, email, companyId });
        return {
          name,
          email,
          phone,
          role: roleOk ? role : "other",
          companyId,
          dupe,
          error: baseError || (!roleOk && get(r, "role", "contact_role") ? "Invalid role" : ""),
        };
      }),
    );
  }

  async function run() {
    setBusy(true);
    const out: string[] = [];
    for (const [i, r] of preview.entries()) {
      if (r.error) {
        out.push(`Row ${i + 2}: skipped — ${r.error}`);
        continue;
      }
      const { error } = await supabase.from("contacts").insert({
        company_id: r.companyId,
        full_name: r.name,
        email: r.email || null,
        phone_number: r.phone || null,
        contact_role: r.role as ContactRole,
      });
      out.push(`Row ${i + 2}: ${error ? errMsg(error) : "Imported " + r.name}`);
    }
    setResults(out);
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["contacts"] });
  }

  async function archive(c: Contact) {
    const { data, error } = await supabase
      .from("contacts")
      .update({ archived_at: c.archived_at ? null : new Date().toISOString() })
      .eq("id", c.id)
      .eq("updated_at", c.updated_at)
      .select("id");
    if (error) toast.error(errMsg(error));
    else if (!data.length) toast.error("Contact changed. Refreshing…");
    else toast.success(c.archived_at ? "Contact restored" : "Contact archived");
    void qc.invalidateQueries({ queryKey: ["contacts"] });
  }

  return (
    <div>
      <PageHeader title="Contacts" sub={`${rows.length} contacts`}>
        <Button
          variant="outline"
          onClick={() =>
            downloadFile(
              "contacts.csv",
              toCsv(
                rows.map((c) => ({
                  name: c.full_name,
                  company: c.company?.company_name,
                  role: c.contact_role,
                  email: c.email,
                  phone: c.phone_number,
                })),
              ),
            )
          }
        >
          <Download /> Export
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setPreview([]);
            setResults([]);
            setImportOpen(true);
          }}
        >
          <Upload /> Import CSV
        </Button>
        <Button onClick={() => setEditing("new")}>
          <Plus /> Add contact
        </Button>
      </PageHeader>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Input
          aria-label="Search contacts"
          placeholder="Search contacts…"
          className="sm:max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <NativeSelect
          aria-label="Company"
          className="sm:max-w-xs"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        >
          <option value="">All companies</option>
          {activeCompanies.map((c) => (
            <option value={c.id} key={c.id}>
              {c.company_name}
            </option>
          ))}
        </NativeSelect>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          Archived
        </label>
      </div>
      {!rows.length ? (
        <Empty>No contacts match.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                {["Name", "Company", "Role", "Phone", "Email", ""].map((h) => (
                  <th key={h} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-3 font-medium">{c.full_name}</td>
                  <td className="p-3">
                    <Link to="/companies/$id" params={{ id: c.company_id }} className="text-primary">
                      {c.company?.company_name}
                    </Link>
                  </td>
                  <td className="p-3">{c.contact_role.replaceAll("_", " ")}</td>
                  <td className="p-3">{c.phone_number || "—"}</td>
                  <td className="p-3">{c.email || "—"}</td>
                  <td className="p-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                    {me?.isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => archive(c)}>
                        {c.archived_at ? "Restore" : "Archive"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ContactDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          companyId={editing === "new" ? company : editing.company_id}
          companies={editing === "new" ? activeCompanies : undefined}
          {...(editing === "new" ? {} : { contact: editing })}
        />
      )}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import contacts</DialogTitle>
          </DialogHeader>
          <Button
            variant="outline"
            onClick={() => downloadFile("contact-template.csv", "name,company,role,email,phone\n")}
          >
            Download template
          </Button>
          <Input type="file" accept=".csv" aria-label="Contacts CSV" onChange={(e) => pick(e.target.files?.[0])} />
          <div className="max-h-80 overflow-auto text-sm">
            {results.length
              ? results.map((r, i) => <p key={i}>{r}</p>)
              : preview.map((r, i) => (
                  <div key={i} className="flex justify-between gap-3 border-b py-2">
                    <span>
                      {i + 2}. {r.name}
                    </span>
                    <span className={r.error ? "text-danger" : r.dupe ? "text-warning-foreground" : "text-success"}>
                      {r.error || (r.dupe ? "Possible duplicate" : "Ready")}
                    </span>
                  </div>
                ))}
          </div>
          <Button disabled={busy || !!results.length || !preview.some((r) => !r.error)} onClick={run}>
            {busy ? "Importing…" : "Import valid rows"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
