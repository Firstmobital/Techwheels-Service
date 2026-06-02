-- Import 3 Open Job Card sheets and backfill Reception entries without JC duplicates
--
-- IMPORTANT
-- 1) Run this in Supabase SQL Editor manually.
-- 2) First load all 3 files into public.open_job_cards_import_staging (defined below).
-- 3) Ensure each imported row has branch set to one of:
--      Ajmer Road | Sitapura PV | Sitapura EV
-- 4) Deduplication rule for reception insert: JC number is unique across table.
--    If same JC already exists in service_reception_entries, it is NOT inserted again.
-- 5) Model normalization uses active Settings Models (public.settings_model_options).
-- 6) Reception branch is physical branch only:
--      Ajmer Road | Sitapura
--    Source labels Sitapura PV / Sitapura EV are normalized to Sitapura.

BEGIN;

-- -----------------------------------------------------------------------------
-- A) Staging table for the 3 uploaded files
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.open_job_cards_import_staging (
  id bigint generated always as identity primary key,
  source_file text,
  branch text not null,
  vehicle_registration_number text,
  sr_type text,
  job_card_number text,
  status text,
  created_date_time text,
  closed_date_time text,
  completed_date_time text,
  chassis_number text,
  job_card_channel text,
  service_request_no text,
  account text,
  first_name text,
  last_name text,
  sr_assigned_to text,
  account_phone_number text,
  contact_phones text,
  parent_product_line text,
  product_line text,
  parts_entry_complete text,
  imported_at timestamptz not null default now(),
  constraint open_job_cards_import_staging_branch_check
    check (branch in ('Ajmer Road', 'Sitapura PV', 'Sitapura EV'))
);

