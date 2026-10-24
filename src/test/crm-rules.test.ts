import { describe, it, expect } from 'vitest';
import { summarizeLeads } from '@/lib/crm-summary';
import { contactImportError } from '@/lib/contact-import';
import { localInputToIso, isoToLocalInput } from '@/lib/crm';
describe('CRM rules',()=>{
 it('flags missing follow-up without inventing a date',()=>{const row={outcome:'open',archived_at:null,next_follow_up_at:null,estimated_value:null,currency:'AED'};expect(summarizeLeads([row]).missing).toBe(1);expect(row.next_follow_up_at).toBeNull();});
 it('stores Dubai times as UTC and round trips',()=>{expect(localInputToIso('2026-10-20T17:31')).toBe('2026-10-20T13:31:00.000Z');expect(isoToLocalInput('2026-10-20T13:31:00Z')).toBe('2026-10-20T17:31');});
 it('keeps currencies separate',()=>{expect(summarizeLeads([{outcome:'open',archived_at:null,next_follow_up_at:null,estimated_value:100,currency:'AED'},{outcome:'open',archived_at:null,next_follow_up_at:null,estimated_value:50,currency:'USD'}]).values).toEqual({AED:100,USD:50});});
 it('validates each import row before saving',()=>{expect(contactImportError({name:'Ali',email:'bad',companyId:'1'})).toBe('Invalid email');expect(contactImportError({name:'Ali',email:'',companyId:''})).toBe('Company not found');expect(contactImportError({name:'',email:'',companyId:'1'})).toBe('Missing name');expect(contactImportError({name:'Ali',email:'ali@example.com',companyId:'1'})).toBe('');});
});