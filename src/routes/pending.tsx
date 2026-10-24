import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pending")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Account awaiting approval — Ledger CRM" },
      { name: "description", content: "Your CRM account is waiting for admin approval." },
      { property: "og:title", content: "Account awaiting approval — Ledger CRM" },
      { property: "og:description", content: "Your CRM account is waiting for admin approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pending,
});

function Pending() {
  const navigate = useNavigate();
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["my-status"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("account_status").eq("id", u.user.id).maybeSingle();
      return data?.account_status ?? "pending";
    },
  });
  const msg =
    data === "rejected"
      ? "Your registration was not approved. Contact your administrator if you think this is a mistake."
      : data === "deactivated"
        ? "Your account has been deactivated. Contact your administrator."
        : data === "active"
          ? "Your account is active."
          : "Thanks for registering. An admin has been notified and will review your account shortly.";
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-card">
        <h1 className="text-2xl font-semibold">{data === "active" ? "You're approved" : "Access not yet granted"}</h1>
        <p className="mt-3 text-muted-foreground">{msg}</p>
        <div className="mt-6 flex gap-2">
          {data === "active" ? (
            <Button onClick={() => navigate({ to: "/dashboard" })}>Open CRM</Button>
          ) : (
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>Check again</Button>
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
      </div>
    </div>
  );
}
