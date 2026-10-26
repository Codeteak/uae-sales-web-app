import { createFileRoute } from "@tanstack/react-router";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/mail/test
 * Body: { "to": "you@gmail.com" }
 * Auth: Authorization: Bearer <CRON_SECRET> (same as cron; server-only smoke test)
 */
export const Route = createFileRoute("/api/mail/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = clientIp(request);

        const { guardCronRequest } = await import("@/lib/cron-guard");
        const denied = await guardCronRequest(request);
        if (denied) {
          const failLimited = enforceRateLimit(`mail:test:unauth:${ip}`, 20, 15 * 60 * 1000);
          return failLimited ?? denied;
        }

        const limited =
          enforceRateLimit(`mail:test:ip:${ip}`, 5, 60 * 60 * 1000) ??
          enforceRateLimit(`mail:test:burst:${ip}`, 2, 5 * 60 * 1000);
        if (limited) return limited;

        let to = "";
        try {
          const body = (await request.json()) as { to?: string };
          to = (body.to ?? "").trim();
        } catch {
          return Response.json({ ok: false, error: "JSON body with { to } required" }, { status: 400 });
        }
        if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
          return Response.json({ ok: false, error: "Valid 'to' email required" }, { status: 400 });
        }

        const toLimited = enforceRateLimit(`mail:test:to:${to.toLowerCase()}`, 3, 60 * 60 * 1000);
        if (toLimited) return toLimited;

        try {
          const { isMailConfigured, sendAppEmail, verifySmtpConnection } = await import(
            "@/lib/mail.server"
          );
          if (!isMailConfigured()) {
            return Response.json(
              {
                ok: false,
                error:
                  "SMTP env not set. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (see .env.example).",
              },
              { status: 500 },
            );
          }
          await verifySmtpConnection();
          const { messageId } = await sendAppEmail({
            to,
            subject: "Yaadro SMTP test",
            text: "This message confirms Gmail SMTP is working for Yaadro.",
            html: "<p>This message confirms <strong>Gmail SMTP</strong> is working for Yaadro.</p>",
          });
          return Response.json({ ok: true, messageId });
        } catch (e) {
          console.error("[mail/test]", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "SMTP send failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
