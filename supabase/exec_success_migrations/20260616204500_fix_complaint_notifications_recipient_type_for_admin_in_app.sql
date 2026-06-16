-- Fix recipient_type constraint for admin in-app complaint notifications
--
-- Purpose:
--   Allow recipient_type = 'admin' so shared admin in-app rows written by
--   trg_cn_write_notifications_fn are not rejected by CHECK constraint.

BEGIN;

ALTER TABLE public.complaint_notifications
  DROP CONSTRAINT IF EXISTS complaint_notifications_recipient_type_check;

ALTER TABLE public.complaint_notifications
  ADD CONSTRAINT complaint_notifications_recipient_type_check
  CHECK (recipient_type = ANY (ARRAY['customer','staff','manager','admin']));

COMMIT;
