import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LEAD_LIST_SELECT, type LeadRow } from './crm';

export const leadsOptions = queryOptions({ queryKey: ['leads'], queryFn: async () => {
  const rows: LeadRow[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase.from('leads').select(LEAD_LIST_SELECT).order('updated_at', { ascending: false }).order('id').range(start, start + 499);
    if (error) throw error;
    rows.push(...data as LeadRow[]);
    if (data.length < 500) return rows;
  }
} });
export const companiesOptions = queryOptions({ queryKey: ['companies'], queryFn: async () => {
  const rows = []; for (let start=0;;start+=500) { const {data,error}=await supabase.from('companies').select('*').order('company_name').order('id').range(start,start+499); if(error)throw error; rows.push(...data); if(data.length<500)return rows; }
} });
export const contactsOptions = queryOptions({ queryKey: ['contacts'], queryFn: async () => {
  const rows=[]; for(let start=0;;start+=500){const {data,error}=await supabase.from('contacts').select('*, company:companies(company_name)').order('full_name').order('id').range(start,start+499);if(error)throw error;rows.push(...data);if(data.length<500)return rows;}
} });
export const tasksOptions = queryOptions({ queryKey: ['tasks'], queryFn: async () => {
  const rows=[];for(let start=0;;start+=500){const {data,error}=await supabase.from('tasks').select('*, lead:leads(id, reference, lead_title), owner:profiles!tasks_assigned_to_fkey(full_name)').order('due_at').order('id').range(start,start+499);if(error)throw error;rows.push(...data);if(data.length<500)return rows;}
} });
export const settingsOptions = queryOptions({queryKey:['settings'],queryFn:async()=>{const {data,error}=await supabase.from('app_settings').select('*').eq('id',1).single();if(error)throw error;return data;}});
export const leadOptions = (id: string) => queryOptions({ queryKey: ['lead', id], queryFn: async () => {
  const { data, error } = await supabase.from('leads').select(LEAD_LIST_SELECT).eq('id', id).single();
  if (error) throw error;
  return data as LeadRow;
} });
export const leadActivitiesOptions = (id: string) => queryOptions({ queryKey: ['activities', id], queryFn: async () => {
  const { data, error } = await supabase.from('activities').select('*, contact:contacts(full_name), actor:profiles!activities_performed_by_fkey(full_name)').eq('lead_id', id).order('occurred_at', { ascending: false }).limit(200);
  if (error) throw error;
  return data;
} });
export const leadTasksOptions = (id: string) => queryOptions({ queryKey: ['tasks', 'lead', id], queryFn: async () => {
  const { data, error } = await supabase.from('tasks').select('*, owner:profiles!tasks_assigned_to_fkey(full_name)').eq('lead_id', id).order('status').order('due_at');
  if (error) throw error;
  return data;
} });
export const notificationsOptions = queryOptions({ queryKey: ['notifications'], queryFn: async () => {
  const { data, error } = await supabase.from('notifications').select('*, lead:leads(reference, lead_title)').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return data;
} });
export const auditOptions = queryOptions({ queryKey: ['audit'], queryFn: async () => {
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return data;
} });
export function money(value: number | null, currency='AED') { return new Intl.NumberFormat('en-GB',{style:'currency',currency,maximumFractionDigits:0}).format(value??0); }
export const rolesOptions = queryOptions({queryKey:['roles'],queryFn:async()=>{const {data,error}=await supabase.from('user_roles').select('*');if(error)throw error;return data;}});
export const allReasonsOptions = queryOptions({queryKey:['all-reasons'],queryFn:async()=>{const {data,error}=await supabase.from('lost_reasons').select('*').order('position');if(error)throw error;return data;}});