import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validation";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { rejectDisallowedOrigin } = await import("@/lib/auth-api.server");
        const originDenied = rejectDisallowedOrigin(request);
        if (originDenied) return originDenied;

        const ip = clientIp(request);
        const limited =
          enforceRateLimit(`auth:register:ip:${ip}`, 5, 60 * 60 * 1000) ??
          enforceRateLimit(`auth:register:burst:${ip}`, 3, 15 * 60 * 1000);
        if (limited) return limited;

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ ok: false, error: "Invalid registration payload" }, { status: 400 });
        }

        const emailLimited = enforceRateLimit(
          `auth:register:email:${parsed.email.toLowerCase()}`,
          3,
          60 * 60 * 1000,
        );
        if (emailLimited) return emailLimited;

        try {
          const { createAnonServerClient, appOriginFromEnv } = await import("@/lib/auth-api.server");
          const supabase = createAnonServerClient();
          const { data: policy, error: policyError } = await supabase.rpc("registration_policy");
          if (policyError) {
            console.warn("[auth/register] registration_policy", policyError);
          } else if ((policy as { allow_registrations?: boolean } | null)?.allow_registrations === false) {
            return Response.json(
              { ok: false, error: "New registrations are closed. Ask an administrator for access." },
              { status: 403 },
            );
          }

          const origin = appOriginFromEnv();
          const { error } = await supabase.auth.signUp({
            email: parsed.email,
            password: parsed.password,
            options: {
              emailRedirectTo: origin ? `${origin}/dashboard` : undefined,
              data: { full_name: parsed.name },
            },
          });
          if (error) {
            // Avoid leaking whether the email is already registered.
            const msg = /already|registered|exists/i.test(error.message)
              ? "If this email can be registered, check your inbox for a confirmation link."
              : error.message;
            return Response.json({ ok: false, error: msg }, { status: 400 });
          }
          return Response.json({
            ok: true,
            message:
              "Check your email to confirm your address, then sign in. An administrator may need to approve your account before you can use Yaadro.",
          });
        } catch (e) {
          console.error("[auth/register]", e);
          return Response.json({ ok: false, error: "Registration failed" }, { status: 500 });
        }
      },
    },
  },
});
