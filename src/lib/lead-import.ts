import { isValidCurrency, isValidEmail, isValidPhone, TITLE_MAX } from "@/lib/validation";

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
  row: Pick<LeadImportRow, "title" | "company" | "email" | "phone" | "priority" | "value" | "currency">,
  companyId: string,
  stageId: string,
  opts?: { duplicate?: boolean },
): string {
  if (!row.title.trim()) return "Missing title";
  if (row.title.trim().length > TITLE_MAX) return "Title too long";
  if (!row.company.trim() || !companyId) return "Company not found";
  if (!stageId) return "Stage not found";
  if (!isValidEmail(row.email)) return "Invalid email";
  if (!isValidPhone(row.phone)) return "Invalid phone";
  if (row.priority && !["low", "medium", "high", "urgent"].includes(row.priority.toLowerCase())) {
    return "Invalid priority";
  }
  if (row.value && Number.isNaN(Number(row.value))) return "Invalid value";
  if (row.value && Number(row.value) < 0) return "Value cannot be negative";
  if (!isValidCurrency(row.currency)) return "Invalid currency";
  if (opts?.duplicate) return "Duplicate opportunity in file or already exists";
  return "";
}
