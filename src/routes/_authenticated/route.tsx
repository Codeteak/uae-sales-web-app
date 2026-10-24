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
import { useMe } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: p } = await supabase.from("profiles").select("account_status").eq("id", data.user.id).maybeSingle();
    if (p?.account_status !== "active") throw redirect({ to: "/pending" });
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
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);
  return useQuery({
    queryKey: ["unread", userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", userId!)
        .is("read_at", null);
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
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to="/dashboard" onClick={onNav} className="flex items-center gap-2 px-2 font-display font-semibold text-sidebar-accent-foreground">
        <span className="grid size-7 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">L</span>
        Ledger CRM
      </Link>
      <Button asChild className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
        <Link to="/leads/new" onClick={onNav}>
          <Plus /> Quick-add lead
        </Link>
      </Button>
      <NavList onNav={onNav} unread={unread} isAdmin={!!me?.isAdmin} />
      <div className="mt-auto border-t border-sidebar-border pt-4">
        <div className="px-2 text-sm font-medium text-sidebar-accent-foreground">{me?.profile?.full_name}</div>
        <div className="px-2 text-xs">{me?.isAdmin ? "Admin" : "Team member"}</div>
        <button onClick={signOut} className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent">
          <LogOut className="size-4" /> Sign out
        </button>
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
        <span className="font-display font-semibold text-sidebar-accent-foreground">Ledger CRM</span>
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

