import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CompleteTaskDialog, TaskDialog, cancelTask } from './dialogs';
import { PriorityBadge } from './badges';
import { Empty } from './page-header';
import { fmtDateTime, type Task } from '@/lib/crm';
type TaskItem = Task & {lead?:{id:string;lead_title:string;reference:string}|null;owner?:{full_name:string}|null};
export function TaskList({tasks}:{tasks:TaskItem[]}){
 const qc=useQueryClient();const [complete,setComplete]=useState<Task|null>(null),[edit,setEdit]=useState<Task|null>(null);
 return <>{tasks.length?<div className="divide-y rounded-lg border bg-card">{tasks.map(t=><div key={t.id} className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="break-words font-medium">{t.title}</p>{t.lead&&<Link to="/leads/$id" params={{id:t.lead_id}} className="text-xs text-primary hover:underline">{t.lead.reference} · {t.lead.lead_title}</Link>}<p className="mt-1 text-xs text-muted-foreground">{t.owner?.full_name} · {fmtDateTime(t.due_at)}{t.is_internal_reminder?' · Team reminder':''}</p>{t.completion_notes&&<p className="mt-2 text-sm text-muted-foreground">{t.completion_notes}</p>}</div><PriorityBadge p={t.priority}/>{t.status==='pending'?<div className="flex gap-1"><Button variant="ghost" size="icon" title="Complete task" aria-label={`Complete ${t.title}`} onClick={()=>setComplete(t)}><Check className="size-4"/></Button><Button variant="ghost" size="icon" title="Reschedule task" aria-label={`Edit ${t.title}`} onClick={()=>setEdit(t)}><Pencil className="size-4"/></Button><Button variant="ghost" size="icon" title="Cancel task" aria-label={`Cancel ${t.title}`} onClick={async()=>{if(window.confirm('Cancel this task?')&&await cancelTask(t.id,t.updated_at))await qc.invalidateQueries();}}><X className="size-4"/></Button></div>:<span className="text-xs capitalize text-muted-foreground">{t.status} {t.completed_at&&fmtDateTime(t.completed_at)}</span>}</div>)}</div>:<Empty>No tasks in this view.</Empty>}<CompleteTaskDialog task={complete} onOpenChange={o=>{if(!o)setComplete(null);}}/>{edit&&<TaskDialog key={edit.id} open onOpenChange={o=>{if(!o)setEdit(null);}} leadId={edit.lead_id} task={edit}/>}</>;
}