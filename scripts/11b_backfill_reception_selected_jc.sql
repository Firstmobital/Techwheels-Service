-- Backfill Reception entries from job_card_closed_data for selected JC numbers (date-agnostic)
--
-- IMPORTANT
-- 1) Run this in Supabase SQL Editor manually.
-- 2) This script ignores date windows and imports only the listed JC numbers.
-- 3) Deduplication rule for reception insert: JC number is unique across table.
--    If same JC already exists in service_reception_entries, it is NOT inserted again.
-- 4) Existing rows with same JC and blank sa_employee_code are updated from Employee Master lookup.
-- 5) Existing rows with same JC get created_at corrected from JC open timestamp when different.
-- 6) Model normalization uses active Settings Models (public.settings_model_options).
-- 7) Reception branch is physical branch only:
--      Ajmer Road | Sitapura
--    Source labels Sitapura PV / Sitapura EV are normalized to Sitapura.

BEGIN;

WITH params AS (
  SELECT
    '3000840'::text AS target_dealer_code,
    'JC Closed Backfill (Selected Cases 2026-06-16)'::text AS backfill_source
),
target_jc AS (
  SELECT upper(v.jc_number) AS jc_number
  FROM (VALUES
    ('JC-MBTPLT-JP1-2627-002842'),
    ('JC-MBTPLT-JP1-2627-002820'),
    ('JC-MBTPLT-JP1-2627-002833'),
    ('JC-MBTPLT-JP2-2627-002164'),
    ('JC-MBTPLT-JP2-2627-002156'),
    ('JC-MBTPLT-JP2-2627-002058'),
    ('JC-MBTPLT-JP1-2627-002881'),
    ('JC-MBTPLT-JP1-2627-002788'),
    ('JC-MBTPLT-JP1-2627-002890'),
    ('JC-MBTPLT-JP1-2627-002752'),
    ('JC-MBTPLT-JP1-2627-002582'),
    ('JC-MBTPLT-JP1-2627-002914'),
    ('JC-MBTPLT-JP2-2627-001718'),
    ('JC-MBTPLT-JP1-2627-002979'),
    ('JC-MBTPLT-JP1-2627-002808'),
    ('JC-MBTPLT-JP1-2627-002831'),
    ('JC-MBTPLT-JP1-2627-002888'),
    ('JC-MBTPLT-JP1-2627-002962'),
    ('JC-MBTPLT-JP1-2627-002968'),
    ('JC-MBTPLT-JP2-2627-002135'),
    ('JC-MBTPLT-JP2-2627-002255'),
    ('JC-MBTPLT-JP2-2627-001967'),
    ('JC-MBTPLT-JP2-2627-002092'),
    ('JC-MBTPLT-JP1-2627-002963'),
    ('JC-MBTPLT-JP1-2627-002740'),
    ('JC-MBTPLT-JP2-2627-002077'),
    ('JC-MBTPLT-JP1-2627-003019'),
    ('JC-MBTPLT-JP1-2627-003065'),
    ('JC-MBTPLT-JP1-2627-003022'),
    ('JC-MBTPLT-JP2-2627-002090'),
    ('JC-MBTPLT-JP1-2627-003069'),
    ('JC-MBTPLT-JP1-2627-003006'),
    ('JC-MBTPLT-JP1-2627-002715'),
    ('JC-MBTPLT-JP1-2627-003158'),
    ('JC-MBTPLT-JP1-2627-002769'),
    ('JC-MBTPLT-JP1-2627-003151'),
    ('JC-MBTPLT-JP1-2627-003116'),
    ('JC-MBTPLT-JP2-2627-002384'),
    ('JC-MBTPLT-JP2-2627-002382'),
    ('JC-MBTPLT-JP2-2627-002386'),
    ('JC-MBTPLT-JP2-2627-002393'),
    ('JC-MBTPLT-JP2-2627-002383'),
    ('JC-MBTPLT-JP2-2627-002390'),
    ('JC-MBTPLT-JP1-2627-003103'),
    ('JC-MBTPLT-JP2-2627-002399'),
    ('JC-MBTPLT-JP1-2627-003171'),
    ('JC-MBTPLT-JP2-2627-002398'),
    ('JC-MBTPLT-JP2-2627-002388'),
    ('JC-MBTPLT-JP2-2627-002409'),
    ('JC-MBTPLT-JP2-2627-002405'),
    ('JC-MBTPLT-JP2-2627-002401'),
    ('JC-MBTPLT-JP1-2627-003172'),
    ('JC-MBTPLT-JP2-2627-002438'),
    ('JC-MBTPLT-JP2-2627-002440'),
    ('JC-MBTPLT-JP2-2627-002049'),
    ('JC-MBTPLT-JP2-2627-002437'),
    ('JC-MBTPLT-JP2-2627-002436'),
    ('JC-MBTPLT-JP2-2627-002433'),
    ('JC-MBTPLT-JP1-2627-002647'),
    ('JC-MBTPLT-JP1-2627-003187'),
    ('JC-MBTPLT-JP2-2627-002450'),
    ('JC-MBTPLT-JP2-2627-002471'),
    ('JC-MBTPLT-JP2-2627-002472'),
    ('JC-MBTPLT-JP1-2627-003225'),
    ('JC-MBTPLT-JP1-2627-003224'),
    ('JC-MBTPLT-JP1-2627-001254'),
    ('JC-MBTPLT-JP2-2627-002473'),
    ('JC-MBTPLT-JP2-2627-002469'),
    ('JC-MBTPLT-JP2-2627-002477'),
    ('JC-MBTPLT-JP1-2627-003226'),
    ('JC-MBTPLT-JP1-2627-003237'),
    ('JC-MBTPLT-JP2-2627-002505'),
    ('JC-MBTPLT-JP2-2627-001384'),
    ('JC-MBTPLT-JP1-2627-003211'),
    ('JC-MBTPLT-JP2-2627-002500'),
    ('JC-MBTPLT-JP2-2627-002503'),
    ('JC-MBTPLT-JP2-2627-002481'),
    ('JC-MBTPLT-JP2-2627-002502'),
    ('JC-MBTPLT-JP2-2627-002501'),
    ('JC-MBTPLT-JP2-2627-002508'),
    ('JC-MBTPLT-JP2-2627-002504'),
    ('JC-MBTPLT-JP2-2627-002499'),
    ('JC-MBTPLT-JP2-2627-002530'),
    ('JC-MBTPLT-JP2-2627-002541'),
    ('JC-MBTPLT-JP2-2627-002540'),
    ('JC-MBTPLT-JP2-2627-002516'),
    ('JC-MBTPLT-JP2-2627-002515'),
    ('JC-MBTPLT-JP2-2627-002506'),
    ('JC-MBTPLT-JP2-2627-002531'),
    ('JC-MBTPLT-JP2-2627-002553'),
    ('JC-MBTPLT-JP2-2627-002555'),
    ('JC-MBTPLT-JP2-2627-002529'),
    ('JC-MBTPLT-JP2-2627-002534'),
    ('JC-MBTPLT-JP2-2627-002552'),
    ('JC-MBTPLT-JP1-2627-002303'),
    ('JC-MBTPLT-JP1-2627-003323'),
    ('JC-MBTPLT-JP1-2627-003007'),
    ('JC-MBTPLT-JP2-2627-002582'),
    ('JC-MBTPLT-JP2-2627-002587'),
    ('JC-MBTPLT-JP2-2627-002580'),
    ('JC-MBTPLT-JP2-2627-002581'),
    ('JC-MBTPLT-JP1-2627-003320'),
    ('JC-MBTPLT-JP1-2627-003310'),
    ('JC-MBTPLT-JP2-2627-001904'),
    ('JC-MBTPLT-JP2-2627-002613'),
    ('JC-MBTPLT-JP2-2627-002608'),
    ('JC-MBTPLT-JP1-2627-003387')
  ) AS v(jc_number)
),
canonical_models AS (
  SELECT
    m.model_name,
    lower(regexp_replace(m.model_name, '[^a-z0-9]+', '', 'g')) AS model_key
  FROM public.settings_model_options m
  WHERE m.is_active = true
),
source_rows AS (
  SELECT
    nullif(btrim(j.job_card_number), '') AS job_card_number,
    upper(nullif(btrim(j.vehicle_registration_number), '')) AS reg_number,
    nullif(btrim(j.sr_type), '') AS sr_type,
    nullif(btrim(j.sr_assigned_to), '') AS sa_name,
    nullif(btrim(j.employee_code), '') AS employee_code_raw,
    nullif(btrim(j.first_name), '') AS first_name,
    nullif(btrim(j.last_name), '') AS last_name,
    regexp_replace(coalesce(j.account_phone_number, ''), '\\D', '', 'g') AS owner_phone_digits,
    coalesce(nullif(btrim(j.product_line), ''), nullif(btrim(j.parent_product_line), '')) AS model_raw,
    CASE
      WHEN lower(regexp_replace(coalesce(j.branch, ''), '[_\\-]+', ' ', 'g')) LIKE 'ajmer road%' THEN 'Ajmer Road'
      WHEN lower(regexp_replace(coalesce(j.branch, ''), '[_\\-]+', ' ', 'g')) IN ('sitapura', 'sitapura pv', 'sitapura ev') THEN 'Sitapura'
      ELSE NULL
    END AS reception_branch,
    coalesce(j.created_date_time, j.closed_date_time) AS source_ts
  FROM public.job_card_closed_data j
  INNER JOIN target_jc t
    ON upper(btrim(coalesce(j.job_card_number, ''))) = t.jc_number
  WHERE nullif(btrim(j.job_card_number), '') IS NOT NULL
    AND upper(btrim(j.job_card_number)) LIKE 'JC-%'
),
normalized AS (
  SELECT
    s.job_card_number,
    s.reg_number,
    coalesce(cm.model_name, s.model_raw) AS model,
    coalesce(s.sr_type, 'Running Repair') AS service_type,
    coalesce(s.sa_name, s.employee_code_raw, 'UNKNOWN') AS sa_name,
    CASE
      WHEN s.first_name IS NULL AND s.last_name IS NULL THEN NULL
      WHEN s.first_name IS NULL THEN s.last_name
      WHEN s.last_name IS NULL THEN s.first_name
      ELSE s.first_name || ' ' || s.last_name
    END AS owner_name,
    CASE WHEN length(s.owner_phone_digits) = 10 THEN s.owner_phone_digits ELSE NULL END AS owner_phone,
    s.reception_branch,
    s.employee_code_raw,
    s.source_ts
  FROM source_rows s
  LEFT JOIN LATERAL (
    SELECT c.model_name
    FROM canonical_models c
    WHERE
      lower(regexp_replace(coalesce(s.model_raw, ''), '[^a-z0-9]+', '', 'g')) = c.model_key
      OR lower(s.model_raw) LIKE lower(c.model_name) || ' %'
      OR lower(s.model_raw) LIKE lower(c.model_name) || '-%'
      OR lower(s.model_raw) LIKE lower(c.model_name) || '(%'
    ORDER BY length(c.model_name) DESC
    LIMIT 1
  ) cm ON true
),
with_sa_code AS (
  SELECT
    n.*,
    em_match.employee_code AS sa_employee_code,
    em_match.employee_name AS sa_display_name
  FROM normalized n
  LEFT JOIN LATERAL (
    SELECT
      em.employee_code,
      em.employee_name
    FROM public.employee_master em
    WHERE
      upper(btrim(em.employee_code)) = upper(btrim(coalesce(n.employee_code_raw, n.sa_name)))
      OR lower(btrim(em.employee_name)) = lower(btrim(n.sa_name))
    ORDER BY
      CASE
        WHEN upper(btrim(em.employee_code)) = upper(btrim(coalesce(n.employee_code_raw, n.sa_name))) THEN 0
        ELSE 1
      END,
      em.id
    LIMIT 1
  ) em_match ON true
),
ranked AS (
  SELECT
    w.*,
    row_number() OVER (
      PARTITION BY upper(btrim(w.job_card_number))
      ORDER BY w.source_ts DESC NULLS LAST
    ) AS rn
  FROM with_sa_code w
),
to_insert AS (
  SELECT
    p.target_dealer_code AS dealer_code,
    r.reg_number,
    r.model,
    r.service_type,
    r.sa_name,
    r.job_card_number AS jc_number,
    r.owner_name,
    r.owner_phone,
    p.backfill_source AS source,
    'system-backfill-jc-closed'::text AS created_by,
    r.source_ts AS created_at,
    now() AS updated_at,
    r.reception_branch AS branch,
    r.sa_employee_code,
    coalesce(r.sa_display_name, r.sa_name) AS sa_display_name
  FROM ranked r
  CROSS JOIN params p
  WHERE r.rn = 1
    AND r.reg_number IS NOT NULL
    AND r.source_ts IS NOT NULL
    AND r.reception_branch IN ('Ajmer Road', 'Sitapura')
),
inserted AS (
  INSERT INTO public.service_reception_entries (
    dealer_code,
    reg_number,
    model,
    service_type,
    sa_name,
    jc_number,
    owner_name,
    owner_phone,
    source,
    created_by,
    created_at,
    updated_at,
    branch,
    sa_employee_code,
    sa_display_name
  )
  SELECT
    i.dealer_code,
    i.reg_number,
    i.model,
    i.service_type,
    i.sa_name,
    i.jc_number,
    i.owner_name,
    i.owner_phone,
    i.source,
    i.created_by,
    i.created_at,
    i.updated_at,
    i.branch,
    i.sa_employee_code,
    i.sa_display_name
  FROM to_insert i
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.service_reception_entries r
    WHERE upper(btrim(coalesce(r.jc_number, ''))) = upper(btrim(coalesce(i.jc_number, '')))
  )
  RETURNING id
),
updated_existing AS (
  UPDATE public.service_reception_entries r
  SET
    sa_employee_code = i.sa_employee_code,
    sa_display_name = coalesce(i.sa_display_name, r.sa_display_name),
    updated_at = now()
  FROM to_insert i
  WHERE
    upper(btrim(coalesce(r.jc_number, ''))) = upper(btrim(coalesce(i.jc_number, '')))
    AND i.sa_employee_code IS NOT NULL
    AND coalesce(nullif(btrim(r.sa_employee_code), ''), '') = ''
  RETURNING r.id
),
updated_existing_created_at AS (
  UPDATE public.service_reception_entries r
  SET
    created_at = i.created_at,
    updated_at = now()
  FROM to_insert i
  WHERE
    upper(btrim(coalesce(r.jc_number, ''))) = upper(btrim(coalesce(i.jc_number, '')))
    AND i.created_at IS NOT NULL
    AND r.created_at IS DISTINCT FROM i.created_at
  RETURNING r.id
),
counts AS (
  SELECT
    (SELECT count(*)::bigint FROM inserted) AS inserted_count,
    (SELECT count(*)::bigint FROM updated_existing) AS updated_count,
    (SELECT count(*)::bigint FROM updated_existing_created_at) AS created_at_corrected_count
)
SELECT
  inserted_count AS reception_rows_inserted,
  updated_count AS reception_rows_sa_backfilled,
  created_at_corrected_count AS reception_rows_created_at_corrected
