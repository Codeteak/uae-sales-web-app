import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMsg } from "@/lib/crm";
import { PoweredByCodeteak, YaadroLogo } from "@/components/brand/yaadro-logo";
import { formatAuthLinkExpiry } from "@/lib/auth-link-expiry";
import { BRAND } from "@/lib/brand";
import { PASSWORD_MAX, passwordError } from "@/lib/validation";

const RESET_LINK_EXPIRY_HINT = formatAuthLinkExpiry().pageHint;

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: brandTitle("Set a new password") },
      { name: "description", content: `Choose a new password for your ${BRAND.productName} UAE sales account.` },
      { property: "og:title", content: brandTitle("Set a new password") },
      { property: "og:description", content: `Choose a new password for your ${BRAND.productName} account.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function brandTitle(page: string) {
  return `${page} — ${BRAND.productName}`;
}

function recoveryMarkersPresent() {
  if (typeof window === "undefined") return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  return (
    hash.get("type") === "recovery" ||
    query.get("type") === "recovery" ||
    hash.has("access_token") ||
    query.has("code")
  );
}

function isExpiredAuthError(message: string): boolean {
  return /expir|invalid|otp_expired|flow_state|token/i.test(message);
}

function ResetPassword() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let recoveryEvent = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryEvent = true;
        if (!cancelled) {
          setSessionError(null);
          setReady(true);
        }
      }
    });

    void (async () => {
      const fromLink = recoveryMarkersPresent();

      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setSessionError(
            isExpiredAuthError(error.message)
              ? `This reset link is invalid or has expired. ${RESET_LINK_EXPIRY_HINT} Request a new link and open it in the same browser.`
              : errMsg(error),
          );
          return;
        }
        window.history.replaceState({}, "", "/reset-password");
        recoveryEvent = true;
      }

      await new Promise((r) => setTimeout(r, fromLink || recoveryEvent ? 600 : 200));
      if (cancelled) return;

      if (recoveryEvent || fromLink || recoveryMarkersPresent()) {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setSessionError(errMsg(error));
          return;
        }
        if (!data.session) {
          setSessionError(
            `This reset link is invalid or has expired (or the token was stripped by your email app). ${RESET_LINK_EXPIRY_HINT} Request a new link and open it in the same browser.`,
          );
          return;
        }
        setReady(true);
        return;
      }

      if (window.location.hash === "#" || window.location.hash === "") {
        setSessionError(
          "No reset token was found in this link. Request a new password reset from the sign-in page and open the email link in this browser.",
        );
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setSessionError(errMsg(error));
        return;
      }
      if (data.session) {
        setSessionError(
          "Open the link from your password-reset email to choose a new password. If you are already signed in, use Forgot password on the sign-in page.",
        );
        return;
      }
      setSessionError(
        `This reset link is invalid or has expired. ${RESET_LINK_EXPIRY_HINT} Request a new one from the sign-in page.`,
      );
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err = passwordError(pw);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      toast.error(
        isExpiredAuthError(error.message)
          ? `Could not update password — the reset session may have expired. ${RESET_LINK_EXPIRY_HINT}`
          : errMsg(error),
      );
      return;
    }
    toast.success("Password updated");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      navigate({ to: "/auth" });
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_status")
      .eq("id", u.user.id)
      .maybeSingle();
    navigate({ to: profile?.account_status === "active" ? "/dashboard" : "/pending" });
  }

  if (sessionError) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-8 shadow-card">
          <div className="flex items-center rounded-lg bg-sidebar px-4 py-3">
            <YaadroLogo variant="full" size="lg" onDark />
          </div>
          <h1 className="text-2xl font-semibold">Reset link unavailable</h1>
          <p className="text-sm text-muted-foreground">{sessionError}</p>
          <Button className="w-full" onClick={() => navigate({ to: "/auth", search: { mode: "forgot" } })}>
            Request a new link
          </Button>
          <div className="border-t pt-4">
            <PoweredByCodeteak size="md" />
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Checking reset session…</p>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-8 shadow-card">
        <div className="mb-2 flex items-center rounded-lg bg-sidebar px-4 py-3">
          <YaadroLogo variant="full" size="lg" onDark />
        </div>
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        <p className="text-sm text-muted-foreground">
          Update the password for your {BRAND.productName} UAE sales account. {RESET_LINK_EXPIRY_HINT}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="pw">New password</Label>
          <Input
            id="pw"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            minLength={8}
            maxLength={PASSWORD_MAX}
          />
        </div>
        <Button className="w-full" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </Button>
        <div className="border-t pt-4">
          <PoweredByCodeteak size="md" />
        </div>
      </form>
    </div>
  );
}
