-- Normalize existing reception model values to canonical names from Settings -> Models
--
-- Run manually in Supabase SQL Editor.
-- Source of truth for canonical names: public.settings_model_options (is_active = true)
--
-- This updates only rows where a canonical mapping is found and model differs.

BEGIN;

WITH active_models AS (
  SELECT
    model_name,
    lower(regexp_replace(model_name, '[^a-z0-9]+', '', 'g')) AS model_key
  FROM public.settings_model_options
  WHERE is_active = true
),
ranked_matches AS (
  SELECT
    r.id,
    r.model AS old_model,
    m.model_name AS canonical_model,
    row_number() OVER (
      PARTITION BY r.id
      ORDER BY length(m.model_name) DESC
    ) AS rn
  FROM public.service_reception_entries r
  JOIN active_models m
    ON (
      lower(regexp_replace(coalesce(r.model, ''), '[^a-z0-9]+', '', 'g')) = m.model_key
      OR lower(r.model) LIKE lower(m.model_name) || ' %'
      OR lower(r.model) LIKE lower(m.model_name) || '-%'
      OR lower(r.model) LIKE lower(m.model_name) || '(%'
    )
  WHERE coalesce(r.model, '') <> ''
),
updates AS (
  SELECT
    id,
    old_model,
    canonical_model
  FROM ranked_matches
  WHERE rn = 1
    AND old_model IS DISTINCT FROM canonical_model
),
applied AS (
  UPDATE public.service_reception_entries r
  SET
    model = u.canonical_model,
    updated_at = now()
  FROM updates u
  WHERE r.id = u.id
  RETURNING r.id, u.old_model, u.canonical_model
)
SELECT count(*) AS updated_rows FROM applied;

COMMIT;

-- Optional post-checks:
-- 1) Rows still not mapped to canonical model list:
-- SELECT id, reg_number, model, source, created_at
-- FROM public.service_reception_entries r
-- WHERE coalesce(model, '') <> ''
--   AND NOT EXISTS (
--     SELECT 1
--     FROM public.settings_model_options m
--     WHERE m.is_active = true
--       AND lower(model) = lower(m.model_name)
--   )
-- ORDER BY created_at DESC
-- LIMIT 200;
--
-- 2) Sample canonicalized Harrier EV rows:
-- SELECT id, reg_number, model, source, created_at
-- FROM public.service_reception_entries
-- WHERE lower(model) = 'harrier ev'
-- ORDER BY created_at DESC
-- LIMIT 100;
