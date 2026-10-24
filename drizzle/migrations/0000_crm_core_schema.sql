
-- ENUMS
create type public.app_role as enum ('admin','member');
create type public.account_status as enum ('pending','active','rejected','deactivated');
create type public.lead_priority as enum ('low','medium','high','urgent');
create type public.lead_outcome as enum ('open','won','lost','disqualified');
create type public.stage_category as enum ('open','won','lost');
create type public.task_status as enum ('pending','completed','cancelled');
create type public.contact_role as enum ('decision_maker','purchasing_manager','buyer','influencer','assistant','other');
create type public.activity_type as enum ('call','meeting','email','message','note','stage_change','assignment','follow_up','created','updated','archived','restored','outcome','contact','other');

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  account_status public.account_status not null default 'pending',
  timezone text not null default 'Asia/Dubai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_active_user(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = _user_id and account_status = 'active')
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user(_user_id) and public.has_role(_user_id, 'admin')
$$;

-- profiles policies
create policy "own profile readable" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user(auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));

create policy "roles readable" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_active_user(auth.uid()));
create policy "admins manage roles" on public.user_roles for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- guard: non-admins cannot change status/email
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    if new.account_status is distinct from old.account_status or new.email is distinct from old.email then
      raise exception 'Only admins can change account status';
    end if;
  end if;
  if auth.uid() is not null and new.id = auth.uid() and new.account_status is distinct from old.account_status then
    raise exception 'You cannot change your own account status';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_guard_profile before update on public.profiles for each row execute function public.guard_profile_update();

create or replace function public.guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(new.user_id, old.user_id) = auth.uid() and tg_op = 'DELETE' and old.role = 'admin' then
    raise exception 'You cannot remove your own admin role';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard_role before delete on public.user_roles for each row execute function public.guard_role_change();

-- SETTINGS
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  auto_approve_registrations boolean not null default false,
  default_timezone text not null default 'Asia/Dubai',
  default_currency text not null default 'AED',
  overdue_reminder_hours int not null default 24,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);
grant select, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "settings readable" on public.app_settings for select to authenticated using (public.is_active_user(auth.uid()));
create policy "settings admin" on public.app_settings for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create table public.lost_reasons (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  position int not null default 0,
  is_active boolean not null default true
);
insert into public.lost_reasons (label, position) values ('Price',1),('Competitor',2),('No response',3),('Timing',4),('Budget',5),('Other',6);
grant select, insert, update, delete on public.lost_reasons to authenticated;
grant all on public.lost_reasons to service_role;
alter table public.lost_reasons enable row level security;
create policy "reasons read" on public.lost_reasons for select to authenticated using (public.is_active_user(auth.uid()));
create policy "reasons admin" on public.lost_reasons for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- PIPELINE STAGES
create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  stage_name text not null,
  description text,
  position int not null default 0,
  category public.stage_category not null default 'open',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.pipeline_stages (stage_name, position, category) values
 ('New Lead',1,'open'),('Contacted',2,'open'),('Qualified',3,'open'),('Meeting / Discussion',4,'open'),
 ('Proposal Sent',5,'open'),('Negotiation',6,'open'),('Won',7,'won'),('Lost',8,'lost');
grant select, insert, update on public.pipeline_stages to authenticated;
grant all on public.pipeline_stages to service_role;
alter table public.pipeline_stages enable row level security;
create policy "stages read" on public.pipeline_stages for select to authenticated using (public.is_active_user(auth.uid()));
create policy "stages admin insert" on public.pipeline_stages for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "stages admin update" on public.pipeline_stages for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- normalization helpers
create or replace function public.norm_text(t text) returns text language sql immutable as $$
  select nullif(regexp_replace(lower(coalesce(t,'')), '[^a-z0-9]+', '', 'g'), '')
$$;
create or replace function public.norm_phone(t text) returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(t,''), '[^0-9]', '', 'g'), 9), '')
$$;

-- COMPANIES
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (length(trim(company_name)) between 1 and 200),
  industry text, website text, phone text, email text, address text, notes text,
  name_norm text generated always as (public.norm_text(company_name)) stored,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index on public.companies (name_norm);