-- -----------------------------------------------------------------------------
-- B) Upsert staged rows into public.open_job_cards
-- -----------------------------------------------------------------------------
WITH normalized AS (
  SELECT
    branch,
    nullif(btrim(job_card_number), '') AS job_card_number,
    nullif(btrim(status), '') AS status,
    upper(nullif(btrim(vehicle_registration_number), '')) AS vehicle_registration_number,
    nullif(btrim(job_card_channel), '') AS job_card_channel,
    nullif(btrim(service_request_no), '') AS service_request_no,
    nullif(btrim(account), '') AS account,
    nullif(btrim(last_name), '') AS last_name,
    nullif(btrim(first_name), '') AS first_name,
    nullif(btrim(sr_assigned_to), '') AS sr_assigned_to,
    nullif(btrim(parts_entry_complete), '') AS parts_entry_complete,
    nullif(btrim(chassis_number), '') AS chassis_number,
    nullif(btrim(sr_type), '') AS sr_type,
    nullif(btrim(account_phone_number), '') AS account_phone_number,
    nullif(btrim(contact_phones), '') AS contact_phones,
    nullif(btrim(parent_product_line), '') AS parent_product_line,
    nullif(btrim(product_line), '') AS product_line,
    CASE
      WHEN nullif(btrim(created_date_time), '') IS NULL THEN NULL
      ELSE coalesce(
        to_timestamp(created_date_time, 'DD/MM/YYYY HH24:MI')::timestamptz,
        to_timestamp(created_date_time, 'DD/MM/YY HH24:MI')::timestamptz,
        to_timestamp(created_date_time, 'DD-MM-YYYY HH24:MI')::timestamptz,
        to_timestamp(created_date_time, 'DD-MM-YY HH24:MI')::timestamptz,
        to_timestamp(created_date_time, 'DD/MM/YYYY HH12:MI AM')::timestamptz,
        to_timestamp(created_date_time, 'DD/MM/YY HH12:MI AM')::timestamptz,
        to_timestamp(created_date_time, 'DD-MM-YYYY HH12:MI AM')::timestamptz,
        to_timestamp(created_date_time, 'DD-MM-YY HH12:MI AM')::timestamptz
      )
    END AS created_date_time_parsed,
    CASE
      WHEN nullif(btrim(closed_date_time), '') IS NULL THEN NULL
      ELSE coalesce(
        to_timestamp(closed_date_time, 'DD/MM/YYYY HH24:MI')::timestamptz,
        to_timestamp(closed_date_time, 'DD/MM/YY HH24:MI')::timestamptz,
        to_timestamp(closed_date_time, 'DD-MM-YYYY HH24:MI')::timestamptz,
        to_timestamp(closed_date_time, 'DD-MM-YY HH24:MI')::timestamptz,
        to_timestamp(closed_date_time, 'DD/MM/YYYY HH12:MI AM')::timestamptz,
        to_timestamp(closed_date_time, 'DD/MM/YY HH12:MI AM')::timestamptz,
        to_timestamp(closed_date_time, 'DD-MM-YYYY HH12:MI AM')::timestamptz,
        to_timestamp(closed_date_time, 'DD-MM-YY HH12:MI AM')::timestamptz
      )
    END AS closed_date_time_parsed,
    CASE
      WHEN nullif(btrim(completed_date_time), '') IS NULL THEN NULL
      ELSE coalesce(
        to_timestamp(completed_date_time, 'DD/MM/YYYY HH24:MI')::timestamptz,
        to_timestamp(completed_date_time, 'DD/MM/YY HH24:MI')::timestamptz,
        to_timestamp(completed_date_time, 'DD-MM-YYYY HH24:MI')::timestamptz,
        to_timestamp(completed_date_time, 'DD-MM-YY HH24:MI')::timestamptz,
        to_timestamp(completed_date_time, 'DD/MM/YYYY HH12:MI AM')::timestamptz,
        to_timestamp(completed_date_time, 'DD/MM/YY HH12:MI AM')::timestamptz,
        to_timestamp(completed_date_time, 'DD-MM-YYYY HH12:MI AM')::timestamptz,
        to_timestamp(completed_date_time, 'DD-MM-YY HH12:MI AM')::timestamptz
      )
    END AS completed_date_time_parsed,
    imported_at,
    id
  FROM public.open_job_cards_import_staging
  WHERE nullif(btrim(job_card_number), '') IS NOT NULL
),
ranked AS (
  SELECT
    n.*,
    row_number() OVER (
      PARTITION BY upper(btrim(n.job_card_number)), n.branch
      ORDER BY n.created_date_time_parsed DESC NULLS LAST, n.imported_at DESC, n.id DESC
    ) AS rn
  FROM normalized n
),
upsert_rows AS (
  SELECT *
  FROM ranked
  WHERE rn = 1
),
upserted AS (
  INSERT INTO public.open_job_cards (
    branch,
    job_card_number,
    status,
    vehicle_registration_number,
    job_card_channel,
    created_date_time,
    completed_date_time,
    closed_date_time,
    service_request_no,
    account,
    last_name,
    first_name,
    sr_assigned_to,
    parts_entry_complete,
    chassis_number,
    sr_type,
    account_phone_number,
    contact_phones,
    parent_product_line,
    product_line
  )
  SELECT
    u.branch,
    u.job_card_number,
    u.status,
    u.vehicle_registration_number,
    u.job_card_channel,
    u.created_date_time_parsed,
    u.completed_date_time_parsed,
    u.closed_date_time_parsed,
    u.service_request_no,
    u.account,
    u.last_name,
    u.first_name,
    u.sr_assigned_to,
    u.parts_entry_complete,
    u.chassis_number,
    u.sr_type,
    u.account_phone_number,
    u.contact_phones,
    u.parent_product_line,
    u.product_line
  FROM upsert_rows u
  ON CONFLICT (job_card_number, branch)
  DO UPDATE SET
    status = excluded.status,
    vehicle_registration_number = excluded.vehicle_registration_number,
    job_card_channel = excluded.job_card_channel,
    created_date_time = excluded.created_date_time,
    completed_date_time = excluded.completed_date_time,
    closed_date_time = excluded.closed_date_time,
    service_request_no = excluded.service_request_no,
    account = excluded.account,
    last_name = excluded.last_name,
    first_name = excluded.first_name,
    sr_assigned_to = excluded.sr_assigned_to,
    parts_entry_complete = excluded.parts_entry_complete,
    chassis_number = excluded.chassis_number,
    sr_type = excluded.sr_type,
    account_phone_number = excluded.account_phone_number,
    contact_phones = excluded.contact_phones,
    parent_product_line = excluded.parent_product_line,
    product_line = excluded.product_line,
    updated_at = now()
  RETURNING id
),
upsert_count AS (
  SELECT count(*)::bigint AS total FROM upserted
)
SELECT total AS open_job_cards_upserted
FROM upsert_count;

