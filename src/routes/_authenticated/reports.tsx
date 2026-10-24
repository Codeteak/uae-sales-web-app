import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader, pageMeta, Empty } from "@/components/crm/page-header";
import { leadsOptions, money } from '@/lib/crm-data';
import { summarizeLeads } from '@/lib/crm-summary';
import { downloadFile, toCsv } from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download } from 'lucide-react';

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => pageMeta("Reports", "Reports in your team's shared sales CRM."),
  loader: ({context}) => context.queryClient.ensureQueryData(leadsOptions),
  component: Page,
});

function Page() {
  const {data: all} = useSuspenseQuery(leadsOptions);
  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  const rows=all.filter(l=>!l.archived_at&&(!from||new Date(l.created_at).getTime()>=new Date(`${from}T00:00:00+04:00`).getTime())&&(!to||new Date(l.created_at).getTime()<new Date(`${to}T00:00:00+04:00`).getTime()+86400000));
  const s=summarizeLeads(rows);
  const groups=Array.from(new Set(rows.map(l=>l.owner?.full_name||'Unassigned'))).map(owner=>{const g=rows.filter(l=>(l.owner?.full_name||'Unassigned')===owner);const x=summarizeLeads(g);return {owner,total:g.length,open:x.open.length,won:x.won,win_rate:x.winRate,overdue:x.overdue,missing:x.missing};});
  return (
    <div>
      <PageHeader title="Reports"><Button variant="outline" onClick={()=>downloadFile('sales-report.csv',toCsv(groups))}><Download/>Export</Button></PageHeader>
      <div className="mb-6 flex flex-wrap gap-4"><label className="text-xs">Created from<Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-xs">Created through<Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">{[['Opportunities',rows.length],['Won',s.won],['Closed',s.closed],['Win rate',`${s.winRate}%`]].map(([label,value])=><div key={label} className="border-l-2 border-primary pl-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>)}</div>
      <section className="mb-8"><h2 className="mb-3 font-semibold">Pipeline by currency</h2>{Object.entries(s.values).map(([currency,value])=><p key={currency} className="py-1">{currency}: <strong>{money(value,currency)}</strong></p>)}</section>
      {!groups.length?<Empty>No opportunities in this period.</Empty>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-muted-foreground"><tr>{['Salesperson','Total','Open','Won','Win rate','Overdue','Missing date'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{groups.map(g=><tr key={g.owner} className="border-b"><td className="p-3">{g.owner}</td>{[g.total,g.open,g.won,`${g.win_rate}%`,g.overdue,g.missing].map((v,i)=><td key={i} className="p-3">{v}</td>)}</tr>)}</tbody></table></div>}
      <section className="mt-8"><h2 className="mb-3 font-semibold">Stage distribution</h2>{Array.from(new Set(rows.map(l=>l.stage?.stage_name||'Unknown'))).map(stage=><div key={stage} className="flex justify-between border-b py-3 text-sm"><span>{stage}</span><strong>{rows.filter(l=>(l.stage?.stage_name||'Unknown')===stage).length}</strong></div>)}</section>
    </div>
  );
}
