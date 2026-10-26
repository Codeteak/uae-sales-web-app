export const APP_TZ = "Asia/Dubai";

/** Offset (ms) of `timeZone` relative to UTC at the given instant. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - date.getTime();
}

/** Convert datetime-local wall time in `timeZone` to UTC ISO. */
export function zonedLocalInputToIso(v: string, timeZone = APP_TZ): string | null {
  if (!v) return null;
  const [datePart, timePart = "00:00"] = v.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const utc = new Date(guess.getTime() - zoneOffsetMs(guess, timeZone));
  return utc.toISOString();
}

/** Format UTC ISO as datetime-local value in `timeZone`. */
export function isoToZonedLocalInput(v?: string | null, timeZone = APP_TZ): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

export function formatInZone(
  v: string | null | undefined,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions,
): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...opts }).format(new Date(v));
}

export const COMMON_TIMEZONES = [
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Bahrain",
  "Asia/Muscat",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "UTC",
] as const;
