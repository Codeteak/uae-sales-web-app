/** Shared input rules for Yaadro CRM (client + import helpers). */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const CSV_MAX_ROWS = 500;
export const CSV_MAX_BYTES = 1_500_000; // ~1.5 MB
export const MENTION_MAX = 20;
export const TITLE_MAX = 200;
export const SUMMARY_MAX = 300;
export const NOTES_MAX = 5000;

export const ALLOWED_CURRENCIES = [
  "AED",
  "USD",
  "EUR",
  "GBP",
  "SAR",
  "INR",
  "CAD",
  "AUD",
  "CHF",
  "KWD",
  "BHD",
  "OMR",
  "QAR",
] as const;

export type AllowedCurrency = (typeof ALLOWED_CURRENCIES)[number];

/** Practical email check (aligned with DB `is_valid_email`). */
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function isValidEmail(value: string | null | undefined): boolean {
  if (value == null) return true;
  const t = value.trim();
  if (!t) return true;
  if (t.length > 255) return false;
  return EMAIL_RE.test(t);
}

/** Digits-only length 7–15 after stripping non-digits; empty allowed. */
export function isValidPhone(value: string | null | undefined): boolean {
  if (value == null) return true;
  const t = value.trim();
  if (!t) return true;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function isValidCurrency(value: string | null | undefined): boolean {
  if (value == null || !value.trim()) return true;
  return (ALLOWED_CURRENCIES as readonly string[]).includes(value.trim().toUpperCase());
}

export function passwordError(value: string): string | null {
  if (value.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (value.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  return null;
}

export function csvFileError(file: File): string | null {
  if (file.size > CSV_MAX_BYTES) return `CSV must be under ${Math.round(CSV_MAX_BYTES / 1000)} KB`;
  return null;
}

export function csvRowCountError(dataRowCount: number): string | null {
  if (dataRowCount > CSV_MAX_ROWS) return `CSV may include at most ${CSV_MAX_ROWS} data rows`;
  return null;
}
