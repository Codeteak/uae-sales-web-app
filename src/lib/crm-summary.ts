type Opportunity = { outcome: string; archived_at: string | null; next_follow_up_at: string | null; estimated_value: number | null; currency: string | null };
export function summarizeLeads(rows: Opportunity[], now = Date.now()) {
  const active = rows.filter(r => !r.archived_at);
  const open = active.filter(r => r.outcome === 'open');
  const values: Record<string, number> = {};
  for (const r of open) values[r.currency || 'AED'] = (values[r.currency || 'AED'] || 0) + (r.estimated_value || 0);
  const won = active.filter(r => r.outcome === 'won').length;
  const closed = active.filter(r => r.outcome !== 'open').length;
  return { active, open, values, won, closed, winRate: closed ? Math.round(won / closed * 100) : 0,
    missing: open.filter(r => !r.next_follow_up_at).length,
    overdue: open.filter(r => r.next_follow_up_at && new Date(r.next_follow_up_at).getTime() < now).length };
}