grant select, insert, update, delete on public.companies to authenticated;
grant all on public.companies to service_role;
alter table public.companies enable row level security;
create policy "companies read" on public.companies for select to authenticated using (public.is_active_user(auth.uid()));
create policy "companies insert" on public.companies for insert to authenticated with check (public.is_active_user(auth.uid()));
create policy "companies update" on public.companies for update to authenticated using (public.is_active_user(auth.uid())) with check (public.is_active_user(auth.uid()));
create policy "companies delete" on public.companies for delete to authenticated using (public.is_admin(auth.uid()));

-- CONTACTS
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  job_title text, department text, phone_number text, email text,
  contact_role public.contact_role not null default 'other',
  is_primary boolean not null default false,
  notes text,
  name_norm text generated always as (public.norm_text(full_name)) stored,
  phone_norm text generated always as (public.norm_phone(phone_number)) stored,
  email_norm text generated always as (nullif(lower(trim(coalesce(email,''))),'')) stored,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index on public.contacts (company_id);
create index on public.contacts (phone_norm);
create index on public.contacts (email_norm);
grant select, insert, update, delete on public.contacts to authenticated;
grant all on public.contacts to service_role;
alter table public.contacts enable row level security;
create policy "contacts read" on public.contacts for select to authenticated using (public.is_active_user(auth.uid()));
create policy "contacts insert" on public.contacts for insert to authenticated with check (public.is_active_user(auth.uid()));
create policy "contacts update" on public.contacts for update to authenticated using (public.is_active_user(auth.uid())) with check (public.is_active_user(auth.uid()));
create policy "contacts delete" on public.contacts for delete to authenticated using (public.is_admin(auth.uid()));

-- LEADS
create sequence public.lead_ref_seq start 1001;
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('LD-' || nextval('public.lead_ref_seq')),
  company_id uuid not null references public.companies(id) on delete restrict,
  lead_title text not null check (length(trim(lead_title)) between 1 and 200),
  lead_source text,
  current_stage_id uuid not null references public.pipeline_stages(id),
  priority public.lead_priority not null default 'medium',
  assigned_user_id uuid not null references public.profiles(id),
  next_action text,
  next_follow_up_at timestamptz,
  expected_close_date date,
  estimated_value numeric(14,2) check (estimated_value is null or estimated_value >= 0),
  currency text,
  outcome public.lead_outcome not null default 'open',
  outcome_reason text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id),
  updated_at timestamptz not null default now(),
  last_customer_contact_at timestamptz,
  last_activity_at timestamptz default now(),
  archived_at timestamptz
);
create index on public.leads (current_stage_id);
create index on public.leads (assigned_user_id);
create index on public.leads (company_id);
create index on public.leads (next_follow_up_at);
create index on public.leads (updated_at desc);
grant select, insert, update, delete on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;
create policy "leads read" on public.leads for select to authenticated using (public.is_active_user(auth.uid()));
create policy "leads insert" on public.leads for insert to authenticated with check (public.is_active_user(auth.uid()));
create policy "leads update" on public.leads for update to authenticated using (public.is_active_user(auth.uid())) with check (public.is_active_user(auth.uid()));
create policy "leads delete" on public.leads for delete to authenticated using (public.is_admin(auth.uid()));

