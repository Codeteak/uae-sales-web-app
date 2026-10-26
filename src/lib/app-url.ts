/** Canonical public app origin for auth email redirects (no trailing slash). */
export function appOrigin(): string {
  const fromEnv = (
    import.meta.env["VITE_APP_URL"] ||
    (typeof process !== "undefined" ? process.env["APP_URL"] || process.env["VITE_APP_URL"] : undefined) ||
    ""
  )
    .toString()
    .trim()
    .replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
}

export function authRedirectUrl(path: string): string {
  const base = appOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
