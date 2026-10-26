import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().trim().email().max(255),
});

const OK_MESSAGE = "Check your email for a Yaadro password reset link.";

export const Route = createFileRoute("/api/auth/forgot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { rejectDisallowedOrigin } = await import("@/lib/auth-api.server");
        const originDenied = rejectDisallowedOrigin(request);
        if (originDenied) return originDenied;

        const ip = clientIp(request);
        const limited =
          enforceRateLimit(`auth:forgot:v2:ip:${ip}`, 10, 15 * 60 * 1000) ??
          enforceRateLimit(`auth:forgot:v2:day:${ip}`, 40, 24 * 60 * 60 * 1000);
        if (limited) return limited;

        let email = "";
        try {
          email = bodySchema.parse(await request.json()).email.toLowerCase();
        } catch {
          return Response.json({ ok: false, error: "Valid email required" }, { status: 400 });
        }

        const emailLimited = enforceRateLimit(`auth:forgot:v2:email:${email}`, 5, 60 * 60 * 1000);
        if (emailLimited) return emailLimited;

        try {
          const { isMailConfigured } = await import("@/lib/mail.server");
          if (!isMailConfigured()) {
            return Response.json(
              { ok: false, error: "Email is not configured on the server (SMTP_*)." },
              { status: 503 },
            );
          }
          const { sendPasswordResetEmail } = await import("@/lib/auth-mail.server");
          const result = await sendPasswordResetEmail(email);
          if (!result.ok) {
            const status = result.code === "not_found" ? 404 : 400;
            return Response.json({ ok: false, error: result.error }, { status });
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
