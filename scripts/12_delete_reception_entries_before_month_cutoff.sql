-- Delete reception entries older than a month cutoff (manual run only).
--
-- Authoritative table: public.service_reception_entries
-- Verified from local authoritative dump chunk:
--   local_folder/backups/chunks/full_database.sql.part_000 (CREATE TABLE block)
--
-- Run this in Supabase SQL Editor.
-- Default cutoff keeps all rows on/after 2026-06-01 in IST.
-- Update cutoff_ist if you want a different retention boundary.

BEGIN;

-- 1) Set cutoff in IST and preview what will be deleted.
WITH params AS (
  SELECT timestamp '2026-06-01 00:00:00' AS cutoff_ist
),
marked AS (
  SELECT
    r.id,
    r.reg_number,
    r.jc_number,
    r.created_at,
    (r.created_at AT TIME ZONE 'Asia/Kolkata') AS created_at_ist
  FROM public.service_reception_entries r
  CROSS JOIN params p
  WHERE (r.created_at AT TIME ZONE 'Asia/Kolkata') < p.cutoff_ist
)
SELECT
  (SELECT cutoff_ist FROM params) AS cutoff_ist,
  count(*) AS rows_marked_for_delete,
  min(created_at) AS oldest_created_at_utc,
  max(created_at) AS newest_created_at_utc
FROM marked;

-- Optional sanity sample before delete.
WITH params AS (
  SELECT timestamp '2026-06-01 00:00:00' AS cutoff_ist
)
SELECT
  r.id,
  r.reg_number,
  r.jc_number,
  r.created_at,
  (r.created_at AT TIME ZONE 'Asia/Kolkata') AS created_at_ist
FROM public.service_reception_entries r
CROSS JOIN params p
WHERE (r.created_at AT TIME ZONE 'Asia/Kolkata') < p.cutoff_ist
ORDER BY r.created_at DESC
LIMIT 50;

-- 2) Delete older-month rows.
WITH params AS (
  SELECT timestamp '2026-06-01 00:00:00' AS cutoff_ist
)
DELETE FROM public.service_reception_entries r
USING params p
WHERE (r.created_at AT TIME ZONE 'Asia/Kolkata') < p.cutoff_ist;

-- 3) Post-delete verification: remaining rows by IST month.
SELECT
  to_char((created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month_ist,
  count(*) AS rows_left
FROM public.service_reception_entries
GROUP BY 1
ORDER BY 1 DESC;

COMMIT;
