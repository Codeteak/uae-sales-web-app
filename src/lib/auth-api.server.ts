/**
 * Server-only anon Supabase client for rate-limited auth API routes.
 * Load only from server handlers.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export function createAnonServerClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  }
  return createClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
  });
}

export function appOriginFromEnv(): string {
  return (process.env["APP_URL"] || process.env["VITE_APP_URL"] || "").trim().replace(/\/+$/, "");
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

/**
 * Reject browser POSTs whose Origin/Referer is not the configured app URL.
 * Missing Origin is allowed (curl / non-browser); when present it must match.
 */
export function rejectDisallowedOrigin(request: Request): Response | null {
  const allowed = appOriginFromEnv();
  if (!allowed) return null;

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    if (normalizeOrigin(originHeader) !== normalizeOrigin(allowed)) {
      return Response.json({ ok: false, error: "Forbidden origin" }, { status: 403 });
    }
    return null;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    if (normalizeOrigin(referer) !== normalizeOrigin(allowed)) {
      return Response.json({ ok: false, error: "Forbidden origin" }, { status: 403 });
    }
  }
  return null;
}
