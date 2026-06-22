-- Purpose:
-- Fix bodyshop_assignments.dealer_code values that were stored as branch/location labels
-- (e.g. Sitapura/Ajmer Road) instead of canonical dealer codes, which breaks non-admin RLS
-- that depends on dealer_code_in_scope(dealer_code).
--
-- Scope:
-- 1) Backfill from linked service_reception_entries.dealer_code.
-- 2) Fallback backfill from linked bodyshop_repair_cards + reception linkage.
-- 3) Data-only correction; no schema changes.

BEGIN;

-- Pass 1: canonicalize from direct reception linkage.
UPDATE public.bodyshop_assignments AS ba
SET dealer_code = btrim(sre.dealer_code)
FROM public.service_reception_entries AS sre
WHERE ba.reception_entry_id = sre.id
  AND nullif(btrim(coalesce(sre.dealer_code, '')), '') IS NOT NULL
  AND btrim(coalesce(ba.dealer_code, '')) IS DISTINCT FROM btrim(coalesce(sre.dealer_code, ''));

-- Pass 2: fallback via repair card linkage where direct reception id may be stale/missing.
WITH resolved AS (
  SELECT
    ba.id,
    coalesce(
      nullif(btrim(coalesce(sre.dealer_code, '')), ''),
      nullif(upper(btrim(split_part(coalesce(brc.sa_employee_code, ''), '_', 2))), ''),
      nullif(upper(btrim(split_part(coalesce(brc.sa_employee_code, ''), '_', 1))), '')
    ) AS resolved_dealer_code
  FROM public.bodyshop_assignments AS ba
  JOIN public.bodyshop_repair_cards AS brc
    ON brc.id = ba.repair_card_id
  LEFT JOIN public.service_reception_entries AS sre
    ON sre.id = brc.reception_entry_id
)
UPDATE public.bodyshop_assignments AS ba
SET dealer_code = r.resolved_dealer_code
FROM resolved AS r
WHERE ba.id = r.id
  AND r.resolved_dealer_code IS NOT NULL
  AND btrim(coalesce(ba.dealer_code, '')) IS DISTINCT FROM btrim(coalesce(r.resolved_dealer_code, ''));

COMMIT;
