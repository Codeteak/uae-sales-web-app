import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMsg } from "@/lib/crm";
import { PoweredByCodeteak, YaadroLogo } from "@/components/brand/yaadro-logo";
import { BRAND, brandTitle } from "@/lib/brand";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validation";

const search = z.object({ mode: z.enum(["login", "register", "forgot"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: brandTitle("Sign in") },
      { name: "description", content: `Sign in or request access to ${BRAND.productName} for your UAE sales team.` },
      { property: "og:title", content: brandTitle("Sign in") },
      { property: "og:description", content: `Sign in or request access to ${BRAND.productName}.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z
    .string()
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
    .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`),
});

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(1, "Enter your password").max(PASSWORD_MAX),
});

function AuthPage() {
  const { mode = "login" } = Route.useSearch();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [allowRegistrations, setAllowRegistrations] = useState(true);

  useEffect(() => {
    void supabase.rpc("registration_policy").then(({ data, error }) => {
      if (error) {
        console.warn("registration_policy", error);
        return;
      }
      const allow = (data as { allow_registrations?: boolean } | null)?.allow_registrations;
      if (typeof allow === "boolean") setAllowRegistrations(allow);
    });
  }, []);

  const setMode = (m: "login" | "register" | "forgot") => {
    setDone(null);
    navigate({ to: "/auth", search: { mode: m } });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        if (!allowRegistrations) {
          toast.error("New registrations are closed. Ask an administrator for access.");
          return;
        }
        const v = registerSchema.parse(f);
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: v.name, email: v.email, password: v.password }),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
        if (res.status === 429) throw new Error(body.error ?? "Too many attempts. Try again later.");
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Registration failed");
        setDone(
          body.message ??
            "Check your email to confirm your address, then sign in. An administrator may need to approve your account before you can use Yaadro.",
        );
      } else if (mode === "forgot") {
        const email = z.string().trim().email().max(255).parse(f.email);
        const res = await fetch("/api/auth/forgot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
        if (res.status === 429) throw new Error(body.error ?? "Too many attempts. Try again later.");
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Could not send reset link");
        setDone(body.message ?? "If that email has an account, a reset link is on its way.");
      } else {
        const v = loginSchema.parse(f);
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: v.email, password: v.password }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          session?: { access_token: string; refresh_token: string };
        };
        if (res.status === 429) throw new Error(body.error ?? "Too many attempts. Try again later.");
        if (!res.ok || !body.ok || !body.session) throw new Error(body.error ?? "Invalid email or password");
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: body.session.access_token,
          refresh_token: body.session.refresh_token,
        });
        if (sessionError) throw sessionError;
        const { error: touchError } = await supabase.rpc("touch_last_login");
        if (touchError) console.warn("touch_last_login failed", touchError);
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) throw new Error("Signed in, but no user was returned. Try again.");
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("account_status")
          .eq("id", userId)
          .maybeSingle();
        if (profileError) throw profileError;
        if (profile?.account_status === "active") navigate({ to: "/dashboard" });
        else navigate({ to: "/pending" });
      }
    } catch (err) {
      toast.error(err instanceof z.ZodError ? (err.errors[0]?.message ?? "Invalid input") : errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const effectiveMode = mode === "register" && !allowRegistrations ? "login" : mode;
  const title =
    effectiveMode === "register" ? "Request access" : effectiveMode === "forgot" ? "Reset password" : "Sign in";

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-card">
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex items-center rounded-lg bg-sidebar px-4 py-3">
            <YaadroLogo variant="full" size="lg" onDark />
          </div>
          <p className="text-xs text-muted-foreground">{BRAND.tagline}</p>
        </div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {effectiveMode === "register" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Join the Yaadro UAE sales workspace. New accounts usually need admin approval before access is granted.
          </p>
        )}
        {done ? (
          <p className="mt-6 rounded-md bg-accent p-4 text-sm text-accent-foreground">{done}</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {effectiveMode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                  required
                  maxLength={100}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
                required
                maxLength={255}
              />
            </div>
            {effectiveMode !== "forgot" && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={effectiveMode === "register" ? "new-password" : "current-password"}
                  value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })}
                  required
                  maxLength={PASSWORD_MAX}
                />
              </div>
            )}
            <Button className="w-full" disabled={busy}>
              {busy
                ? "Please wait…"
                : effectiveMode === "register"
                  ? "Register"
                  : effectiveMode === "forgot"
                    ? "Send reset link"
                    : "Sign in"}
            </Button>
          </form>
        )}
        <div className="mt-6 flex flex-col gap-1 text-sm">
          {effectiveMode !== "login" && (
            <button type="button" className="text-left text-primary hover:underline" onClick={() => setMode("login")}>
              Back to sign in
            </button>
          )}
          {effectiveMode === "login" && (
            <>
              {allowRegistrations ? (
                <button
                  type="button"
                  className="text-left text-primary hover:underline"
                  onClick={() => setMode("register")}
                >
                  No account? Request access
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Registrations are closed. Ask your Yaadro administrator for access.
                </p>
              )}
              <button
                type="button"
                className="text-left text-muted-foreground hover:underline"
                onClick={() => setMode("forgot")}
              >
                Forgot password?
              </button>
            </>
          )}
        </div>
        <div className="mt-8 border-t pt-4">
          <PoweredByCodeteak size="md" />
        </div>
      </div>
    </div>
  );
}
