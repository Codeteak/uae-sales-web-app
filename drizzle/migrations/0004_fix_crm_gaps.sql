-- Reminder scheduler: run every 5 minutes (idempotent job registration)
-- Use tagged dollar-quotes so this works inside a DO $$ ... $$ block.
DO $setup$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-due-reminders') THEN
    PERFORM cron.schedule(
      'process-due-reminders',
      '*/5 * * * *',
      $cron$SELECT public.process_due_reminders()$cron$
    );
  END IF;
END $setup$;

GRANT EXECUTE ON FUNCTION public.process_due_reminders() TO service_role;

-- Atomic primary-contact switch (clears others then sets one; fails if contact not linked)
CREATE OR REPLACE FUNCTION public.set_lead_primary_contact(p_lead_id uuid, p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN
    RAISE EXCEPTION 'Active account required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.lead_contacts
    WHERE lead_id = p_lead_id AND contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'Contact is not linked to this opportunity';
  END IF;
  UPDATE public.lead_contacts SET is_primary = false WHERE lead_id = p_lead_id AND is_primary;
  UPDATE public.lead_contacts SET is_primary = true
  WHERE lead_id = p_lead_id AND contact_id = p_contact_id;
END $$;
REVOKE ALL ON FUNCTION public.set_lead_primary_contact(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lead_primary_contact(uuid, uuid) TO authenticated;

-- Create (optional) + link contact to lead in one transaction; activity comes from crm_link_history trigger
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
BEGIN
  IF NOT public.is_active_user(actor) THEN
    RAISE EXCEPTION 'Active account required';
  END IF;
  SELECT company_id INTO company FROM public.leads WHERE id = p_lead_id AND archived_at IS NULL;
  IF company IS NULL THEN
    RAISE EXCEPTION 'Opportunity not found';
  END IF;

  coid := nullif(payload->>'id', '')::uuid;
  IF coid IS NULL THEN
    IF length(trim(coalesce(payload->>'full_name', ''))) = 0 THEN
      RAISE EXCEPTION 'Contact name required';
    END IF;
    INSERT INTO public.contacts (
      company_id, full_name, job_title, department, phone_number, email, contact_role, notes, created_by
    ) VALUES (
      company,
      trim(payload->>'full_name'),
      nullif(trim(coalesce(payload->>'job_title', '')), ''),
      nullif(trim(coalesce(payload->>'department', '')), ''),
      nullif(trim(coalesce(payload->>'phone_number', '')), ''),
      nullif(trim(coalesce(payload->>'email', '')), ''),
      coalesce(nullif(payload->>'contact_role', ''), 'other')::public.contact_role,
      nullif(trim(coalesce(payload->>'notes', '')), ''),
      actor
    )
    RETURNING id INTO coid;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.contacts
      WHERE id = coid AND company_id = company AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Contact must belong to the opportunity company';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.lead_contacts WHERE lead_id = p_lead_id AND contact_id = coid
    ) THEN
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
END $$;
REVOKE ALL ON FUNCTION public.save_lead_contact(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_lead_contact(uuid, jsonb) TO authenticated;

-- Concurrency column for lost reasons
ALTER TABLE public.lost_reasons
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_touch_lost_reasons ON public.lost_reasons;
CREATE TRIGGER trg_touch_lost_reasons
  BEFORE UPDATE ON public.lost_reasons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
