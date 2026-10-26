-- Track which in-app notifications have been emailed via app SMTP.
-- pg_cron calls process_due_reminders() every 5 minutes (in-app only).
-- HTTP /api/cron/reminders emails rows where email_sent_at IS NULL.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_email_pending_idx
  ON public.notifications (created_at)
  WHERE email_sent_at IS NULL
    AND notification_type IN ('task_due', 'task_overdue');

-- Authenticated users may mark read_at; they must not clear/set email_sent_at.
CREATE OR REPLACE FUNCTION public.protect_notification_email_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.email_sent_at IS DISTINCT FROM OLD.email_sent_at THEN
    -- service_role / postgres may update; JWT users may not
    IF coalesce(auth.role(), '') = 'authenticated' THEN
      NEW.email_sent_at := OLD.email_sent_at;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_notification_email_sent ON public.notifications;
CREATE TRIGGER trg_protect_notification_email_sent
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_notification_email_sent();
