import { isValidEmail, isValidPhone, TITLE_MAX } from "@/lib/validation";

export function contactImportError(row: {
  name: string;
  email: string;
  phone?: string;
  companyId: string;
  duplicate?: boolean;
}) {
  if (!row.name.trim()) return "Missing name";
  if (row.name.trim().length > TITLE_MAX) return "Name too long";
  if (!row.companyId) return "Company not found";
  if (!isValidEmail(row.email)) return "Invalid email";
  if (!isValidPhone(row.phone)) return "Invalid phone";
  if (row.duplicate) return "Duplicate contact";
  return "";
}
