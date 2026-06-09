-- 2026-06-08
-- Backfill 2 pending Service Advisor rows to enforce dealer_code + branch from SA code.
--
-- Business mapping:
--   * %3000840% -> dealer_code=3000840, branch=Sitapura
--   * %500A840% -> dealer_code=500A840, branch=Sitapura
--   * %3001440% -> dealer_code=3001440, branch=Ajmer Road
--
-- Target rows (from current pending list):
--   JC-FSTMBL-FQ7-2627-000594
--   JC-FSTMBL-FQ7-2627-000581

BEGIN;

WITH sa_rules AS (
  SELECT 1 AS priority, '500A840'::text AS code_fragment, '500A840'::text AS dealer_code, 'Sitapura'::text AS branch
  UNION ALL
  SELECT 2, '3001440', '3001440', 'Ajmer Road'
  UNION ALL
  SELECT 3, '3000840', '3000840', 'Sitapura'
), target_rows AS (
  SELECT
    r.id,
    r.jc_number,
    r.sa_employee_code,
    s.dealer_code AS expected_dealer_code,
    s.branch AS expected_branch,
    row_number() OVER (PARTITION BY r.id ORDER BY s.priority) AS rn
  FROM public.service_reception_entries r
  JOIN sa_rules s
    ON upper(coalesce(r.sa_employee_code, '')) LIKE '%' || upper(s.code_fragment) || '%'
  WHERE upper(btrim(coalesce(r.jc_number, ''))) IN (
    upper('JC-FSTMBL-FQ7-2627-000594'),
    upper('JC-FSTMBL-FQ7-2627-000581')
  )
), to_update AS (
  SELECT
    id,
    expected_dealer_code,
    expected_branch
  FROM target_rows
  WHERE rn = 1
)
UPDATE public.service_reception_entries r
SET
  dealer_code = t.expected_dealer_code,
  branch = t.expected_branch,
  updated_at = now()
FROM to_update t
WHERE r.id = t.id
  AND (
    coalesce(r.dealer_code, '') <> t.expected_dealer_code
    OR coalesce(r.branch, '') <> t.expected_branch
  );

COMMIT;

-- Post-run verification:
-- 1) Show the two rows with expected mapping
-- SELECT
--   id,
--   jc_number,
--   sa_employee_code,
--   dealer_code,
--   branch,
--   updated_at
-- FROM public.service_reception_entries
-- WHERE upper(btrim(coalesce(jc_number, ''))) IN (
--   upper('JC-FSTMBL-FQ7-2627-000594'),
--   upper('JC-FSTMBL-FQ7-2627-000581')
-- )
-- ORDER BY updated_at DESC;
--
-- 2) Hard check for mismatch after update (expect 0 rows)
-- WITH sa_rules AS (
--   SELECT 1 AS priority, '500A840'::text AS code_fragment, '500A840'::text AS dealer_code, 'Sitapura'::text AS branch
--   UNION ALL
--   SELECT 2, '3001440', '3001440', 'Ajmer Road'
--   UNION ALL
--   SELECT 3, '3000840', '3000840', 'Sitapura'
-- )
-- SELECT
--   r.id,
--   r.jc_number,
--   r.sa_employee_code,
--   r.dealer_code,
--   r.branch,
--   s.dealer_code AS expected_dealer_code,
--   s.branch AS expected_branch
-- FROM public.service_reception_entries r
-- JOIN sa_rules s
--   ON upper(coalesce(r.sa_employee_code, '')) LIKE '%' || upper(s.code_fragment) || '%'
-- WHERE upper(btrim(coalesce(r.jc_number, ''))) IN (
--   upper('JC-FSTMBL-FQ7-2627-000594'),
--   upper('JC-FSTMBL-FQ7-2627-000581')
-- )
--   AND (coalesce(r.dealer_code, '') <> s.dealer_code OR coalesce(r.branch, '') <> s.branch);
