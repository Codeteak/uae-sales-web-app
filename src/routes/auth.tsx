import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMsg } from "@/lib/crm";
import { PoweredByCodeteak, YaadroLogo } from "@/components/brand/yaadro-logo";
import { BRAND, brandTitle } from "@/lib/brand";

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
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

function AuthPage() {
  const { mode = "login" } = Route.useSearch();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const setMode = (m: "login" | "register" | "forgot") => {
    setDone(null);
    navigate({ to: "/auth", search: { mode: m } });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        const v = registerSchema.parse(f);
        const { error } = await supabase.auth.signUp({
          email: v.email,
          password: v.password,
          options: { emailRedirectTo: window.location.origin + "/dashboard", data: { full_name: v.name } },
        });
        if (error) throw error;
        setDone("Check your email to confirm your address, then sign in. The first registered account becomes an admin automatically; later accounts may need admin approval.");
      } else if (mode === "forgot") {
        const email = z.string().email().parse(f.email.trim());
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        setDone("If that email has an account, a reset link is on its way.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
        if (error) throw error;
        const { error: touchError } = await supabase.rpc("touch_last_login");
        if (touchError) console.warn("touch_last_login failed", touchError);
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("account_status")
          .eq("id", (await supabase.auth.getUser()).data.user!.id)
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

  const title = mode === "register" ? "Request access" : mode === "forgot" ? "Reset password" : "Sign in";
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
        {mode === "register" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Join the Yaadro UAE sales workspace. The first registered account becomes an admin automatically. Later accounts may need admin approval.
          </p>
        )}
        {done ? (
          <p className="mt-6 rounded-md bg-accent p-4 text-sm text-accent-foreground">{done}</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })}
                  required
                />
              </div>
            )}
            <Button className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "register" ? "Register" : mode === "forgot" ? "Send reset link" : "Sign in"}
            </Button>
          </form>
        )}
        <div className="mt-6 flex flex-col gap-1 text-sm">
          {mode !== "login" && (
            <button type="button" className="text-left text-primary hover:underline" onClick={() => setMode("login")}>Back to sign in</button>
          )}
          {mode === "login" && (
            <>
              <button type="button" className="text-left text-primary hover:underline" onClick={() => setMode("register")}>No account? Request access</button>
              <button type="button" className="text-left text-muted-foreground hover:underline" onClick={() => setMode("forgot")}>Forgot password?</button>
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
