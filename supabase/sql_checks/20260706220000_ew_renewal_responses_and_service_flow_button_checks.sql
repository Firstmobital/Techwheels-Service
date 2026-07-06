-- Read-only verification checks for:
-- supabase/migrations/20260706220000_ew_renewal_responses_and_service_flow_button.sql

-- 1) New columns exist on ew_renewal_reminders.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ew_renewal_reminders'
  AND column_name IN ('responded_at', 'customer_response')
ORDER BY column_name;

-- 2) Partial index exists.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'ew_renewal_reminders'
  AND indexname = 'idx_err_responded_at';

-- 3) ew_service_reminder_v1 buttons now match the ASR Flow + phone-number shape.
SELECT id, name, status, buttons
FROM public.wa_templates
WHERE name = 'ew_service_reminder_v1';

-- 4) Sanity: buttons[0] is a FLOW button with the same flow_id as the approved
--    service_due_reminder_flow template, and buttons[1] is PHONE_NUMBER.
SELECT
  (buttons->0->>'type') AS button_0_type,
  (buttons->0->>'flow_id') AS button_0_flow_id,
  (buttons->1->>'type') AS button_1_type,
  (buttons->1->>'phone_number') AS button_1_phone
FROM public.wa_templates
WHERE name = 'ew_service_reminder_v1';
