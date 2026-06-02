-- Backfill Reception entries from PSF Revenue source (job_card_closed_data)
-- Window: 2026-05-28 to 2026-05-31 (inclusive)
-- Authoritative source schema: local_folder/backups/full_database.sql
--
-- IMPORTANT:
-- 1) Set target dealer code before running.
-- 2) Run in Supabase SQL Editor manually.
-- 3) Uses a dedicated source tag for 28-31 window.
-- 4) Duplicate guard is source-agnostic (dealer + reg + jc) to avoid reinserts
--    when source labels differ across backfill runs.
-- 5) Existing 30-31 May reception rows WILL NOT be reinserted (dedupe by dealer+reg+jc).
--    Any technician_assignments work on those rows is preserved.
-- 6) Model normalization is canonicalized from public.settings_model_options (active rows),
--    so variant/product-line strings (for example "Harrier EV Empowered AWD75ACFC")
--    are stored as canonical model names (for example "Harrier EV").
--
-- OPTIONAL: To preview rows that will be inserted (without committing), replace the final SELECT
-- with a verification query to count rows that would be inserted.

BEGIN;

WITH params AS (
  SELECT
    '3000840'::text AS target_dealer_code,
    'PSF Revenue Backfill (28-31 May 2026)'::text AS backfill_source,
    DATE '2026-05-28' AS start_date,
    DATE '2026-05-31' AS end_date
),
source_rows AS (
  SELECT
    j.branch,
    nullif(btrim(j.job_card_number), '') AS jc_number,
    upper(nullif(btrim(j.vehicle_registration_number), '')) AS reg_number,
    nullif(btrim(j.product_line), '') AS model_raw,
    coalesce(nullif(btrim(j.sr_type), ''), 'Running Repair') AS service_type,
    coalesce(nullif(btrim(j.sr_assigned_to), ''), nullif(btrim(j.employee_code), ''), 'UNKNOWN') AS sa_name,
    nullif(btrim(j.first_name), '') AS first_name,
    nullif(btrim(j.last_name), '') AS last_name,
    regexp_replace(coalesce(j.account_phone_number, ''), '\\D', '', 'g') AS owner_phone_digits,
    nullif(btrim(j.employee_code), '') AS employee_code_raw,
    coalesce(j.created_date_time, j.closed_date_time, (j.invoice_date::timestamptz), j.created_at) AS source_ts
  FROM public.job_card_closed_data j
  CROSS JOIN params p
  WHERE (
    coalesce(j.created_date_time::date, j.closed_date_time::date, j.invoice_date, j.created_at::date)
    BETWEEN p.start_date AND p.end_date
  )
    AND nullif(btrim(j.vehicle_registration_number), '') IS NOT NULL
),
normalized AS (
  SELECT
    s.branch,
    s.jc_number,
    s.reg_number,
    s.model_raw,
    s.service_type,
    s.sa_name,
    CASE
      WHEN s.first_name IS NULL AND s.last_name IS NULL THEN NULL
      WHEN s.first_name IS NULL THEN s.last_name
      WHEN s.last_name IS NULL THEN s.first_name
      ELSE s.first_name || ' ' || s.last_name
    END AS owner_name,
    CASE WHEN length(s.owner_phone_digits) = 10 THEN s.owner_phone_digits ELSE NULL END AS owner_phone,
    s.employee_code_raw,
    s.source_ts
  FROM source_rows s
),
canonical_models AS (
  SELECT
    m.model_name,
    lower(regexp_replace(m.model_name, '[^a-z0-9]+', '', 'g')) AS model_key
  FROM public.settings_model_options m
  WHERE m.is_active = true
),
normalized_with_model AS (
  SELECT
    n.branch,
    n.jc_number,
    n.reg_number,
    coalesce(cm.model_name, n.model_raw) AS model,
    n.service_type,
    n.sa_name,
    n.owner_name,
    n.owner_phone,
    n.employee_code_raw,
    n.source_ts
  FROM normalized n
  LEFT JOIN LATERAL (
    SELECT c.model_name
    FROM canonical_models c
    WHERE
      lower(regexp_replace(coalesce(n.model_raw, ''), '[^a-z0-9]+', '', 'g')) = c.model_key
      OR lower(n.model_raw) LIKE lower(c.model_name) || ' %'
      OR lower(n.model_raw) LIKE lower(c.model_name) || '-%'
      OR lower(n.model_raw) LIKE lower(c.model_name) || '(%'
    ORDER BY length(c.model_name) DESC
    LIMIT 1
  ) cm ON true
),
with_sa_code AS (
  SELECT
    n.*,
    em.employee_code AS sa_employee_code,
    em.employee_name AS sa_display_name
  FROM normalized_with_model n
  LEFT JOIN public.employee_master em
    ON upper(em.employee_code) = upper(n.employee_code_raw)
),
ranked AS (
  SELECT
    w.*,
    row_number() OVER (
      PARTITION BY coalesce(w.jc_number, ''), w.reg_number
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
    r.jc_number,
    r.owner_name,
    r.owner_phone,
    p.backfill_source AS source,
    'system-backfill-psf'::text AS created_by,
    coalesce(r.source_ts, now()) AS created_at,
    now() AS updated_at,
    r.branch,
    r.sa_employee_code,
    coalesce(r.sa_display_name, r.sa_name) AS sa_display_name
  FROM ranked r
  CROSS JOIN params p
  WHERE r.rn = 1
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
    WHERE r.dealer_code = i.dealer_code
      AND upper(r.reg_number) = upper(i.reg_number)
      AND coalesce(r.jc_number, '') = coalesce(i.jc_number, '')
  )
  RETURNING id
)
SELECT count(*) AS inserted_rows FROM inserted;

-- VERIFICATION (optional): To count rows without inserting, comment out the INSERT...SELECT above
-- and uncomment this query in a fresh transaction:
-- SELECT count(*) AS rows_to_insert FROM to_insert t
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.service_reception_entries r
--   WHERE r.dealer_code = t.dealer_code
--     AND upper(r.reg_number) = upper(t.reg_number)
--     AND coalesce(r.jc_number, '') = coalesce(t.jc_number, '')
-- );

COMMIT;
