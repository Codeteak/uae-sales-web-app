-- Company email/phone/notes validation on direct writes (parity with contacts/leads).

CREATE OR REPLACE FUNCTION public.guard_company_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF length(trim(coalesce(NEW.company_name, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Company name is required (max 200 characters)';
  END IF;
  IF NOT public.is_valid_email(NEW.email) THEN
    RAISE EXCEPTION 'Invalid company email';
  END IF;
  IF NOT public.is_valid_phone(NEW.phone) THEN
    RAISE EXCEPTION 'Invalid company phone';
  END IF;
  IF NEW.notes IS NOT NULL AND length(NEW.notes) > 5000 THEN
    RAISE EXCEPTION 'Notes too long (max 5000 characters)';
  END IF;
  IF NEW.industry IS NOT NULL AND length(NEW.industry) > 200 THEN
    RAISE EXCEPTION 'Industry too long (max 200 characters)';
  END IF;
  IF NEW.website IS NOT NULL AND length(trim(NEW.website)) > 500 THEN
    RAISE EXCEPTION 'Website too long (max 500 characters)';
  END IF;
  IF NEW.address IS NOT NULL AND length(NEW.address) > 1000 THEN
    RAISE EXCEPTION 'Address too long (max 1000 characters)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_company_values ON public.companies;
CREATE TRIGGER trg_guard_company_values
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_values();
