import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiRateLimiter, clientIp, enforceRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { PASSWORD_MAX } from "@/lib/validation";

const bodySchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(PASSWORD_MAX),
});

const WINDOW_MS = 15 * 60 * 1000;

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { rejectDisallowedOrigin } = await import("@/lib/auth-api.server");
        const originDenied = rejectDisallowedOrigin(request);
        if (originDenied) return originDenied;

        const ip = clientIp(request);
        const failKey = `auth:login:fail:${ip}`;
        const failPeek = apiRateLimiter.peek(failKey, 15, WINDOW_MS);
        if (!failPeek.allowed) return tooManyRequests(failPeek);

        const limited =
          enforceRateLimit(`auth:login:ip:${ip}`, 20, WINDOW_MS) ??
          enforceRateLimit(`auth:login:ip-strict:${ip}`, 40, 60 * 60 * 1000);
        if (limited) return limited;

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ ok: false, error: "Invalid email or password payload" }, { status: 400 });
        }

        const emailKey = parsed.email.toLowerCase();
        const emailLimited = enforceRateLimit(`auth:login:email:${emailKey}`, 10, WINDOW_MS);
        if (emailLimited) return emailLimited;

        try {
          const { createAnonServerClient } = await import("@/lib/auth-api.server");
          const supabase = createAnonServerClient();
          const { data, error } = await supabase.auth.signInWithPassword({
            email: parsed.email,
            password: parsed.password,
          });
          if (error || !data.session) {
            apiRateLimiter.check(failKey, 15, WINDOW_MS);
            return Response.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
          }
          return Response.json({
            ok: true,
            session: {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            },
          });
        } catch (e) {
          console.error("[auth/login]", e);
          return Response.json({ ok: false, error: "Sign-in failed" }, { status: 500 });
        }
      },
    },
  },
});
