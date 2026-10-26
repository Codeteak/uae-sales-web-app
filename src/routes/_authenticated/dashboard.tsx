import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from '@tanstack/react-query';
import { PageHeader, pageMeta, Empty } from "@/components/crm/page-header";
import { leadsOptions, tasksOptions, money } from '@/lib/crm-data';
import { summarizeLeads } from '@/lib/crm-summary';
import { TaskList } from '@/components/crm/task-list';
import { Button } from '@/components/ui/button';
import { FollowUpBadge } from '@/components/crm/badges';
import { useMe } from '@/lib/crm';

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageMeta("Dashboard", "Yaadro sales dashboard for your UAE team."),
  loader: async ({context}) => { await Promise.all([context.queryClient.ensureQueryData(leadsOptions), context.queryClient.ensureQueryData(tasksOptions)]); },
  component: Page,
});

function Page() {
  const {data: leads} = useSuspenseQuery(leadsOptions);
  const {data: tasks} = useSuspenseQuery(tasksOptions);
  const {data: me} = useMe();
  const s = summarizeLeads(leads);
  const attention = leads.filter(l=>!l.archived_at && l.outcome==='open' && (!l.next_follow_up_at || new Date(l.next_follow_up_at).getTime()<Date.now())).sort((a,b)=>(a.next_follow_up_at||'').localeCompare(b.next_follow_up_at||''));
  return (
    <div>
      <PageHeader title="Dashboard" sub={`Welcome, ${me?.profile?.full_name || 'team'}`}><Button asChild><Link to="/leads/new">Add lead</Link></Button></PageHeader>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">{[['Open opportunities',s.open.length],['Overdue follow-ups',s.overdue],['Missing follow-up',s.missing],['Won opportunities',s.won]].map(([label,value])=><div key={label} className="border-l-2 border-primary pl-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</div>
      <div className="mb-8 flex flex-wrap gap-6">{Object.entries(s.values).map(([currency,value])=><div key={currency}><p className="text-xs text-muted-foreground">Open pipeline · {currency}</p><p className="text-xl font-semibold">{money(value,currency)}</p></div>)}</div>
      <section className="mb-8"><h2 className="mb-4 text-lg font-semibold">Needs attention</h2>{!attention.length?<Empty>No overdue or missing follow-ups.</Empty>:<div className="divide-y">{attention.slice(0,15).map(l=><div key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><Link className="font-medium text-primary" to="/leads/$id" params={{id:l.id}}>{l.lead_title}</Link><p className="text-xs text-muted-foreground">{l.company?.company_name} · {l.owner?.full_name}</p></div><FollowUpBadge lead={l}/></div>)}</div>}</section>
      <section><h2 className="mb-4 text-lg font-semibold">My pending tasks</h2><TaskList tasks={tasks.filter(t=>t.assigned_to===me?.user.id&&t.status==='pending').slice(0,15)}/></section>
    </div>
  );
}
