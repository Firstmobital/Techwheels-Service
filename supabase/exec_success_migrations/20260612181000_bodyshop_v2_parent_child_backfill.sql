BEGIN;

-- Phase 1: Add parent-link columns and backfill without breaking existing data.
-- This migration is additive and safe to run before strict NOT NULL enforcement.

ALTER TABLE public.bodyshop_intake_vehicle_photos
  ADD COLUMN IF NOT EXISTS repair_card_id integer;

ALTER TABLE public.bodyshop_assignments
  ADD COLUMN IF NOT EXISTS repair_card_id integer,
  ADD COLUMN IF NOT EXISTS reception_entry_id bigint,
  ADD COLUMN IF NOT EXISTS dealer_code text;

-- Backfill intake photo -> repair card via canonical reception_entry_id first.
WITH latest_card AS (
  SELECT DISTINCT ON (c.reception_entry_id)
    c.reception_entry_id,
    c.id AS repair_card_id
  FROM public.bodyshop_repair_cards c
  WHERE c.reception_entry_id IS NOT NULL
  ORDER BY c.reception_entry_id, c.updated_at DESC, c.id DESC
)
UPDATE public.bodyshop_intake_vehicle_photos p
SET repair_card_id = lc.repair_card_id
FROM latest_card lc
WHERE p.reception_entry_id = lc.reception_entry_id
  AND p.repair_card_id IS NULL;

-- Fallback for old rows: job card number match.
WITH latest_card AS (
  SELECT DISTINCT ON (upper(btrim(c.job_card_no)))
    upper(btrim(c.job_card_no)) AS job_card_norm,
    c.id AS repair_card_id
  FROM public.bodyshop_repair_cards c
  WHERE nullif(btrim(c.job_card_no), '') IS NOT NULL
  ORDER BY upper(btrim(c.job_card_no)), c.updated_at DESC, c.id DESC
)
UPDATE public.bodyshop_intake_vehicle_photos p
SET repair_card_id = lc.repair_card_id
FROM latest_card lc
WHERE upper(btrim(p.job_card_no)) = lc.job_card_norm
  AND p.repair_card_id IS NULL;

-- Backfill assignments -> repair card by job card number.
WITH latest_card AS (
  SELECT DISTINCT ON (upper(btrim(c.job_card_no)))
    upper(btrim(c.job_card_no)) AS job_card_norm,
    c.id AS repair_card_id
  FROM public.bodyshop_repair_cards c
  WHERE nullif(btrim(c.job_card_no), '') IS NOT NULL
  ORDER BY upper(btrim(c.job_card_no)), c.updated_at DESC, c.id DESC
)
UPDATE public.bodyshop_assignments a
SET repair_card_id = lc.repair_card_id
FROM latest_card lc
WHERE upper(btrim(a.job_card_number)) = lc.job_card_norm
  AND a.repair_card_id IS NULL;

-- Backfill assignments reception/dealer through parent repair card.
UPDATE public.bodyshop_assignments a
SET reception_entry_id = c.reception_entry_id,
    dealer_code = COALESCE(
      NULLIF(btrim(a.dealer_code), ''),
      sre.dealer_code,
      public.my_dealer_code()
    )
FROM public.bodyshop_repair_cards c
LEFT JOIN public.service_reception_entries sre ON sre.id = c.reception_entry_id
WHERE a.repair_card_id = c.id
  AND (
    a.reception_entry_id IS DISTINCT FROM c.reception_entry_id
    OR a.dealer_code IS NULL
    OR btrim(a.dealer_code) = ''
  );

-- Ensure no blank dealer codes remain in assignments.
UPDATE public.bodyshop_assignments
SET dealer_code = public.my_dealer_code()
WHERE dealer_code IS NULL OR btrim(dealer_code) = '';

-- Align intake photo dealer codes to reception dealer when available.
UPDATE public.bodyshop_intake_vehicle_photos p
SET dealer_code = sre.dealer_code
FROM public.service_reception_entries sre
WHERE p.reception_entry_id = sre.id
  AND (p.dealer_code IS NULL OR btrim(p.dealer_code) = '' OR p.dealer_code <> sre.dealer_code);

-- Align docs table reception/dealer from parent repair card when missing.
UPDATE public.bodyshop_repair_card_documents d
SET reception_entry_id = c.reception_entry_id,
    dealer_code = COALESCE(
      NULLIF(btrim(d.dealer_code), ''),
      sre.dealer_code,
      public.my_dealer_code()
    )
FROM public.bodyshop_repair_cards c
LEFT JOIN public.service_reception_entries sre ON sre.id = c.reception_entry_id
WHERE d.repair_card_id = c.id
  AND (
    d.reception_entry_id IS NULL
    OR d.dealer_code IS NULL
    OR btrim(d.dealer_code) = ''
  );

-- Performance indexes for strict parent-child operations.
CREATE INDEX IF NOT EXISTS idx_bodyshop_intake_vehicle_photos_repair_card_id
  ON public.bodyshop_intake_vehicle_photos (repair_card_id);

CREATE INDEX IF NOT EXISTS idx_bodyshop_assignments_repair_card_id
  ON public.bodyshop_assignments (repair_card_id);

CREATE INDEX IF NOT EXISTS idx_bodyshop_assignments_reception_entry_id
  ON public.bodyshop_assignments (reception_entry_id);

CREATE INDEX IF NOT EXISTS idx_bodyshop_assignments_dealer_code
  ON public.bodyshop_assignments (dealer_code);

-- Add FKs as NOT VALID first to avoid blocking legacy data; validated in strict phase.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bodyshop_intake_vehicle_photos_repair_card_id_fkey'
      AND conrelid = 'public.bodyshop_intake_vehicle_photos'::regclass
  ) THEN
    ALTER TABLE public.bodyshop_intake_vehicle_photos
      ADD CONSTRAINT bodyshop_intake_vehicle_photos_repair_card_id_fkey
      FOREIGN KEY (repair_card_id)
      REFERENCES public.bodyshop_repair_cards(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bodyshop_assignments_repair_card_id_fkey'
      AND conrelid = 'public.bodyshop_assignments'::regclass
  ) THEN
    ALTER TABLE public.bodyshop_assignments
      ADD CONSTRAINT bodyshop_assignments_repair_card_id_fkey
      FOREIGN KEY (repair_card_id)
      REFERENCES public.bodyshop_repair_cards(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bodyshop_assignments_reception_entry_id_fkey'
      AND conrelid = 'public.bodyshop_assignments'::regclass
  ) THEN
    ALTER TABLE public.bodyshop_assignments
      ADD CONSTRAINT bodyshop_assignments_reception_entry_id_fkey
      FOREIGN KEY (reception_entry_id)
      REFERENCES public.service_reception_entries(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
