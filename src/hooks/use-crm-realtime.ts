import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Invalidate shared CRM caches when teammates change data. */
export function useCrmRealtime(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const invalidate = (keys: string[][]) => {
      for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
    };

    const channel = supabase
      .channel("crm-desk-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () =>
        invalidate([["leads"], ["lead"]]),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () =>
        invalidate([["tasks"]]),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, () =>
        invalidate([["companies"]]),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () =>
        invalidate([["contacts"]]),
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[crm realtime]", status, err);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
