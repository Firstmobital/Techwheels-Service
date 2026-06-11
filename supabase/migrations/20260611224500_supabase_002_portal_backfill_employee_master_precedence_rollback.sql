-- ============================================================
-- SUPABASE-002 rollback: portal backfill hardening
-- Created: 2026-06-11
-- Reverts migration intent by re-deriving compatibility baseline from branch.
-- ============================================================

BEGIN;

UPDATE public.service_reception_entries s
SET
  location = COALESCE(NULLIF(btrim(regexp_replace(coalesce(s.branch, ''), '(?i)\s+(EV|PV)$', '')), ''), NULLIF(btrim(s.branch), '')),
  portal = CASE
    WHEN upper(btrim(coalesce(s.branch, ''))) LIKE '% EV' THEN 'EV'
    WHEN upper(btrim(coalesce(s.branch, ''))) LIKE '% PV' THEN 'PV'
    ELSE NULL
  END,
  branch_label = NULLIF(btrim(s.branch), '');

UPDATE public.bodyshop_repair_cards b
SET
  location = COALESCE(NULLIF(btrim(regexp_replace(coalesce(b.branch, ''), '(?i)\s+(EV|PV)$', '')), ''), NULLIF(btrim(b.branch), '')),
  portal = CASE
    WHEN upper(btrim(coalesce(b.branch, ''))) LIKE '% EV' THEN 'EV'
    WHEN upper(btrim(coalesce(b.branch, ''))) LIKE '% PV' THEN 'PV'
    ELSE NULL
  END,
  branch_label = NULLIF(btrim(b.branch), '');

UPDATE public.job_card_closed_data j
SET
  location = COALESCE(NULLIF(btrim(regexp_replace(coalesce(j.branch, ''), '(?i)\s+(EV|PV)$', '')), ''), NULLIF(btrim(j.branch), '')),
  portal = CASE
    WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% EV' THEN 'EV'
    WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% PV' THEN 'PV'
    ELSE NULL
  END,
  branch_label = NULLIF(btrim(j.branch), '');

-- Restore previous trigger function behavior from pre-hardening state.
CREATE OR REPLACE FUNCTION public.apply_sa_business_mapping_on_reception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  code_upper text;
  employee_location text;
BEGIN
  code_upper := upper(btrim(coalesce(NEW.sa_employee_code, '')));

  IF code_upper = '' THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(btrim(em.location), '')
  INTO employee_location
  FROM public.employee_master em
  WHERE upper(btrim(coalesce(em.employee_code, ''))) = code_upper
  LIMIT 1;

  IF code_upper LIKE '%500A840%' THEN
    NEW.dealer_code := '500A840';
  ELSIF code_upper LIKE '%3001440%' THEN
    NEW.dealer_code := '3001440';
  ELSIF code_upper LIKE '%3000840%' THEN
    NEW.dealer_code := '3000840';
  END IF;

  IF employee_location IS NOT NULL THEN
    NEW.branch := employee_location;
  ELSIF code_upper LIKE '%500A840%' THEN
    NEW.branch := 'Sitapura';
  ELSIF code_upper LIKE '%3001440%' THEN
    NEW.branch := 'Ajmer Road';
  ELSIF code_upper LIKE '%3000840%' THEN
    NEW.branch := 'Sitapura';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
