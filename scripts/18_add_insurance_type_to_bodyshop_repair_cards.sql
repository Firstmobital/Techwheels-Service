-- Add manual insurance type capture for Bodyshop SA Documentation stage.
-- Authoritative source audited from local_folder/backups/chunks/full_database.sql.part_000
-- where public.bodyshop_repair_cards has insurance_policy_no, insurance_company,
-- and insurance_valid_date but no insurance_type column.

ALTER TABLE public.bodyshop_repair_cards
ADD COLUMN IF NOT EXISTS insurance_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bodyshop_repair_cards_insurance_type_check'
      AND conrelid = 'public.bodyshop_repair_cards'::regclass
  ) THEN
    ALTER TABLE public.bodyshop_repair_cards
      ADD CONSTRAINT bodyshop_repair_cards_insurance_type_check
      CHECK (
        insurance_type IS NULL
        OR insurance_type IN ('TMI', 'Non-TMI')
      );
  END IF;
END $$;