FROM counts;

COMMIT;

-- -----------------------------------------------------------------------------
-- Post-checks (selected JCs only)
-- -----------------------------------------------------------------------------
-- WITH target_jc AS (
--   SELECT upper(v.jc_number) AS jc_number
--   FROM (VALUES
--     ('JC-MBTPLT-JP1-2627-002842'),
--     ('JC-MBTPLT-JP1-2627-002820'),
--     ('JC-MBTPLT-JP1-2627-002833'),
--     ('JC-MBTPLT-JP2-2627-002164'),
--     ('JC-MBTPLT-JP2-2627-002156'),
--     ('JC-MBTPLT-JP2-2627-002058'),
--     ('JC-MBTPLT-JP1-2627-002881'),
--     ('JC-MBTPLT-JP1-2627-002788'),
--     ('JC-MBTPLT-JP1-2627-002890'),
--     ('JC-MBTPLT-JP1-2627-002752'),
--     ('JC-MBTPLT-JP1-2627-002582'),
--     ('JC-MBTPLT-JP1-2627-002914'),
--     ('JC-MBTPLT-JP2-2627-001718'),
--     ('JC-MBTPLT-JP1-2627-002979'),
--     ('JC-MBTPLT-JP1-2627-002808'),
--     ('JC-MBTPLT-JP1-2627-002831'),
--     ('JC-MBTPLT-JP1-2627-002888'),
--     ('JC-MBTPLT-JP1-2627-002962'),
--     ('JC-MBTPLT-JP1-2627-002968'),
--     ('JC-MBTPLT-JP2-2627-002135'),
--     ('JC-MBTPLT-JP2-2627-002255'),
--     ('JC-MBTPLT-JP2-2627-001967'),
--     ('JC-MBTPLT-JP2-2627-002092'),
--     ('JC-MBTPLT-JP1-2627-002963'),
--     ('JC-MBTPLT-JP1-2627-002740'),
--     ('JC-MBTPLT-JP2-2627-002077'),
--     ('JC-MBTPLT-JP1-2627-003019'),
--     ('JC-MBTPLT-JP1-2627-003065'),
--     ('JC-MBTPLT-JP1-2627-003022'),
--     ('JC-MBTPLT-JP2-2627-002090'),
--     ('JC-MBTPLT-JP1-2627-003069'),
--     ('JC-MBTPLT-JP1-2627-003006'),
--     ('JC-MBTPLT-JP1-2627-002715'),
--     ('JC-MBTPLT-JP1-2627-003158'),
--     ('JC-MBTPLT-JP1-2627-002769'),
--     ('JC-MBTPLT-JP1-2627-003151'),
--     ('JC-MBTPLT-JP1-2627-003116'),
--     ('JC-MBTPLT-JP2-2627-002384'),
--     ('JC-MBTPLT-JP2-2627-002382'),
--     ('JC-MBTPLT-JP2-2627-002386'),
--     ('JC-MBTPLT-JP2-2627-002393'),
--     ('JC-MBTPLT-JP2-2627-002383'),
--     ('JC-MBTPLT-JP2-2627-002390'),
--     ('JC-MBTPLT-JP1-2627-003103'),
--     ('JC-MBTPLT-JP2-2627-002399'),
--     ('JC-MBTPLT-JP1-2627-003171'),
--     ('JC-MBTPLT-JP2-2627-002398'),
--     ('JC-MBTPLT-JP2-2627-002388'),
--     ('JC-MBTPLT-JP2-2627-002409'),
--     ('JC-MBTPLT-JP2-2627-002405'),
--     ('JC-MBTPLT-JP2-2627-002401'),
--     ('JC-MBTPLT-JP1-2627-003172'),
--     ('JC-MBTPLT-JP2-2627-002438'),
--     ('JC-MBTPLT-JP2-2627-002440'),
--     ('JC-MBTPLT-JP2-2627-002049'),
--     ('JC-MBTPLT-JP2-2627-002437'),
--     ('JC-MBTPLT-JP2-2627-002436'),
--     ('JC-MBTPLT-JP2-2627-002433'),
--     ('JC-MBTPLT-JP1-2627-002647'),
--     ('JC-MBTPLT-JP1-2627-003187'),
--     ('JC-MBTPLT-JP2-2627-002450'),
--     ('JC-MBTPLT-JP2-2627-002471'),
--     ('JC-MBTPLT-JP2-2627-002472'),
--     ('JC-MBTPLT-JP1-2627-003225'),
--     ('JC-MBTPLT-JP1-2627-003224'),
--     ('JC-MBTPLT-JP1-2627-001254'),
--     ('JC-MBTPLT-JP2-2627-002473'),
--     ('JC-MBTPLT-JP2-2627-002469'),
--     ('JC-MBTPLT-JP2-2627-002477'),
--     ('JC-MBTPLT-JP1-2627-003226'),
--     ('JC-MBTPLT-JP1-2627-003237'),
--     ('JC-MBTPLT-JP2-2627-002505'),
--     ('JC-MBTPLT-JP2-2627-001384'),
--     ('JC-MBTPLT-JP1-2627-003211'),
--     ('JC-MBTPLT-JP2-2627-002500'),
--     ('JC-MBTPLT-JP2-2627-002503'),
--     ('JC-MBTPLT-JP2-2627-002481'),
--     ('JC-MBTPLT-JP2-2627-002502'),
--     ('JC-MBTPLT-JP2-2627-002501'),
--     ('JC-MBTPLT-JP2-2627-002508'),
--     ('JC-MBTPLT-JP2-2627-002504'),
--     ('JC-MBTPLT-JP2-2627-002499'),
--     ('JC-MBTPLT-JP2-2627-002530'),
--     ('JC-MBTPLT-JP2-2627-002541'),
--     ('JC-MBTPLT-JP2-2627-002540'),
--     ('JC-MBTPLT-JP2-2627-002516'),
--     ('JC-MBTPLT-JP2-2627-002515'),
--     ('JC-MBTPLT-JP2-2627-002506'),
--     ('JC-MBTPLT-JP2-2627-002531'),
--     ('JC-MBTPLT-JP2-2627-002553'),
--     ('JC-MBTPLT-JP2-2627-002555'),
--     ('JC-MBTPLT-JP2-2627-002529'),
--     ('JC-MBTPLT-JP2-2627-002534'),
--     ('JC-MBTPLT-JP2-2627-002552'),
--     ('JC-MBTPLT-JP1-2627-002303'),
--     ('JC-MBTPLT-JP1-2627-003323'),
--     ('JC-MBTPLT-JP1-2627-003007'),
--     ('JC-MBTPLT-JP2-2627-002582'),
--     ('JC-MBTPLT-JP2-2627-002587'),
--     ('JC-MBTPLT-JP2-2627-002580'),
--     ('JC-MBTPLT-JP2-2627-002581'),
--     ('JC-MBTPLT-JP1-2627-003320'),
--     ('JC-MBTPLT-JP1-2627-003310'),
--     ('JC-MBTPLT-JP2-2627-001904'),
--     ('JC-MBTPLT-JP2-2627-002613'),
--     ('JC-MBTPLT-JP2-2627-002608'),
--     ('JC-MBTPLT-JP1-2627-003387')
--   ) AS v(jc_number)
-- )
-- SELECT
--   r.jc_number,
--   r.reg_number,
--   r.branch,
--   r.source,
--   r.created_at
-- FROM public.service_reception_entries r
-- INNER JOIN target_jc t
--   ON upper(btrim(coalesce(r.jc_number, ''))) = t.jc_number
-- ORDER BY r.jc_number;