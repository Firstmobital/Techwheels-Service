-- Read-only verification checks for:
-- supabase/migrations/20260706202000_ew_reminder_wa_template_drafts.sql
-- Execution: This file can be run in one go.

-- 1) Both draft template rows exist with expected shape.
SELECT
  id, name, display_name, category, language, status,
  body_text, buttons, variable_examples, campaign_type
FROM public.wa_templates
WHERE name IN ('ew_renewal_reminder_v1', 'ew_service_reminder_v1')
ORDER BY name;

-- 2) Exactly one row per name (idempotency guard didn't create duplicates).
SELECT name, COUNT(*) AS row_count
FROM public.wa_templates
WHERE name IN ('ew_renewal_reminder_v1', 'ew_service_reminder_v1')
GROUP BY name;