create table public.lead_contacts (
  lead_id uuid not null references public.leads(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (lead_id, contact_id)
);
create index on public.lead_contacts (contact_id);
grant select, insert, update, delete on public.lead_contacts to authenticated;
grant all on public.lead_contacts to service_role;
alter table public.lead_contacts enable row level security;
create policy "lc all" on public.lead_contacts for all to authenticated using (public.is_active_user(auth.uid())) with check (public.is_active_user(auth.uid()));

-- TASKS
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  assigned_to uuid not null references public.profiles(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  due_at timestamptz not null,
  status public.task_status not null default 'pending',
  priority public.lead_priority not null default 'medium',
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  completion_notes text,
  reminder_sent_at timestamptz,
  overdue_reminder_sent_at timestamptz,
  is_internal_reminder boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tasks (assigned_to, status, due_at);
create index on public.tasks (lead_id);
create index on public.tasks (status, due_at) where status = 'pending';
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create policy "tasks read" on public.tasks for select to authenticated using (public.is_active_user(auth.uid()));
create policy "tasks insert" on public.tasks for insert to authenticated with check (public.is_active_user(auth.uid()));
create policy "tasks update" on public.tasks for update to authenticated using (public.is_active_user(auth.uid())) with check (public.is_active_user(auth.uid()));
create policy "tasks delete" on public.tasks for delete to authenticated using (public.is_admin(auth.uid()));

-- ACTIVITIES (append-only for members)
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  activity_type public.activity_type not null,
  summary text not null,
  details text,
  outcome text,
  performed_by uuid default auth.uid() references public.profiles(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  related_task_id uuid references public.tasks(id) on delete set null
);
create index on public.activities (lead_id, occurred_at desc);
grant select, insert on public.activities to authenticated;
grant all on public.activities to service_role;
alter table public.activities enable row level security;
create policy "act read" on public.activities for select to authenticated using (public.is_active_user(auth.uid()));
create policy "act insert" on public.activities for insert to authenticated with check (public.is_active_user(auth.uid()) and performed_by = auth.uid());

-- NOTIFICATIONS
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id),
  lead_id uuid references public.leads(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deduplication_key text unique
);
create index on public.notifications (recipient_user_id, read_at, created_at desc);
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "notif own read" on public.notifications for select to authenticated using (recipient_user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "notif own update" on public.notifications for update to authenticated using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

-- AUDIT LOG
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  entity_type text not null,
  entity_id text not null,
  action_type text not null,
  changed_fields text[],
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (entity_type, entity_id);
create index on public.audit_log (created_at desc);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "audit admin read" on public.audit_log for select to authenticated using (public.is_admin(auth.uid()));

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare oldj jsonb; newj jsonb; changed text[];
begin
  if tg_op = 'INSERT' then newj := to_jsonb(new);
  elsif tg_op = 'DELETE' then oldj := to_jsonb(old);
  else
    oldj := to_jsonb(old); newj := to_jsonb(new);
    select array_agg(key) into changed from jsonb_each(newj) n
      where n.value is distinct from oldj->n.key and n.key not in ('updated_at','last_activity_at');
    if changed is null then return new; end if;
  end if;
  insert into public.audit_log(actor_user_id, entity_type, entity_id, action_type, changed_fields, previous_values, new_values)
  values (auth.uid(), tg_table_name, coalesce(newj->>'id', oldj->>'id', newj->>'user_id', oldj->>'user_id'), lower(tg_op), changed, oldj, newj);
  return coalesce(new, old);
end $$;
create trigger trg_audit after insert or update or delete on public.leads for each row execute function public.audit_trigger();
create trigger trg_audit after insert or update or delete on public.companies for each row execute function public.audit_trigger();
create trigger trg_audit after insert or update or delete on public.contacts for each row execute function public.audit_trigger();
create trigger trg_audit after insert or update or delete on public.tasks for each row execute function public.audit_trigger();
create trigger trg_audit after insert or update or delete on public.user_roles for each row execute function public.audit_trigger();
create trigger trg_audit after update on public.profiles for each row execute function public.audit_trigger();
create trigger trg_audit after insert or update on public.pipeline_stages for each row execute function public.audit_trigger();
create trigger trg_audit after update on public.app_settings for each row execute function public.audit_trigger();

-- generic updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger trg_touch before update on public.companies for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.contacts for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.tasks for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.pipeline_stages for each row execute function public.touch_updated_at();

-- SIGNUP HANDLER
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare first_user boolean; auto boolean; st public.account_status; adm record;
begin
  select not exists (select 1 from public.profiles) into first_user;
  select auto_approve_registrations into auto from public.app_settings where id = 1;
  st := case when first_user or coalesce(auto,false) then 'active' else 'pending' end;
  insert into public.profiles (id, full_name, email, account_status)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.email, st);
  insert into public.user_roles (user_id, role) values (new.id, case when first_user then 'admin'::public.app_role else 'member'::public.app_role end);
  if not first_user then
    for adm in select p.id from public.profiles p join public.user_roles r on r.user_id = p.id and r.role = 'admin' where p.account_status = 'active' loop
      insert into public.notifications (recipient_user_id, notification_type, title, message, deduplication_key)
      values (adm.id, 'registration', 'New registration awaiting approval',
        coalesce(new.raw_user_meta_data->>'full_name', new.email) || ' (' || new.email || ') registered.',
        'reg:' || new.id || ':' || adm.id);
    end loop;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.touch_last_login() returns void language sql security definer set search_path = public as $$
  update public.profiles set last_login_at = now() where id = auth.uid();
$$;

-- LEAD LOGIC
create or replace function public.lead_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare cat public.stage_category; active_assignee boolean;
begin
  select category into cat from public.pipeline_stages where id = new.current_stage_id;
  if tg_op = 'INSERT' or new.current_stage_id is distinct from old.current_stage_id then
    if cat = 'won' then new.outcome := 'won';
    elsif cat = 'lost' then
      if new.outcome not in ('lost','disqualified') then new.outcome := 'lost'; end if;
    elsif tg_op = 'UPDATE' and old.outcome <> 'open' and new.outcome = old.outcome then new.outcome := 'open'; new.outcome_reason := null;
    end if;
  end if;
  if new.outcome in ('lost','disqualified') and length(trim(coalesce(new.outcome_reason,''))) = 0 then
    raise exception 'A reason is required when marking a lead Lost or Disqualified';
  end if;
  if tg_op = 'INSERT' or new.assigned_user_id is distinct from old.assigned_user_id then
    select public.is_active_user(new.assigned_user_id) into active_assignee;
    if not active_assignee then raise exception 'Leads must be assigned to an active salesperson'; end if;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;
create trigger trg_lead_before before insert or update on public.leads for each row execute function public.lead_before_write();

create or replace function public.lead_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare s_old text; s_new text; actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.activities(lead_id, activity_type, summary, performed_by) values (new.id, 'created', 'Lead created', coalesce(actor, new.created_by));
    if new.assigned_user_id <> coalesce(actor, new.created_by) then
      insert into public.notifications(recipient_user_id, actor_user_id, lead_id, notification_type, title, message)
      values (new.assigned_user_id, actor, new.id, 'lead_assigned', 'Lead assigned to you', new.lead_title || ' (' || new.reference || ')');
    end if;
    return new;
  end if;
  if new.current_stage_id is distinct from old.current_stage_id then
    select stage_name into s_old from public.pipeline_stages where id = old.current_stage_id;
    select stage_name into s_new from public.pipeline_stages where id = new.current_stage_id;
    insert into public.activities(lead_id, activity_type, summary, details, performed_by)
    values (new.id, 'stage_change', 'Stage: ' || coalesce(s_old,'?') || ' → ' || coalesce(s_new,'?'), new.outcome_reason, actor);
  end if;
  if new.outcome is distinct from old.outcome then
    insert into public.activities(lead_id, activity_type, summary, details, performed_by)
    values (new.id, 'outcome', 'Outcome: ' || new.outcome, new.outcome_reason, actor);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.activities(lead_id, activity_type, summary, performed_by)
    values (new.id, 'updated', 'Priority: ' || old.priority || ' → ' || new.priority, actor);
  end if;
  if new.assigned_user_id is distinct from old.assigned_user_id then
    insert into public.activities(lead_id, activity_type, summary, performed_by)
    values (new.id, 'assignment', 'Reassigned to ' || (select full_name from public.profiles where id = new.assigned_user_id), actor);
    if new.assigned_user_id is distinct from actor then
      insert into public.notifications(recipient_user_id, actor_user_id, lead_id, notification_type, title, message)
      values (new.assigned_user_id, actor, new.id, 'lead_assigned', 'Lead assigned to you', new.lead_title || ' (' || new.reference || ')');
    end if;
  end if;
  if new.archived_at is distinct from old.archived_at then
    insert into public.activities(lead_id, activity_type, summary, performed_by)
    values (new.id, case when new.archived_at is null then 'restored' else 'archived' end, case when new.archived_at is null then 'Lead restored' else 'Lead archived' end, actor);
  end if;
  return new;
end $$;
create trigger trg_lead_after after insert or update on public.leads for each row execute function public.lead_after_write();

-- archive / restore only admin? spec: admins archive/restore. enforce.
create or replace function public.guard_archive() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.archived_at is distinct from old.archived_at and auth.uid() is not null and not public.is_admin(auth.uid()) then
    raise exception 'Only admins can archive or restore records';
  end if;
  return new;
end $$;
create trigger trg_guard_archive before update on public.leads for each row execute function public.guard_archive();
create trigger trg_guard_archive before update on public.companies for each row execute function public.guard_archive();
create trigger trg_guard_archive before update on public.contacts for each row execute function public.guard_archive();

-- ACTIVITY → lead timestamps
create or replace function public.activity_after_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.activity_type in ('call','meeting','email','message') then
    update public.leads set last_customer_contact_at = greatest(coalesce(last_customer_contact_at, new.occurred_at), new.occurred_at),
      last_activity_at = now() where id = new.lead_id;
  elsif new.activity_type not in ('assignment') then
    update public.leads set last_activity_at = now() where id = new.lead_id;
  end if;
  return new;
end $$;
create trigger trg_activity_after after insert on public.activities for each row execute function public.activity_after_insert();

-- TASK logic
create or replace function public.sync_lead_follow_up(_lead uuid) returns void language sql security definer set search_path = public as $$
  update public.leads set next_follow_up_at = (select min(due_at) from public.tasks where lead_id = _lead and status = 'pending')
  where id = _lead;
$$;

create or replace function public.task_before_write() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
    if not public.is_active_user(new.assigned_to) then raise exception 'Tasks must be assigned to an active user'; end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.due_at is distinct from old.due_at then
      new.reminder_sent_at := null; new.overdue_reminder_sent_at := null;
    end if;
    if new.status = 'completed' and old.status <> 'completed' then
      new.completed_at := now(); new.completed_by := coalesce(auth.uid(), new.completed_by);
    elsif new.status = 'pending' and old.status <> 'pending' then
      new.completed_at := null; new.completed_by := null;
    end if;
  end if;
  return new;
end $$;
create trigger trg_task_before before insert or update on public.tasks for each row execute function public.task_before_write();

create or replace function public.task_after_write() returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); lt text;
begin
  select lead_title into lt from public.leads where id = new.lead_id;
  if tg_op = 'INSERT' then
    insert into public.activities(lead_id, contact_id, activity_type, summary, details, performed_by, related_task_id)
    values (new.lead_id, new.contact_id, 'follow_up', case when new.is_internal_reminder then 'Team reminder: ' else 'Task scheduled: ' end || new.title,
      'Due ' || to_char(new.due_at at time zone 'Asia/Dubai', 'DD Mon YYYY HH24:MI') || ' (Dubai)', coalesce(actor,new.created_by), new.id);
    if new.assigned_to is distinct from actor then
      insert into public.notifications(recipient_user_id, actor_user_id, lead_id, task_id, notification_type, title, message, deduplication_key)
      values (new.assigned_to, actor, new.lead_id, new.id, case when new.is_internal_reminder then 'team_reminder' else 'task_assigned' end,
        case when new.is_internal_reminder then 'Reminder from a colleague: ' else 'New task: ' end || new.title,
        coalesce(lt,'') || ' — due ' || to_char(new.due_at at time zone 'Asia/Dubai', 'DD Mon HH24:MI'),
        'assign:' || new.id || ':' || new.assigned_to);
    end if;
  else
    if new.assigned_to is distinct from old.assigned_to then
      insert into public.activities(lead_id, activity_type, summary, performed_by, related_task_id)
      values (new.lead_id, 'assignment', 'Task "' || new.title || '" reassigned to ' || (select full_name from public.profiles where id = new.assigned_to), actor, new.id);
      if new.assigned_to is distinct from actor then
        insert into public.notifications(recipient_user_id, actor_user_id, lead_id, task_id, notification_type, title, message, deduplication_key)
        values (new.assigned_to, actor, new.lead_id, new.id, 'task_assigned', 'Task reassigned to you: ' || new.title,
          coalesce(lt,'') || ' — due ' || to_char(new.due_at at time zone 'Asia/Dubai', 'DD Mon HH24:MI'),
          'assign:' || new.id || ':' || new.assigned_to || ':' || extract(epoch from now())::bigint)
        on conflict (deduplication_key) do nothing;
      end if;
    end if;
    if new.due_at is distinct from old.due_at and new.status = 'pending' then
      insert into public.activities(lead_id, activity_type, summary, details, performed_by, related_task_id)
      values (new.lead_id, 'follow_up', 'Task rescheduled: ' || new.title, 'New due ' || to_char(new.due_at at time zone 'Asia/Dubai', 'DD Mon YYYY HH24:MI'), actor, new.id);
    end if;
    if new.status is distinct from old.status then
      insert into public.activities(lead_id, activity_type, summary, details, performed_by, related_task_id)
      values (new.lead_id, 'follow_up', 'Task ' || new.status || ': ' || new.title, new.completion_notes, actor, new.id);
    end if;
  end if;
  perform public.sync_lead_follow_up(new.lead_id);
  return new;
