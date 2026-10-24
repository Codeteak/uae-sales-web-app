CREATE OR REPLACE FUNCTION public.create_crm_lead(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE cid uuid; lid uuid; coid uuid; actor uuid := auth.uid(); contact jsonb; st uuid; assignee uuid; due timestamptz;
BEGIN
 IF NOT public.is_active_user(actor) THEN RAISE EXCEPTION 'Active account required'; END IF;
 IF length(trim(coalesce(payload->>'lead_title',''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Opportunity title is required (max 200 characters)'; END IF;
 assignee := coalesce(nullif(payload->>'assigned_user_id','')::uuid,actor);
 st := (payload->>'current_stage_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.pipeline_stages WHERE id=st AND is_active) THEN RAISE EXCEPTION 'Select an active stage'; END IF;
 cid := nullif(payload->>'company_id','')::uuid;
 IF cid IS NULL THEN
  IF length(trim(coalesce(payload->>'company_name',''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Company name is required'; END IF;
  INSERT INTO public.companies(company_name,created_by) VALUES(trim(payload->>'company_name'),actor) RETURNING id INTO cid;
 ELSIF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=cid AND archived_at IS NULL) THEN RAISE EXCEPTION 'Company unavailable'; END IF;
 due := nullif(payload->>'follow_up_at','')::timestamptz;
 INSERT INTO public.leads(company_id,lead_title,lead_source,current_stage_id,priority,assigned_user_id,next_action,expected_close_date,estimated_value,currency,outcome_reason,created_by)
 VALUES(cid,trim(payload->>'lead_title'),nullif(payload->>'lead_source',''),st,coalesce(nullif(payload->>'priority',''),'medium')::public.lead_priority,assignee,nullif(payload->>'next_action',''),nullif(payload->>'expected_close_date','')::date,nullif(payload->>'estimated_value','')::numeric,coalesce(nullif(payload->>'currency',''),(SELECT default_currency FROM public.app_settings WHERE id=1)),nullif(payload->>'outcome_reason',''),actor) RETURNING id INTO lid;
 FOR contact IN SELECT value FROM jsonb_array_elements(coalesce(payload->'contacts','[]'::jsonb)) LOOP
  coid := nullif(contact->>'id','')::uuid;
  IF coid IS NULL THEN
   IF length(trim(coalesce(contact->>'full_name','')))=0 THEN RAISE EXCEPTION 'Contact name required'; END IF;
   INSERT INTO public.contacts(company_id,full_name,phone_number,email,contact_role,created_by) VALUES(cid,trim(contact->>'full_name'),nullif(contact->>'phone_number',''),nullif(contact->>'email',''),coalesce(nullif(contact->>'contact_role',''),'other')::public.contact_role,actor) RETURNING id INTO coid;
  ELSIF NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=coid AND company_id=cid AND archived_at IS NULL) THEN RAISE EXCEPTION 'Contact must belong to selected company'; END IF;
  INSERT INTO public.lead_contacts(lead_id,contact_id,is_primary) VALUES(lid,coid,NOT EXISTS(SELECT 1 FROM public.lead_contacts WHERE lead_id=lid));
 END LOOP;
 IF due IS NOT NULL THEN
  INSERT INTO public.tasks(lead_id,title,assigned_to,due_at,priority,created_by) VALUES(lid,coalesce(nullif(payload->>'next_action',''),'Follow up'),assignee,due,coalesce(nullif(payload->>'priority',''),'medium')::public.lead_priority,actor);
 END IF;
 RETURN lid;
END $$;
REVOKE ALL ON FUNCTION public.create_crm_lead(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_crm_lead(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.manage_crm_user(target uuid, new_status public.account_status, new_role public.app_role, transfer_to uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Admins only'; END IF;
 IF target=auth.uid() THEN RAISE EXCEPTION 'Cannot change your own access'; END IF;
 IF transfer_to IS NOT NULL THEN PERFORM public.reassign_user_work(target,transfer_to); END IF;
 UPDATE public.profiles SET account_status=new_status,updated_at=now() WHERE id=target;
 DELETE FROM public.user_roles WHERE user_id=target;
 INSERT INTO public.user_roles(user_id,role) VALUES(target,new_role);
END $$;
REVOKE ALL ON FUNCTION public.manage_crm_user(uuid,public.account_status,public.app_role,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_crm_user(uuid,public.account_status,public.app_role,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.validate_crm_links() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE cid uuid; coid uuid;
BEGIN
 SELECT company_id INTO cid FROM public.leads WHERE id=NEW.lead_id;
 IF TG_TABLE_NAME='lead_contacts' OR NEW.contact_id IS NOT NULL THEN
  SELECT company_id INTO coid FROM public.contacts WHERE id=NEW.contact_id;
  IF cid IS DISTINCT FROM coid THEN RAISE EXCEPTION 'Contact must belong to the opportunity company'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_link_contact BEFORE INSERT OR UPDATE ON public.lead_contacts FOR EACH ROW EXECUTE FUNCTION public.validate_crm_links();
CREATE TRIGGER crm_task_contact BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.validate_crm_links();
CREATE TRIGGER crm_activity_contact BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.validate_crm_links();
CREATE OR REPLACE FUNCTION public.log_crm_activity(payload jsonb, mentioned_users uuid[] DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); lid uuid:=(payload->>'lead_id')::uuid; aid uuid; recipient uuid; cid uuid:=nullif(payload->>'contact_id','')::uuid; kind public.activity_type:=(payload->>'activity_type')::public.activity_type;
BEGIN
 IF NOT public.is_active_user(actor) THEN RAISE EXCEPTION 'Active account required'; END IF;
 IF kind NOT IN ('call','meeting','email','message','note','other') THEN RAISE EXCEPTION 'Invalid activity type'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.leads WHERE id=lid) THEN RAISE EXCEPTION 'Lead not found'; END IF;
 IF cid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.contacts c JOIN public.leads l ON c.company_id=l.company_id WHERE c.id=cid AND l.id=lid) THEN RAISE EXCEPTION 'Invalid contact'; END IF;
 IF length(trim(coalesce(payload->>'summary',''))) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Summary required (max 300 characters)'; END IF;
 INSERT INTO public.activities(lead_id,contact_id,activity_type,summary,details,outcome,performed_by,occurred_at) VALUES(lid,cid,kind,trim(payload->>'summary'),nullif(payload->>'details',''),nullif(payload->>'outcome',''),actor,coalesce(nullif(payload->>'occurred_at','')::timestamptz,now())) RETURNING id INTO aid;
 FOREACH recipient IN ARRAY mentioned_users LOOP
  IF recipient<>actor AND public.is_active_user(recipient) THEN
   INSERT INTO public.notifications(recipient_user_id,actor_user_id,lead_id,notification_type,title,message,deduplication_key) VALUES(recipient,actor,lid,'mention','You were mentioned in an activity',payload->>'summary','mention:'||aid||':'||recipient) ON CONFLICT(deduplication_key) DO NOTHING;
  END IF;
 END LOOP;
 RETURN aid;
END $$;
REVOKE ALL ON FUNCTION public.log_crm_activity(jsonb,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.log_crm_activity(jsonb,uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.crm_contact_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE linked record;
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.full_name,NEW.job_title,NEW.department,NEW.phone_number,NEW.email,NEW.contact_role,NEW.notes,NEW.archived_at) IS DISTINCT FROM ROW(OLD.full_name,OLD.job_title,OLD.department,OLD.phone_number,OLD.email,OLD.contact_role,OLD.notes,OLD.archived_at) THEN
  FOR linked IN SELECT lead_id FROM public.lead_contacts WHERE contact_id=NEW.id LOOP
   INSERT INTO public.activities(lead_id,contact_id,activity_type,summary,performed_by) VALUES(linked.lead_id,NEW.id,'contact','Contact updated: '||NEW.full_name,auth.uid());
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_contact_history AFTER UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.crm_contact_history();
CREATE OR REPLACE FUNCTION public.crm_link_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.activities(lead_id,contact_id,activity_type,summary,performed_by) VALUES(NEW.lead_id,NEW.contact_id,'contact','Contact linked: '||(SELECT full_name FROM public.contacts WHERE id=NEW.contact_id),auth.uid());
 RETURN NEW;
END $$;
CREATE TRIGGER crm_link_history AFTER INSERT ON public.lead_contacts FOR EACH ROW EXECUTE FUNCTION public.crm_link_history();
CREATE OR REPLACE FUNCTION public.crm_lead_edit_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF ROW(NEW.lead_title,NEW.lead_source,NEW.next_action,NEW.expected_close_date,NEW.estimated_value,NEW.currency) IS DISTINCT FROM ROW(OLD.lead_title,OLD.lead_source,OLD.next_action,OLD.expected_close_date,OLD.estimated_value,OLD.currency) THEN
 INSERT INTO public.activities(lead_id,activity_type,summary,performed_by) VALUES(NEW.id,'updated','Opportunity information updated',auth.uid());
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_lead_edit_history AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.crm_lead_edit_history();