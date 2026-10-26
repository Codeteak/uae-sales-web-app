export type LeadImportRow = {
  title: string;
  company: string;
  contact: string;
  phone: string;
  email: string;
  stage: string;
  priority: string;
  source: string;
  value: string;
  currency: string;
  next_action: string;
  follow_up: string;
};

export function leadImportError(
  row: Pick<LeadImportRow, "title" | "company" | "email" | "priority" | "value">,
  companyId: string,
  stageId: string,
): string {
  if (!row.title.trim()) return "Missing title";
  if (!row.company.trim() || !companyId) return "Company not found";
  if (!stageId) return "Stage not found";
  if (row.email && !/^\S+@\S+\.\S+$/.test(row.email)) return "Invalid email";
  if (row.priority && !["low", "medium", "high", "urgent"].includes(row.priority.toLowerCase())) {
    return "Invalid priority";
  }
  if (row.value && Number.isNaN(Number(row.value))) return "Invalid value";
  return "";
}