-- -----------------------------------------------------------------------------
-- C) Backfill reception entries from open_job_cards with JC dedupe
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT
    '3000840'::text AS target_dealer_code,
    'Open Job Cards Backfill (3 sheets 2026-06-02)'::text AS backfill_source
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
    o.job_card_number,
    upper(nullif(btrim(o.vehicle_registration_number), '')) AS reg_number,
    nullif(btrim(o.sr_type), '') AS sr_type,
    nullif(btrim(o.sr_assigned_to), '') AS sa_name,
    nullif(btrim(o.first_name), '') AS first_name,
    nullif(btrim(o.last_name), '') AS last_name,
    regexp_replace(coalesce(o.account_phone_number, ''), '\\D', '', 'g') AS owner_phone_digits,
    coalesce(nullif(btrim(o.product_line), ''), nullif(btrim(o.parent_product_line), '')) AS model_raw,
    CASE
      WHEN lower(regexp_replace(coalesce(o.branch, ''), '[_\\-]+', ' ', 'g')) LIKE 'ajmer road%' THEN 'Ajmer Road'
      WHEN lower(regexp_replace(coalesce(o.branch, ''), '[_\\-]+', ' ', 'g')) IN ('sitapura', 'sitapura pv', 'sitapura ev') THEN 'Sitapura'
      ELSE NULL
    END AS reception_branch,
    coalesce(o.created_date_time, o.closed_date_time, now()) AS source_ts
  FROM public.open_job_cards o
  WHERE nullif(btrim(o.job_card_number), '') IS NOT NULL
    AND upper(btrim(o.job_card_number)) LIKE 'JC-%'
),
normalized AS (
  SELECT
    s.job_card_number,
    s.reg_number,
    coalesce(cm.model_name, s.model_raw) AS model,
    coalesce(s.sr_type, 'Running Repair') AS service_type,
    coalesce(s.sa_name, 'UNKNOWN') AS sa_name,
    CASE
      WHEN s.first_name IS NULL AND s.last_name IS NULL THEN NULL
      WHEN s.first_name IS NULL THEN s.last_name
      WHEN s.last_name IS NULL THEN s.first_name
      ELSE s.first_name || ' ' || s.last_name
    END AS owner_name,
    CASE WHEN length(s.owner_phone_digits) = 10 THEN s.owner_phone_digits ELSE NULL END AS owner_phone,
    s.reception_branch,
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
    em.employee_code AS sa_employee_code,
    em.employee_name AS sa_display_name
  FROM normalized n
  LEFT JOIN public.employee_master em
    ON lower(btrim(em.employee_name)) = lower(btrim(n.sa_name))
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
    'system-backfill-open-jc'::text AS created_by,
    coalesce(r.source_ts, now()) AS created_at,
    now() AS updated_at,
    r.reception_branch AS branch,
    r.sa_employee_code,
    coalesce(r.sa_display_name, r.sa_name) AS sa_display_name
  FROM ranked r
  CROSS JOIN params p
  WHERE r.rn = 1
    AND r.reg_number IS NOT NULL
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
)
SELECT count(*) AS reception_rows_inserted FROM inserted;

COMMIT;

-- -----------------------------------------------------------------------------
-- Post-checks
-- -----------------------------------------------------------------------------
-- SELECT count(*) AS open_job_cards_rows FROM public.open_job_cards;
-- SELECT count(*) AS reception_jc_non_prefixed
-- FROM public.service_reception_entries
-- WHERE coalesce(nullif(btrim(jc_number), ''), '') !~* '^JC-';
-- SELECT count(*) AS reception_duplicate_jc
-- FROM (
--   SELECT upper(btrim(jc_number)) AS jc, count(*)
--   FROM public.service_reception_entries
--   WHERE coalesce(nullif(btrim(jc_number), ''), '') <> ''
--   GROUP BY upper(btrim(jc_number))
--   HAVING count(*) > 1
-- ) d;
