import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().trim().email().max(255),
});

/** Generic success so callers cannot probe which emails exist. */
const OK_MESSAGE = "If that email has an account, a reset link is on its way.";

export const Route = createFileRoute("/api/auth/forgot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { rejectDisallowedOrigin } = await import("@/lib/auth-api.server");
        const originDenied = rejectDisallowedOrigin(request);
        if (originDenied) return originDenied;

        const ip = clientIp(request);
        const limited =
          enforceRateLimit(`auth:forgot:ip:${ip}`, 5, 15 * 60 * 1000) ??
          enforceRateLimit(`auth:forgot:day:${ip}`, 15, 24 * 60 * 60 * 1000);
        if (limited) return limited;

        let email = "";
        try {
          email = bodySchema.parse(await request.json()).email.toLowerCase();
        } catch {
          return Response.json({ ok: false, error: "Valid email required" }, { status: 400 });
        }

        const emailLimited = enforceRateLimit(`auth:forgot:email:${email}`, 3, 60 * 60 * 1000);
        if (emailLimited) return emailLimited;

        try {
          const { createAnonServerClient, appOriginFromEnv } = await import("@/lib/auth-api.server");
          const supabase = createAnonServerClient();
          const origin = appOriginFromEnv();
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: origin ? `${origin}/reset-password` : undefined,
          });
          if (error) {
            // Still return generic OK to avoid account enumeration; log for ops.
            console.warn("[auth/forgot]", error.message);
          }
          return Response.json({ ok: true, message: OK_MESSAGE });
        } catch (e) {
          console.error("[auth/forgot]", e);
          return Response.json({ ok: false, error: "Could not start password reset" }, { status: 500 });
        }
      },
    },
  },
});
