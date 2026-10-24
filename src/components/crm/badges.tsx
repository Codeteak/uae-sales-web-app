import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CalendarClock, CalendarX2, CheckCircle2 } from "lucide-react";
import { fmtDateTime, followUpState, type Lead, type Priority } from "@/lib/crm";

export function PriorityBadge({ p }: { p: Priority }) {
  const v = p === "urgent" ? "danger" : p === "high" ? "warning" : p === "medium" ? "accent" : "muted";
  return (
    <Badge variant={v} className="capitalize">
      {p}
    </Badge>
  );
}

export function OutcomeBadge({ o }: { o: Lead["outcome"] }) {
  if (o === "open") return <Badge variant="accent">Open</Badge>;
  if (o === "won") return <Badge variant="success">Won</Badge>;
  return (
    <Badge variant="danger" className="capitalize">
      {o}
    </Badge>
  );
}

export function FollowUpBadge({ lead }: { lead: Pick<Lead, "next_follow_up_at" | "outcome"> }) {
  const s = followUpState(lead);
  if (s === "closed") return <span className="text-muted-foreground">—</span>;
  if (s === "missing")
    return (
      <Badge variant="warning" className="gap-1 whitespace-nowrap">
        <CalendarX2 className="size-3" /> Follow-up not scheduled
      </Badge>
    );
  if (s === "overdue")
    return (
      <Badge variant="danger" className="gap-1 whitespace-nowrap">
        <AlertTriangle className="size-3" /> Overdue · {fmtDateTime(lead.next_follow_up_at)}
      </Badge>
    );
  if (s === "today")
    return (
      <Badge variant="warning" className="gap-1 whitespace-nowrap">
        <CalendarClock className="size-3" /> Today · {fmtDateTime(lead.next_follow_up_at).slice(-5)}
      </Badge>
    );
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
      <CheckCircle2 className="size-3 text-success" /> {fmtDateTime(lead.next_follow_up_at)}
    </span>
  );
}
