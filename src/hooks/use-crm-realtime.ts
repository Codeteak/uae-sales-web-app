import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Invalidate shared CRM caches when teammates change data (debounced to avoid request storms). */
export function useCrmRealtime(enabled: boolean) {
  const qc = useQueryClient();
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const flush = () => {
      timer.current = null;
      const keys = [...pending.current];
      pending.current.clear();
      for (const key of keys) void qc.invalidateQueries({ queryKey: [key] });
    };

    const schedule = (...keys: string[]) => {
      for (const key of keys) pending.current.add(key);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 1500);
    };

    const channel = supabase
      .channel("crm-desk-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () =>
        schedule("leads", "lead"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => schedule("tasks"))
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, () =>
        schedule("companies"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () =>
        schedule("contacts"),
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[crm realtime]", status, err);
        }
      });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
