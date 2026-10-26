-- Harden validation, signup bootstrap, settings, and realtime sync.
-- Safe for an existing production DB that already has an admin.

-- Registration can be closed by admins after the team is onboarded
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS allow_registrations boolean NOT NULL DEFAULT true;

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_overdue_reminder_hours_check;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_overdue_reminder_hours_check
  CHECK (overdue_reminder_hours BETWEEN 1 AND 168);

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_default_currency_check;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_default_currency_check
  CHECK (upper(default_currency) = ANY (ARRAY[
    'AED','USD','EUR','GBP','SAR','INR','CAD','AUD','CHF','KWD','BHD','OMR','QAR'
  ]));

CREATE OR REPLACE FUNCTION public.is_valid_email(t text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT t IS NULL
    OR length(trim(t)) = 0
    OR (
      length(trim(t)) <= 255
      AND trim(t) ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_valid_phone(t text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT t IS NULL
    OR length(trim(t)) = 0
    OR length(regexp_replace(t, '\D', '', 'g')) BETWEEN 7 AND 15;
$$;

CREATE OR REPLACE FUNCTION public.is_allowed_currency(t text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT t IS NULL
    OR length(trim(t)) = 0
    OR upper(trim(t)) = ANY (ARRAY[
      'AED','USD','EUR','GBP','SAR','INR','CAD','AUD','CHF','KWD','BHD','OMR','QAR'
    ]);
$$;

-- Public registration policy for the auth screen (no sensitive settings leaked)
CREATE OR REPLACE FUNCTION public.registration_policy()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'allow_registrations', coalesce((SELECT allow_registrations FROM public.app_settings WHERE id = 1), true)
  );
$$;
REVOKE ALL ON FUNCTION public.registration_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_policy() TO anon, authenticated;

-- First admin only when no admin role exists (not merely empty profiles); lock against races
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_admin boolean;
  auto boolean;
  allow_reg boolean;
  st public.account_status;
  adm record;
BEGIN
  PERFORM pg_advisory_xact_lock(87201401);

  SELECT coalesce(allow_registrations, true), coalesce(auto_approve_registrations, false)
    INTO allow_reg, auto
  FROM public.app_settings WHERE id = 1;

  IF NOT coalesce(allow_reg, true) THEN
    st := 'rejected';
    INSERT INTO public.profiles (id, full_name, email, account_status)
    VALUES (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.email,
      st
    );
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'member'::public.app_role);
    RETURN new;
  END IF;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO first_admin;
  st := CASE WHEN first_admin OR auto THEN 'active' ELSE 'pending' END;

  INSERT INTO public.profiles (id, full_name, email, account_status)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    st
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN first_admin THEN 'admin'::public.app_role ELSE 'member'::public.app_role END);

  IF NOT first_admin AND st = 'pending' THEN
    FOR adm IN
      SELECT p.id
      FROM public.profiles p
      JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'admin'
      WHERE p.account_status = 'active'
    LOOP
      INSERT INTO public.notifications (recipient_user_id, notification_type, title, message, deduplication_key)
      VALUES (
        adm.id,
        'registration',
        'New registration awaiting approval',
        coalesce(new.raw_user_meta_data->>'full_name', new.email) || ' (' || new.email || ') registered.',
        'reg:' || new.id || ':' || adm.id
      );
    END LOOP;
  END IF;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_company_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.archived_at IS NULL AND EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.name_norm = NEW.name_norm
      AND c.archived_at IS NULL
      AND c.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'A company with this name already exists';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_company_name ON public.companies;
CREATE TRIGGER trg_guard_company_name
  BEFORE INSERT OR UPDATE OF company_name, archived_at ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_name();

CREATE OR REPLACE FUNCTION public.create_crm_lead(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  cid uuid;
  lid uuid;
  coid uuid;
  actor uuid := auth.uid();
  contact jsonb;
  st uuid;
  assignee uuid;
  due timestamptz;
  title text := trim(coalesce(payload->>'lead_title', ''));
  currency text := upper(trim(coalesce(nullif(payload->>'currency', ''), '')));
  contact_email text;
  contact_phone text;
  contact_name text;
BEGIN
  IF NOT public.is_active_user(actor) THEN RAISE EXCEPTION 'Active account required'; END IF;
  IF length(title) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Opportunity title is required (max 200 characters)'; END IF;
  assignee := coalesce(nullif(payload->>'assigned_user_id', '')::uuid, actor);
  st := (payload->>'current_stage_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE id = st AND is_active) THEN
    RAISE EXCEPTION 'Select an active stage';
  END IF;
  IF currency = '' THEN
    SELECT default_currency INTO currency FROM public.app_settings WHERE id = 1;
  END IF;
  IF NOT public.is_allowed_currency(currency) THEN RAISE EXCEPTION 'Unsupported currency'; END IF;
  IF nullif(payload->>'estimated_value', '') IS NOT NULL AND (payload->>'estimated_value')::numeric < 0 THEN
    RAISE EXCEPTION 'Estimated value cannot be negative';
  END IF;

  cid := nullif(payload->>'company_id', '')::uuid;
  IF cid IS NULL THEN
    IF length(trim(coalesce(payload->>'company_name', ''))) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Company name is required';
    END IF;
    INSERT INTO public.companies (company_name, created_by)
    VALUES (trim(payload->>'company_name'), actor)
    RETURNING id INTO cid;
  ELSIF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = cid AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Company unavailable';
  END IF;

  due := nullif(payload->>'follow_up_at', '')::timestamptz;
  INSERT INTO public.leads (
    company_id, lead_title, lead_source, current_stage_id, priority, assigned_user_id,
    next_action, expected_close_date, estimated_value, currency, outcome_reason, created_by
  ) VALUES (
    cid,
    title,
    nullif(payload->>'lead_source', ''),
    st,
    coalesce(nullif(payload->>'priority', ''), 'medium')::public.lead_priority,
    assignee,
    nullif(left(trim(coalesce(payload->>'next_action', '')), 500), ''),
    nullif(payload->>'expected_close_date', '')::date,
    nullif(payload->>'estimated_value', '')::numeric,
    currency,
    nullif(payload->>'outcome_reason', ''),
    actor
  ) RETURNING id INTO lid;

  FOR contact IN SELECT value FROM jsonb_array_elements(coalesce(payload->'contacts', '[]'::jsonb)) LOOP
    coid := nullif(contact->>'id', '')::uuid;
    contact_name := trim(coalesce(contact->>'full_name', ''));
    contact_email := nullif(trim(coalesce(contact->>'email', '')), '');
    contact_phone := nullif(trim(coalesce(contact->>'phone_number', '')), '');
    IF coid IS NULL THEN
      IF length(contact_name) = 0 THEN RAISE EXCEPTION 'Contact name required'; END IF;
      IF length(contact_name) > 200 THEN RAISE EXCEPTION 'Contact name too long'; END IF;
      IF NOT public.is_valid_email(contact_email) THEN RAISE EXCEPTION 'Invalid contact email'; END IF;
      IF NOT public.is_valid_phone(contact_phone) THEN RAISE EXCEPTION 'Invalid contact phone'; END IF;
      INSERT INTO public.contacts (company_id, full_name, phone_number, email, contact_role, created_by)
      VALUES (
        cid,
        contact_name,
        contact_phone,
        contact_email,
        coalesce(nullif(contact->>'contact_role', ''), 'other')::public.contact_role,
        actor
      ) RETURNING id INTO coid;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.contacts WHERE id = coid AND company_id = cid AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Contact must belong to selected company';
    END IF;
    INSERT INTO public.lead_contacts (lead_id, contact_id, is_primary)
    VALUES (lid, coid, NOT EXISTS (SELECT 1 FROM public.lead_contacts WHERE lead_id = lid));
  END LOOP;

  IF due IS NOT NULL THEN
    INSERT INTO public.tasks (lead_id, title, assigned_to, due_at, priority, created_by)
    VALUES (
      lid,
      coalesce(nullif(left(trim(coalesce(payload->>'next_action', '')), 200), ''), 'Follow up'),
      assignee,
      due,
      coalesce(nullif(payload->>'priority', ''), 'medium')::public.lead_priority,
      actor
    );
  END IF;
  RETURN lid;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_lead_contact(p_lead_id uuid, payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  company uuid;
  coid uuid;
  make_primary boolean := coalesce((payload->>'is_primary')::boolean, false);
  contact_name text := trim(coalesce(payload->>'full_name', ''));
  contact_email text := nullif(trim(coalesce(payload->>'email', '')), '');
  contact_phone text := nullif(trim(coalesce(payload->>'phone_number', '')), '');
BEGIN
  IF NOT public.is_active_user(actor) THEN RAISE EXCEPTION 'Active account required'; END IF;
  SELECT company_id INTO company FROM public.leads WHERE id = p_lead_id AND archived_at IS NULL;
  IF company IS NULL THEN RAISE EXCEPTION 'Opportunity not found'; END IF;

  coid := nullif(payload->>'id', '')::uuid;
  IF coid IS NULL THEN
    IF length(contact_name) = 0 THEN RAISE EXCEPTION 'Contact name required'; END IF;
    IF length(contact_name) > 200 THEN RAISE EXCEPTION 'Contact name too long'; END IF;
    IF NOT public.is_valid_email(contact_email) THEN RAISE EXCEPTION 'Invalid contact email'; END IF;
    IF NOT public.is_valid_phone(contact_phone) THEN RAISE EXCEPTION 'Invalid contact phone'; END IF;
    INSERT INTO public.contacts (
      company_id, full_name, job_title, department, phone_number, email, contact_role, notes, created_by
    ) VALUES (
      company,
      contact_name,
      nullif(left(trim(coalesce(payload->>'job_title', '')), 200), ''),
      nullif(left(trim(coalesce(payload->>'department', '')), 200), ''),
      contact_phone,
      contact_email,
      coalesce(nullif(payload->>'contact_role', ''), 'other')::public.contact_role,
      nullif(left(trim(coalesce(payload->>'notes', '')), 5000), ''),
      actor
    ) RETURNING id INTO coid;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.contacts
      WHERE id = coid AND company_id = company AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Contact must belong to the opportunity company';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lead_contacts WHERE lead_id = p_lead_id AND contact_id = coid) THEN
      RAISE EXCEPTION 'Contact is already linked to this opportunity';
    END IF;
  END IF;

  INSERT INTO public.lead_contacts (lead_id, contact_id, is_primary)
  VALUES (
    p_lead_id,
    coid,
    make_primary OR NOT EXISTS (SELECT 1 FROM public.lead_contacts WHERE lead_id = p_lead_id)
  );

  IF make_primary THEN
    PERFORM public.set_lead_primary_contact(p_lead_id, coid);
  END IF;
  RETURN coid;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_crm_activity(payload jsonb, mentioned_users uuid[] DEFAULT '{}')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  lid uuid := (payload->>'lead_id')::uuid;
  aid uuid;
  recipient uuid;
  cid uuid := nullif(payload->>'contact_id', '')::uuid;
  kind public.activity_type := (payload->>'activity_type')::public.activity_type;
  summary text := trim(coalesce(payload->>'summary', ''));
  mention_count int := coalesce(cardinality(mentioned_users), 0);
BEGIN
  IF NOT public.is_active_user(actor) THEN RAISE EXCEPTION 'Active account required'; END IF;
  IF kind NOT IN ('call', 'meeting', 'email', 'message', 'note', 'other') THEN
    RAISE EXCEPTION 'Invalid activity type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = lid) THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF cid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts c
    JOIN public.leads l ON c.company_id = l.company_id
    WHERE c.id = cid AND l.id = lid
  ) THEN
    RAISE EXCEPTION 'Invalid contact';
  END IF;
  IF length(summary) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Summary required (max 300 characters)'; END IF;
  IF mention_count > 20 THEN RAISE EXCEPTION 'Too many mentions (max 20)'; END IF;

  INSERT INTO public.activities (
    lead_id, contact_id, activity_type, summary, details, outcome, performed_by, occurred_at
  ) VALUES (
    lid,
    cid,
    kind,
    summary,
    nullif(left(trim(coalesce(payload->>'details', '')), 5000), ''),
    nullif(payload->>'outcome', ''),
    actor,
    coalesce(nullif(payload->>'occurred_at', '')::timestamptz, now())
  ) RETURNING id INTO aid;

  FOREACH recipient IN ARRAY coalesce(mentioned_users, '{}') LOOP
    IF recipient <> actor AND public.is_active_user(recipient) THEN
      INSERT INTO public.notifications (
        recipient_user_id, actor_user_id, lead_id, notification_type, title, message, deduplication_key
      ) VALUES (
        recipient, actor, lid, 'mention', 'You were mentioned in an activity', summary,
        'mention:' || aid || ':' || recipient
      ) ON CONFLICT (deduplication_key) DO NOTHING;
    END IF;
  END LOOP;
  RETURN aid;
END;
$$;

-- Enforce currency / email / phone on direct table writes (not only create RPCs)
CREATE OR REPLACE FUNCTION public.guard_lead_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.currency IS NOT NULL AND NOT public.is_allowed_currency(NEW.currency) THEN
    RAISE EXCEPTION 'Unsupported currency';
  END IF;
  IF NEW.currency IS NOT NULL THEN
    NEW.currency := upper(trim(NEW.currency));
  END IF;
  IF NEW.estimated_value IS NOT NULL AND NEW.estimated_value < 0 THEN
    RAISE EXCEPTION 'Estimated value cannot be negative';
  END IF;
  IF NEW.lead_title IS NOT NULL AND length(trim(NEW.lead_title)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Opportunity title is required (max 200 characters)';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_lead_values ON public.leads;
CREATE TRIGGER trg_guard_lead_values
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_lead_values();

CREATE OR REPLACE FUNCTION public.guard_contact_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF length(trim(coalesce(NEW.full_name, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Contact name required (max 200 characters)';
  END IF;
  IF NOT public.is_valid_email(NEW.email) THEN
    RAISE EXCEPTION 'Invalid contact email';
  END IF;
  IF NOT public.is_valid_phone(NEW.phone_number) THEN
    RAISE EXCEPTION 'Invalid contact phone';
  END IF;
  IF NEW.notes IS NOT NULL AND length(NEW.notes) > 5000 THEN
    RAISE EXCEPTION 'Notes too long (max 5000 characters)';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_contact_values ON public.contacts;
CREATE TRIGGER trg_guard_contact_values
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contact_values();

-- Live sync for shared team desks
DO $pub$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$pub$;
