/** Authenticate scheduled reminder calls (Vercel Cron / Lovable / custom secret). */
export async function guardCronRequest(request: Request): Promise<Response | null> {
  const secrets = [
    process.env["LOVABLE_CRON_SECRET"],
    process.env["CRON_SECRET"],
    process.env["VERCEL_CRON_SECRET"],
  ].filter((s): s is string => !!s);

  if (!secrets.length) {
    return new Response("Server configuration error", { status: 500 });
  }

  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  const provided = digest(token);
  const ok = secrets.some((secret) => {
    try {
      return timingSafeEqual(provided, digest(secret));
    } catch {
      return false;
    }
  });

  if (!ok) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
