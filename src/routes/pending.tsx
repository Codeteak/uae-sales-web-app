import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { errMsg } from "@/lib/crm";
import { PoweredByCodeteak, YaadroLogo } from "@/components/brand/yaadro-logo";

export const Route = createFileRoute("/pending")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Account awaiting approval — Yaadro" },
      { name: "description", content: "Your Yaadro account is waiting for admin approval." },
      { property: "og:title", content: "Account awaiting approval — Yaadro" },
      { property: "og:description", content: "Your Yaadro account is waiting for admin approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Pending,
});

function Pending() {
  const navigate = useNavigate();
  const { data, refetch, isFetching, error } = useQuery({
    queryKey: ["my-status"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return null;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("account_status")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error("Profile not found. Contact an administrator.");
      return profile.account_status;
    },
  });

  useEffect(() => {
    if (data === "active") navigate({ to: "/dashboard", replace: true });
  }, [data, navigate]);

  useEffect(() => {
    if (data !== "deactivated" && data !== "rejected") return;
    const t = window.setTimeout(() => {
      void (async () => {
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
        toast.message("You have been signed out.");
      })();
    }, 8_000);
    return () => window.clearTimeout(t);
  }, [data, navigate]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-card">
          <h1 className="text-2xl font-semibold">Could not load account status</h1>
          <p className="mt-3 text-muted-foreground">{errMsg(error)}</p>
          <div className="mt-6 flex gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              Try again
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth", replace: true });
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const msg =
    data === "rejected"
      ? "Your registration was not approved. You will be signed out shortly. Contact your administrator if you think this is a mistake."
      : data === "deactivated"
        ? "Your account has been deactivated. You will be signed out shortly. Contact your administrator."
        : data === "active"
          ? "Your account is active. Opening Yaadro…"
          : "Thanks for registering. An admin has been notified and will review your account shortly. This page refreshes automatically.";

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-card">
        <div className="mb-6 flex items-center rounded-lg bg-sidebar px-4 py-3">
          <YaadroLogo variant="full" size="lg" onDark />
        </div>
        <h1 className="text-2xl font-semibold">{data === "active" ? "You're approved" : "Access not yet granted"}</h1>
        <p className="mt-3 text-muted-foreground">{msg}</p>
        <div className="mt-6 flex gap-2">
          {data === "active" ? (
            <Button onClick={() => navigate({ to: "/dashboard" })}>Open Yaadro</Button>
          ) : (
            <Button
              variant="outline"
              onClick={async () => {
                const result = await refetch();
                if (result.error) toast.error(errMsg(result.error));
                else if (result.data === "active") toast.success("Approved — opening Yaadro");
              }}
              disabled={isFetching}
            >
              {isFetching ? "Checking…" : "Check again"}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth", replace: true });
            }}
          >
            Sign out
          </Button>
        </div>
        <div className="mt-8 border-t pt-4">
          <PoweredByCodeteak size="md" />
        </div>
      </div>
    </div>
  );
}
