BEGIN;

-- Phase 3: Strict parent-child enforcement.
-- This migration intentionally fails fast if unresolved legacy rows still exist.

DO $$
DECLARE
  v_unlinked_intake bigint;
  v_unlinked_assignments bigint;
BEGIN
  SELECT COUNT(*)
    INTO v_unlinked_intake
  FROM public.bodyshop_intake_vehicle_photos
  WHERE repair_card_id IS NULL;

  SELECT COUNT(*)
    INTO v_unlinked_assignments
  FROM public.bodyshop_assignments
  WHERE repair_card_id IS NULL;

  IF v_unlinked_intake > 0 OR v_unlinked_assignments > 0 THEN
    RAISE EXCEPTION
      'Strict enforcement blocked. Unlinked rows found: intake_photos=%, assignments=%. Resolve links and rerun.',
      v_unlinked_intake,
      v_unlinked_assignments;
  END IF;
END $$;

-- Validate FK constraints introduced in phase 1.
ALTER TABLE public.bodyshop_intake_vehicle_photos
  VALIDATE CONSTRAINT bodyshop_intake_vehicle_photos_repair_card_id_fkey;

ALTER TABLE public.bodyshop_assignments
  VALIDATE CONSTRAINT bodyshop_assignments_repair_card_id_fkey;

ALTER TABLE public.bodyshop_assignments
  VALIDATE CONSTRAINT bodyshop_assignments_reception_entry_id_fkey;

-- Enforce strict parent-child contract.
ALTER TABLE public.bodyshop_intake_vehicle_photos
  ALTER COLUMN repair_card_id SET NOT NULL;

ALTER TABLE public.bodyshop_assignments
  ALTER COLUMN repair_card_id SET NOT NULL;

ALTER TABLE public.bodyshop_assignments
  ALTER COLUMN dealer_code SET NOT NULL;

-- Ensure reception linkage is index-backed on every bodyshop child table.
CREATE INDEX IF NOT EXISTS idx_bodyshop_repair_card_documents_reception
  ON public.bodyshop_repair_card_documents (reception_entry_id);

CREATE INDEX IF NOT EXISTS idx_bodyshop_intake_vehicle_photos_reception_entry
  ON public.bodyshop_intake_vehicle_photos (reception_entry_id);

CREATE INDEX IF NOT EXISTS idx_bodyshop_assignments_reception_entry
  ON public.bodyshop_assignments (reception_entry_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
