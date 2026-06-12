-- ============================================================
-- SUPABASE-002 Phase 4.2/4.3: Location + Portal semantics split
-- Created: 2026-06-11
--
-- Goals:
--   1) Add explicit location (physical site) and portal (EV/PV stream)
--      alongside legacy branch in key operational tables.
--   2) Add derived branch_label for compatibility-safe display usage.
--   3) Backfill from legacy branch with deterministic parsing.
--
-- Rules:
--   - Keep legacy branch column unchanged for transition compatibility.
--   - Do not infer portal when legacy branch has no PV/EV suffix.
-- ============================================================

BEGIN;

-- 1) Add semantics columns to service_reception_entries
ALTER TABLE public.service_reception_entries
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS portal text,
  ADD COLUMN IF NOT EXISTS branch_label text;

-- 2) Add semantics columns to bodyshop_repair_cards
ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS portal text,
  ADD COLUMN IF NOT EXISTS branch_label text;

-- 3) Add semantics columns to job_card_closed_data (SA tracker/report source)
ALTER TABLE public.job_card_closed_data
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS portal text,
  ADD COLUMN IF NOT EXISTS branch_label text;

-- 4) Standardize portal constraint (nullable for unknown legacy rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_reception_entries_portal_check'
  ) THEN
    ALTER TABLE public.service_reception_entries
      ADD CONSTRAINT service_reception_entries_portal_check
      CHECK (portal IS NULL OR portal IN ('EV', 'PV'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bodyshop_repair_cards_portal_check'
  ) THEN
    ALTER TABLE public.bodyshop_repair_cards
      ADD CONSTRAINT bodyshop_repair_cards_portal_check
      CHECK (portal IS NULL OR portal IN ('EV', 'PV'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_card_closed_data_portal_check'
  ) THEN
    ALTER TABLE public.job_card_closed_data
      ADD CONSTRAINT job_card_closed_data_portal_check
      CHECK (portal IS NULL OR portal IN ('EV', 'PV'));
  END IF;
END
$$;

-- 5) Backfill semantics from existing branch text
-- Parsing rule:
--   '* EV' -> location='*', portal='EV'
--   '* PV' -> location='*', portal='PV'
--   otherwise location=branch, portal=NULL

UPDATE public.service_reception_entries s
SET
  location = CASE
    WHEN upper(btrim(coalesce(s.branch, ''))) LIKE '% EV'
      THEN btrim(regexp_replace(btrim(coalesce(s.branch, '')), '(?i)\s+EV$', ''))
    WHEN upper(btrim(coalesce(s.branch, ''))) LIKE '% PV'
      THEN btrim(regexp_replace(btrim(coalesce(s.branch, '')), '(?i)\s+PV$', ''))
    ELSE NULLIF(btrim(coalesce(s.branch, '')), '')
  END,
  portal = CASE
    WHEN upper(btrim(coalesce(s.branch, ''))) LIKE '% EV' THEN 'EV'
    WHEN upper(btrim(coalesce(s.branch, ''))) LIKE '% PV' THEN 'PV'
    ELSE NULL
  END,
  branch_label = CASE
    WHEN upper(btrim(coalesce(s.branch, ''))) LIKE '% EV'
      THEN btrim(regexp_replace(btrim(coalesce(s.branch, '')), '(?i)\s+EV$', '')) || ' EV'
    WHEN upper(btrim(coalesce(s.branch, ''))) LIKE '% PV'
      THEN btrim(regexp_replace(btrim(coalesce(s.branch, '')), '(?i)\s+PV$', '')) || ' PV'
    ELSE NULLIF(btrim(coalesce(s.branch, '')), '')
  END
WHERE s.location IS NULL OR s.portal IS NULL OR s.branch_label IS NULL;

UPDATE public.bodyshop_repair_cards b
SET
  location = CASE
    WHEN upper(btrim(coalesce(b.branch, ''))) LIKE '% EV'
      THEN btrim(regexp_replace(btrim(coalesce(b.branch, '')), '(?i)\s+EV$', ''))
    WHEN upper(btrim(coalesce(b.branch, ''))) LIKE '% PV'
      THEN btrim(regexp_replace(btrim(coalesce(b.branch, '')), '(?i)\s+PV$', ''))
    ELSE NULLIF(btrim(coalesce(b.branch, '')), '')
  END,
  portal = CASE
    WHEN upper(btrim(coalesce(b.branch, ''))) LIKE '% EV' THEN 'EV'
    WHEN upper(btrim(coalesce(b.branch, ''))) LIKE '% PV' THEN 'PV'
    ELSE NULL
  END,
  branch_label = CASE
    WHEN upper(btrim(coalesce(b.branch, ''))) LIKE '% EV'
      THEN btrim(regexp_replace(btrim(coalesce(b.branch, '')), '(?i)\s+EV$', '')) || ' EV'
    WHEN upper(btrim(coalesce(b.branch, ''))) LIKE '% PV'
      THEN btrim(regexp_replace(btrim(coalesce(b.branch, '')), '(?i)\s+PV$', '')) || ' PV'
    ELSE NULLIF(btrim(coalesce(b.branch, '')), '')
  END
WHERE b.location IS NULL OR b.portal IS NULL OR b.branch_label IS NULL;

UPDATE public.job_card_closed_data j
SET
  location = CASE
    WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% EV'
      THEN btrim(regexp_replace(btrim(coalesce(j.branch, '')), '(?i)\s+EV$', ''))
    WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% PV'
      THEN btrim(regexp_replace(btrim(coalesce(j.branch, '')), '(?i)\s+PV$', ''))
    ELSE NULLIF(btrim(coalesce(j.branch, '')), '')
  END,
  portal = CASE
    WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% EV' THEN 'EV'
    WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% PV' THEN 'PV'
    ELSE NULL
  END,
  branch_label = CASE
    WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% EV'
      THEN btrim(regexp_replace(btrim(coalesce(j.branch, '')), '(?i)\s+EV$', '')) || ' EV'
    WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% PV'
      THEN btrim(regexp_replace(btrim(coalesce(j.branch, '')), '(?i)\s+PV$', '')) || ' PV'
    ELSE NULLIF(btrim(coalesce(j.branch, '')), '')
  END
WHERE j.location IS NULL OR j.portal IS NULL OR j.branch_label IS NULL;

-- 6) Add practical indexes for new filtering semantics
CREATE INDEX IF NOT EXISTS idx_sre_location_portal
  ON public.service_reception_entries(location, portal);

CREATE INDEX IF NOT EXISTS idx_brc_location_portal
  ON public.bodyshop_repair_cards(location, portal);

CREATE INDEX IF NOT EXISTS idx_jccd_location_portal
  ON public.job_card_closed_data(location, portal);

COMMIT;
