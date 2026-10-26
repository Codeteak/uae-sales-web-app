import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CalendarClock, MapPin, Users, KanbanSquare } from "lucide-react";
import { PoweredByCodeteak, YaadroLogo } from "@/components/brand/yaadro-logo";
import { BRAND, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: brandTitle() },
      { name: "description", content: BRAND.description },
      { property: "og:title", content: brandTitle() },
      { property: "og:description", content: BRAND.description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);
  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <YaadroLogo variant="full" size="lg" onDark />
          <span className="hidden items-center gap-1.5 text-xs text-sidebar-foreground/70 sm:inline-flex">
            <MapPin className="size-3.5" />
            Built for UAE sales teams
          </span>
        </div>
        <div className="flex flex-1 flex-col justify-center py-16">
          <p className="mb-3 text-sm font-medium tracking-wide text-sidebar-primary uppercase">
            {BRAND.productName} · {BRAND.region}
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold text-sidebar-accent-foreground sm:text-5xl">
            Every lead has an owner. Every follow-up has a date.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-sidebar-foreground/85">
            The shared sales record for Yaadro’s UAE team — companies, contacts, activity history and reminders in one place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <Link to="/auth" search={{ mode: "register" }}>Request access</Link>
            </Button>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            {[
              { i: KanbanSquare, t: "Configurable pipeline", d: "Stages your Yaadro admin controls." },
              { i: CalendarClock, t: "Server-side reminders", d: "Due tasks notify even when you're offline." },
              { i: Users, t: "Shared by the team", d: "Approved members see the same live UAE sales records." },
            ].map(({ i: I, t, d }) => (
              <div key={t} className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-5">
                <I className="size-5 text-sidebar-primary" />
                <div className="mt-3 font-medium text-sidebar-accent-foreground">{t}</div>
                <div className="mt-1 text-sm text-sidebar-foreground/80">{d}</div>
              </div>
            ))}
          </div>
        </div>
        <footer className="border-t border-sidebar-border pt-6">
          <PoweredByCodeteak light />
        </footer>
      </div>
    </div>
  );
}
