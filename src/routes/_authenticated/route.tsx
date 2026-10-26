import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Bell,
  Building2,
  CheckSquare,
  KanbanSquare,
  LayoutDashboard,
  LineChart,
  ListFilter,
  LogOut,
  Menu,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { COMMON_TIMEZONES, errMsg, useMe } from "@/lib/crm";
import { toast } from "sonner";
import { NativeSelect } from "@/components/crm/dialogs";
import { PoweredByCodeteak, YaadroLogo } from "@/components/brand/yaadro-logo";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) throw redirect({ to: "/auth" });
    const { data: p, error: profileError } = await supabase
      .from("profiles")
      .select("account_status")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError || !p || p.account_status !== "active") throw redirect({ to: "/pending" });
  },
  component: Layout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "All leads", icon: ListFilter },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/tasks", label: "My tasks", icon: CheckSquare },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/reports", label: "Reports", icon: LineChart },
] as const;

function useUnread(userId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("notif-" + userId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["unread"] });
          qc.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[notifications realtime]", status, err);
        }
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);
  return useQuery({
    queryKey: ["unread", userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", userId!)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function NavList({ onNav, unread, isAdmin }: { onNav?: (() => void) | undefined; unread: number; isAdmin: boolean }) {
  const cls =
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: I }) => (
        <Link
          key={to}
          to={to}
          onClick={onNav}
          className={cls}
          activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
        >
          <I className="size-4" />
          <span className="flex-1">{label}</span>
          {to === "/notifications" && unread > 0 && (
            <span className="rounded-full bg-sidebar-primary px-1.5 text-xs font-semibold text-sidebar-primary-foreground">
              {unread}
            </span>
          )}
        </Link>
      ))}
      {isAdmin && (
        <Link to="/admin" onClick={onNav} className={cls} activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}>
          <Settings className="size-4" /> Admin settings
        </Link>
      )}
    </nav>
  );
}

function Layout() {
  const { data: me } = useMe();
  const { data: unread = 0 } = useUnread(me?.user.id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const side = (onNav?: () => void) => (
    <div className="flex h-full flex-col p-4 pb-5">
      <Link to="/dashboard" onClick={onNav} className="mb-5 flex shrink-0 items-center px-1">
        <YaadroLogo variant="full" size="lg" onDark />
      </Link>
      <Button
        asChild
        className="mb-5 shrink-0 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
      >
        <Link to="/leads/new" onClick={onNav}>
          <Plus /> Quick-add lead
        </Link>
      </Button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavList onNav={onNav} unread={unread} isAdmin={!!me?.isAdmin} />
      </div>
      <div className="mt-4 shrink-0 border-t border-sidebar-border pt-4">
        <div className="px-2 text-sm font-medium text-sidebar-accent-foreground">{me?.profile?.full_name}</div>
        <div className="px-2 text-xs">{me?.isAdmin ? "Admin" : "Team member"}</div>
        {me?.profile && (
          <label className="mt-3 block px-2 text-xs">
            <span className="mb-1 block text-sidebar-foreground/80">Timezone</span>
            <NativeSelect
              aria-label="Timezone"
              className="h-8 border-sidebar-border bg-sidebar text-sidebar-foreground"
              value={me.profile.timezone || "Asia/Dubai"}
              onChange={async (e) => {
                const timezone = e.target.value;
                const { data, error } = await supabase
                  .from("profiles")
                  .update({ timezone })
                  .eq("id", me.user.id)
                  .eq("updated_at", me.profile!.updated_at)
                  .select("id");
                if (error) toast.error(errMsg(error));
                else if (!data?.length) toast.error("Profile changed. Refresh and try again.");
                else {
                  toast.success("Timezone updated");
                  void qc.invalidateQueries({ queryKey: ["me"] });
                }
              }}
            >
              {Array.from(new Set([me.profile.timezone, ...COMMON_TIMEZONES])).filter(Boolean).map((tz) => (
                <option key={tz} value={tz!}>
                  {tz}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <button onClick={signOut} className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent">
          <LogOut className="size-4" /> Sign out
        </button>
        <div className="mt-4 px-1">
          <PoweredByCodeteak light size="md" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 bg-sidebar text-sidebar-foreground lg:block">{side()}</aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button aria-label="Open menu"><Menu className="size-5" /></button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
            {side(() => setOpen(false))}
          </SheetContent>
        </Sheet>
        <YaadroLogo variant="full" size="md" onDark className="max-w-[180px]" />
        <Link to="/notifications" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-sidebar-primary" />}
        </Link>
      </header>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