end $$;
create trigger trg_task_after after insert or update on public.tasks for each row execute function public.task_after_write();

-- REMINDER ENGINE (server-side, idempotent)
create or replace function public.process_due_reminders() returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; t record; hrs int;
begin
  select overdue_reminder_hours into hrs from public.app_settings where id = 1;
  for t in select tk.*, l.lead_title from public.tasks tk join public.leads l on l.id = tk.lead_id
           where tk.status = 'pending' and tk.reminder_sent_at is null and tk.due_at <= now()
           for update of tk skip locked loop
    insert into public.notifications(recipient_user_id, lead_id, task_id, notification_type, title, message, deduplication_key)
    values (t.assigned_to, t.lead_id, t.id, 'task_due', 'Task due: ' || t.title, t.lead_title || ' — due ' || to_char(t.due_at at time zone 'Asia/Dubai','DD Mon HH24:MI'),
      'due:' || t.id || ':' || extract(epoch from t.due_at)::bigint)
    on conflict (deduplication_key) do nothing;
    update public.tasks set reminder_sent_at = now() where id = t.id;
    n := n + 1;
  end loop;
  for t in select tk.*, l.lead_title from public.tasks tk join public.leads l on l.id = tk.lead_id
           where tk.status = 'pending' and tk.overdue_reminder_sent_at is null and tk.due_at <= now() - make_interval(hours => coalesce(hrs,24))
           for update of tk skip locked loop
    insert into public.notifications(recipient_user_id, lead_id, task_id, notification_type, title, message, deduplication_key)
    values (t.assigned_to, t.lead_id, t.id, 'task_overdue', 'Overdue: ' || t.title, t.lead_title || ' — was due ' || to_char(t.due_at at time zone 'Asia/Dubai','DD Mon HH24:MI'),
      'overdue:' || t.id || ':' || extract(epoch from t.due_at)::bigint)
    on conflict (deduplication_key) do nothing;
    update public.tasks set overdue_reminder_sent_at = now() where id = t.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.process_due_reminders() from public, anon, authenticated;

-- ADMIN: deactivate requires no open leads/tasks
create or replace function public.check_deactivation() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.account_status = 'deactivated' and old.account_status = 'active' then
    if exists (select 1 from public.leads where assigned_user_id = new.id and outcome = 'open' and archived_at is null)
       or exists (select 1 from public.tasks where assigned_to = new.id and status = 'pending') then
      raise exception 'Reassign this user''s open leads and pending tasks before deactivating';
    end if;
  end if;
  return new;
end $$;
create trigger trg_check_deactivation before update on public.profiles for each row execute function public.check_deactivation();

-- admin bulk reassign
create or replace function public.reassign_user_work(_from uuid, _to uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admins only'; end if;
  if not public.is_active_user(_to) then raise exception 'Target must be active'; end if;
  update public.leads set assigned_user_id = _to where assigned_user_id = _from and outcome = 'open' and archived_at is null;
  update public.tasks set assigned_to = _to where assigned_to = _from and status = 'pending';
end $$;

-- realtime for notifications
alter publication supabase_realtime add table public.notifications;
