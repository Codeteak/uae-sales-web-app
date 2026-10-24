import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CalendarClock, Users, KanbanSquare } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ledger CRM — Shared sales pipeline for B2B teams" },
      { name: "description", content: "One shared record of every lead, contact, follow-up and next action for your sales team." },
      { property: "og:title", content: "Ledger CRM — Shared sales pipeline for B2B teams" },
      { property: "og:description", content: "One shared record of every lead, contact, follow-up and next action for your sales team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);
  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
        <div className="flex items-center gap-2 font-display text-lg font-semibold text-sidebar-accent-foreground">
          <span className="grid size-8 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">L</span>
          Ledger CRM
        </div>
        <div className="flex flex-1 flex-col justify-center py-16">
          <h1 className="max-w-2xl text-4xl font-semibold text-sidebar-accent-foreground sm:text-5xl">
            Every lead has an owner. Every follow-up has a date.
          </h1>
          <p className="mt-5 max-w-xl text-lg">
            The shared sales record for your team — companies, contacts, activity history and reminders in one place.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg" className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <Link to="/auth" search={{ mode: "register" }}>Request access</Link>
            </Button>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            {[
              { i: KanbanSquare, t: "Configurable pipeline", d: "Stages your admin controls." },
              { i: CalendarClock, t: "Server-side reminders", d: "Due tasks notify even when you're offline." },
              { i: Users, t: "Shared by the team", d: "Approved members see the same live records." },
            ].map(({ i: I, t, d }) => (
              <div key={t} className="rounded-lg border border-sidebar-border p-5">
                <I className="size-5 text-sidebar-primary" />
                <div className="mt-3 font-medium text-sidebar-accent-foreground">{t}</div>
                <div className="mt-1 text-sm">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
